import { parseIcs, type IcsRecurrenceRule } from "@moltenship/ics";
import { describe, expect, test } from "vite-plus/test";

import {
  formatRecurrenceRule,
  parseRecurrenceRule,
  recurrenceRuleFromIcs,
  recurrenceRuleToIcs,
  type RecurrenceRuleTextResult,
} from "../../src/rule/text";
import type { RecurrenceRule } from "../../src/types";

/**
 * Temporal objects have no own properties, so `toEqual` would call any two of them equal. This
 * replaces each with its type and ISO form, deeply.
 */
function plain(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plain);
  if (value === null || typeof value !== "object") return value;
  const tag = Object.prototype.toString.call(value);
  if (tag.startsWith("[object Temporal.")) {
    return `${tag.slice(8, -1)} ${(value as { toString(): string }).toString()}`;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plain(item)]));
}

/** The rule of a clean parse: no issues at all. */
function parsed(text: string): RecurrenceRule {
  const { issues, rule } = parseRecurrenceRule(text);
  expect(issues).toEqual([]);
  expect(rule).toBeDefined();
  return rule!;
}

/** The single error of a parse that gave no rule. */
function rejected(result: RecurrenceRuleTextResult) {
  expect(result).not.toHaveProperty("rule");
  const errors = result.issues.filter(({ severity }) => severity === "error");
  expect(errors).toHaveLength(1);
  return errors[0]!;
}

const instant = (text: string) => Temporal.Instant.from(text);
const date = (text: string) => Temporal.PlainDate.from(text);
const dateTime = (text: string) => Temporal.PlainDateTime.from(text);

describe("parseRecurrenceRule", () => {
  test.each([
    "FREQ=WEEKLY;BYDAY=MO",
    "RRULE:FREQ=WEEKLY;BYDAY=MO",
    "rrule:freq=weekly;byday=mo",
    "Rrule:FREQ=WEEKLY;BYDAY=MO",
    "  RRULE:FREQ=WEEKLY;BYDAY=MO \r\n",
    "RRULE;X-NAME=1:FREQ=WEEKLY;BYDAY=MO",
    "RRULE: FREQ=WEEKLY;BYDAY=MO",
    "\tFREQ=WEEKLY;BYDAY=MO;",
  ])("reads %j", (text) => {
    expect(parsed(text)).toEqual({ byDay: [{ weekday: "MO" }], frequency: "WEEKLY" });
  });

  test("reads UNTIL in its own kind: DATE, UTC DATE-TIME or floating DATE-TIME", () => {
    expect(plain(parsed("FREQ=DAILY;UNTIL=20261231").until)).toBe("Temporal.PlainDate 2026-12-31");
    expect(plain(parsed("FREQ=DAILY;UNTIL=20261231T230000Z").until)).toBe(
      "Temporal.Instant 2026-12-31T23:00:00Z",
    );
    expect(plain(parsed("FREQ=DAILY;UNTIL=20261231T235959").until)).toBe(
      "Temporal.PlainDateTime 2026-12-31T23:59:59",
    );
  });

  test.each(["", "   ", "RRULE:", "garbage", "COUNT=5;INTERVAL=2", "RRULE:BYDAY=MO"])(
    "gives no rule for %j, which has no FREQ",
    (text) => {
      expect(rejected(parseRecurrenceRule(text))).toEqual({
        code: "invalid-value",
        message: expect.stringMatching(/no FREQ/),
        severity: "error",
      });
    },
  );

  test.each(["FREQ=FORTNIGHTLY;COUNT=2", "FREQ=", "RRULE:freq=x;FREQ=DAILY"])(
    "gives no rule for %j, whose FREQ isn't a frequency",
    (text) => {
      const error = rejected(parseRecurrenceRule(text));
      expect(error.code).toBe("invalid-value");
      expect(error.message).toMatch(/isn't a recurrence frequency/);
    },
  );

  test.each([
    "EXDATE:20260101T090000Z",
    "EXDATE;VALUE=DATE:20260101",
    "RDATE;TZID=Europe/Berlin:20260101T090000",
    "EXRULE:FREQ=DAILY",
    "RRULE:RRULE:FREQ=DAILY",
    "DTSTART:20260101T090000Z",
  ])("gives no rule for %j, which isn't an RRULE", (text) => {
    expect(rejected(parseRecurrenceRule(text))).toEqual({
      code: "invalid-value",
      message: expect.stringMatching(/isn't an RRULE/),
      severity: "error",
    });
  });

  test("keeps the rest of a rule whose invalid parts it drops, with warnings", () => {
    const { issues, rule } = parseRecurrenceRule(
      "FREQ=MONTHLY;BYDAY=XX;COUNT=0;BYMONTHDAY=0;INTERVAL=2;UNTIL=tomorrow;NOEQUALS",
    );
    expect(rule).toEqual({ frequency: "MONTHLY", interval: 2 });
    expect(issues).toHaveLength(5);
    for (const issue of issues) {
      expect(issue).toEqual({
        code: "invalid-value",
        message: expect.stringMatching(/^dropped /),
        severity: "warning",
      });
    }
  });

  test("keeps the first of a repeated part, with a warning", () => {
    const { issues, rule } = parseRecurrenceRule("FREQ=DAILY;COUNT=2;COUNT=3");
    expect(rule).toEqual({ count: 2, frequency: "DAILY" });
    expect(issues).toEqual([
      { code: "invalid-value", message: expect.stringMatching(/first/), severity: "warning" },
    ]);
  });

  test("passes on UNTIL's own warnings", () => {
    const { issues, rule } = parseRecurrenceRule("FREQ=DAILY;UNTIL=20261231T2300z");
    expect(plain(rule?.until)).toBe("Temporal.Instant 2026-12-31T23:00:00Z");
    expect(issues).toEqual([
      {
        code: "invalid-value",
        message: expect.stringMatching(/^UNTIL: no seconds/),
        severity: "warning",
      },
    ]);
  });

  test("ignores parts it doesn't support, with a warning", () => {
    const { issues, rule } = parseRecurrenceRule(
      "RSCALE=HEBREW;FREQ=YEARLY;SKIP=FORWARD;BYMONTH=5",
    );
    expect(rule).toEqual({ byMonth: [5], frequency: "YEARLY" });
    expect(issues).toEqual([
      {
        code: "unsupported",
        message: expect.stringMatching(/RSCALE, SKIP/),
        severity: "warning",
      },
    ]);
  });

  test("keeps COUNT with UNTIL, warning as the ics decoder does", () => {
    const { issues, rule } = parseRecurrenceRule("FREQ=DAILY;COUNT=5;UNTIL=20261231");
    expect(plain(rule)).toEqual({
      count: 5,
      frequency: "DAILY",
      until: "Temporal.PlainDate 2026-12-31",
    });
    expect(issues).toEqual([
      {
        code: "conflicting-properties",
        message: expect.stringMatching(/COUNT with UNTIL/),
        severity: "warning",
      },
    ]);
  });
});

describe("recurrenceRuleFromIcs", () => {
  const wallTime = dateTime("2026-12-31T09:00");

  test("reads a zoned UNTIL as the instant it names", () => {
    const { issues, rule } = recurrenceRuleFromIcs({
      frequency: "DAILY",
      until: {
        kind: "zoned",
        tzid: "Europe/Berlin",
        wallTime,
        zoned: wallTime.toZonedDateTime("Europe/Berlin"),
      },
    });
    expect(issues).toEqual([]);
    expect(plain(rule)).toEqual({
      frequency: "DAILY",
      until: "Temporal.Instant 2026-12-31T08:00:00Z",
    });
  });

  test("gives no rule for an UNTIL whose TZID resolved to nothing, rather than an endless one", () => {
    expect(
      rejected(
        recurrenceRuleFromIcs({
          frequency: "DAILY",
          until: { kind: "unresolved", tzid: "Mars/Olympus_Mons", wallTime },
        }),
      ),
    ).toEqual({
      code: "unknown-time-zone",
      message: expect.stringContaining('"Mars/Olympus_Mons"'),
      severity: "error",
    });
  });

  test("keeps COUNT with UNTIL", () => {
    const { issues, rule } = recurrenceRuleFromIcs({
      count: 3,
      frequency: "DAILY",
      until: { date: date("2026-12-31"), kind: "date" },
    });
    expect(issues).toEqual([]);
    expect(plain(rule)).toEqual({
      count: 3,
      frequency: "DAILY",
      until: "Temporal.PlainDate 2026-12-31",
    });
  });

  test("reads the RRULE of a parsed event", () => {
    const [event] = parseIcs(
      [
        "BEGIN:VCALENDAR",
        "BEGIN:VEVENT",
        "UID:standup",
        "DTSTART;TZID=Europe/Berlin:20261001T090000",
        "RRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20261231T080000Z",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    ).calendars[0]!.events;

    expect(plain(recurrenceRuleFromIcs(event!.recurrenceRule!))).toEqual({
      issues: [],
      rule: {
        byDay: [{ weekday: "TH" }],
        frequency: "WEEKLY",
        until: "Temporal.Instant 2026-12-31T08:00:00Z",
      },
    });
  });
});

describe("formatRecurrenceRule", () => {
  // [text, canonical]: every FREQ, every BY part with negative values, ordinals, WKST, COUNT and
  // each kind of UNTIL. The canonical form is RFC 5545's grammar order, FREQ first.
  const CANONICAL: [string, string][] = [
    ["FREQ=SECONDLY;BYSECOND=0,30,60", "FREQ=SECONDLY;BYSECOND=0,30,60"],
    ["FREQ=MINUTELY;INTERVAL=15;BYMINUTE=0,59", "FREQ=MINUTELY;INTERVAL=15;BYMINUTE=0,59"],
    ["FREQ=HOURLY;BYHOUR=0,9,23;COUNT=8", "FREQ=HOURLY;COUNT=8;BYHOUR=0,9,23"],
    ["FREQ=DAILY", "FREQ=DAILY"],
    ["freq=weekly;wkst=su;byday=tu,th;interval=2", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH;WKST=SU"],
    [
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=1,-1,-31;BYDAY=+1MO,-1FR",
      "FREQ=MONTHLY;BYDAY=1MO,-1FR;BYMONTHDAY=1,-1,-31",
    ],
    [
      "FREQ=MONTHLY;BYSETPOS=-1,1;BYDAY=MO,TU,WE,TH,FR",
      "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1,1",
    ],
    [
      "FREQ=YEARLY;BYMONTH=1,12;BYWEEKNO=20,-53;BYYEARDAY=1,-1,-366;BYDAY=53MO,-53SU,+2TU",
      "FREQ=YEARLY;BYDAY=53MO,-53SU,2TU;BYYEARDAY=1,-1,-366;BYWEEKNO=20,-53;BYMONTH=1,12",
    ],
    ["FREQ=DAILY;UNTIL=20261231", "FREQ=DAILY;UNTIL=20261231"],
    ["FREQ=DAILY;UNTIL=20261231T230000Z", "FREQ=DAILY;UNTIL=20261231T230000Z"],
    ["FREQ=DAILY;UNTIL=20261231T235959", "FREQ=DAILY;UNTIL=20261231T235959"],
    ["FREQ=DAILY;UNTIL=20261231t2359", "FREQ=DAILY;UNTIL=20261231T235900"],
    [
      "WKST=SU;BYSETPOS=1;BYMONTH=3,10;BYWEEKNO=-1;BYYEARDAY=-100;BYMONTHDAY=-7;BYDAY=-1SU;BYHOUR=9;BYMINUTE=30;BYSECOND=0;INTERVAL=2;UNTIL=20301231T230000Z;FREQ=YEARLY",
      "FREQ=YEARLY;UNTIL=20301231T230000Z;INTERVAL=2;BYSECOND=0;BYMINUTE=30;BYHOUR=9;BYDAY=-1SU;BYMONTHDAY=-7;BYYEARDAY=-100;BYWEEKNO=-1;BYMONTH=3,10;BYSETPOS=1;WKST=SU",
    ],
  ];

  test.each(CANONICAL)("writes %s as %s", (text, canonical) => {
    const { rule } = parseRecurrenceRule(text);
    expect(formatRecurrenceRule(rule!)).toBe(canonical);
    expect(parsed(canonical)).toEqual(rule);
    expect(plain(parsed(canonical))).toEqual(plain(rule));
  });

  // Every part and every kind of UNTIL, each reading back as itself.
  const RULES: RecurrenceRule[] = [
    { frequency: "SECONDLY", interval: 30 },
    { byMinute: [0, 30], frequency: "MINUTELY" },
    { byHour: [9, 17], count: 10, frequency: "HOURLY" },
    { frequency: "DAILY", until: date("2026-12-31") },
    { frequency: "DAILY", until: instant("2026-12-31T22:59:59Z") },
    { frequency: "DAILY", until: dateTime("2026-12-31T23:59:59") },
    {
      byDay: [{ weekday: "MO" }, { weekday: "FR" }],
      frequency: "WEEKLY",
      interval: 2,
      weekStart: "SU",
    },
    {
      byDay: [
        { ordinal: 1, weekday: "MO" },
        { ordinal: -1, weekday: "FR" },
      ],
      byMonthDay: [1, -1],
      bySetPosition: [-1],
      frequency: "MONTHLY",
      until: instant("2030-01-01T00:00:00Z"),
    },
    {
      byDay: [{ ordinal: -53, weekday: "SU" }],
      byHour: [0],
      byMinute: [15],
      byMonth: [2, 12],
      byMonthDay: [-31, 31],
      bySecond: [0, 60],
      bySetPosition: [366, -366],
      byWeekNumber: [-53, 1],
      byYearDay: [-366, 1],
      count: 3,
      frequency: "YEARLY",
      interval: 4,
      weekStart: "WE",
    },
  ];

  test.each(RULES.map((rule) => [formatRecurrenceRule(rule), rule] as const))(
    "reads %s back as the rule it came from",
    (text, rule) => {
      const back = parsed(text);
      expect(plain(back)).toEqual(plain(rule));
      if (rule.until !== undefined) expect(String(back.until)).toBe(String(rule.until));
      expect(parsed(`RRULE:${text}`)).toEqual(back);
    },
  );

  test("writes an UNTIL instant in UTC, whatever zone it was made in", () => {
    const until = Temporal.ZonedDateTime.from("2026-12-31T23:59:59+01:00[Europe/Berlin]");
    expect(formatRecurrenceRule({ frequency: "DAILY", until: until.toInstant() })).toBe(
      "FREQ=DAILY;UNTIL=20261231T225959Z",
    );
  });

  test("drops UNTIL's fractional seconds, which keeps every whole-second occurrence", () => {
    expect(
      formatRecurrenceRule({ frequency: "DAILY", until: instant("2026-12-31T22:59:59.999Z") }),
    ).toBe("FREQ=DAILY;UNTIL=20261231T225959Z");
    expect(
      formatRecurrenceRule({ frequency: "DAILY", until: instant("1969-12-31T23:59:59.5Z") }),
    ).toBe("FREQ=DAILY;UNTIL=19691231T235959Z");
    expect(
      formatRecurrenceRule({
        frequency: "DAILY",
        until: dateTime("2026-12-31T23:59:59.999999999"),
      }),
    ).toBe("FREQ=DAILY;UNTIL=20261231T235959");
  });

  test("writes UNTIL in the ISO calendar, as iCalendar's dates are Gregorian", () => {
    expect(
      formatRecurrenceRule({
        frequency: "DAILY",
        until: date("2026-12-31").withCalendar("hebrew"),
      }),
    ).toBe("FREQ=DAILY;UNTIL=20261231");
    expect(
      formatRecurrenceRule({
        frequency: "DAILY",
        until: dateTime("2026-12-31T09:00").withCalendar("japanese"),
      }),
    ).toBe("FREQ=DAILY;UNTIL=20261231T090000");
  });

  test("throws for an UNTIL iCalendar can't write", () => {
    expect(() =>
      formatRecurrenceRule({ frequency: "DAILY", until: date("+010000-01-01") }),
    ).toThrow(RangeError);
  });
});

describe("recurrenceRuleToIcs", () => {
  test("gives each kind of UNTIL its ICS kind", () => {
    const rules: [RecurrenceRule, IcsRecurrenceRule][] = [
      [
        { frequency: "DAILY", until: date("2026-12-31") },
        { frequency: "DAILY", until: { date: date("2026-12-31"), kind: "date" } },
      ],
      [
        { frequency: "DAILY", until: instant("2026-12-31T23:00:00Z") },
        { frequency: "DAILY", until: { instant: instant("2026-12-31T23:00:00Z"), kind: "utc" } },
      ],
      [
        { frequency: "DAILY", until: dateTime("2026-12-31T23:00") },
        { frequency: "DAILY", until: { kind: "floating", wallTime: dateTime("2026-12-31T23:00") } },
      ],
      [
        { count: 2, frequency: "DAILY" },
        { count: 2, frequency: "DAILY" },
      ],
    ];
    for (const [rule, ics] of rules) {
      expect(plain(recurrenceRuleToIcs(rule))).toEqual(plain(ics));
      expect(plain(recurrenceRuleFromIcs(ics))).toEqual({ issues: [], rule: plain(rule) });
    }
  });
});

describe("RFC 5545 §3.8.5.3 examples", () => {
  const WEEKDAYS = (["MO", "TU", "WE", "TH", "FR"] as const).map((weekday) => ({ weekday }));

  const EXAMPLES: [string, RecurrenceRule, string][] = [
    ["RRULE:FREQ=DAILY;COUNT=10", { count: 10, frequency: "DAILY" }, "FREQ=DAILY;COUNT=10"],
    [
      "RRULE:FREQ=DAILY;UNTIL=19971224T000000Z",
      { frequency: "DAILY", until: instant("1997-12-24T00:00:00Z") },
      "FREQ=DAILY;UNTIL=19971224T000000Z",
    ],
    [
      "RRULE:FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH",
      {
        byDay: [{ weekday: "TU" }, { weekday: "TH" }],
        frequency: "WEEKLY",
        until: instant("1997-10-07T00:00:00Z"),
        weekStart: "SU",
      },
      "FREQ=WEEKLY;UNTIL=19971007T000000Z;BYDAY=TU,TH;WKST=SU",
    ],
    [
      "RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU",
      {
        byDay: [
          { ordinal: 1, weekday: "SU" },
          { ordinal: -1, weekday: "SU" },
        ],
        count: 10,
        frequency: "MONTHLY",
        interval: 2,
      },
      "FREQ=MONTHLY;COUNT=10;INTERVAL=2;BYDAY=1SU,-1SU",
    ],
    [
      "RRULE:FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200",
      { byYearDay: [1, 100, 200], count: 10, frequency: "YEARLY", interval: 3 },
      "FREQ=YEARLY;COUNT=10;INTERVAL=3;BYYEARDAY=1,100,200",
    ],
    [
      "RRULE:FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO",
      { byDay: [{ weekday: "MO" }], byWeekNumber: [20], frequency: "YEARLY" },
      "FREQ=YEARLY;BYDAY=MO;BYWEEKNO=20",
    ],
    [
      "RRULE:FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8",
      {
        byDay: [{ weekday: "TU" }],
        byMonth: [11],
        byMonthDay: [2, 3, 4, 5, 6, 7, 8],
        frequency: "YEARLY",
        interval: 4,
      },
      "FREQ=YEARLY;INTERVAL=4;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8;BYMONTH=11",
    ],
    [
      "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2",
      { byDay: WEEKDAYS, bySetPosition: [-2], frequency: "MONTHLY" },
      "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2",
    ],
    [
      "RRULE:FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T170000Z",
      { frequency: "HOURLY", interval: 3, until: instant("1997-09-02T17:00:00Z") },
      "FREQ=HOURLY;UNTIL=19970902T170000Z;INTERVAL=3",
    ],
    [
      "RRULE:FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16",
      { byHour: [9, 10, 11, 12, 13, 14, 15, 16], frequency: "MINUTELY", interval: 20 },
      "FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16",
    ],
    [
      "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU",
      {
        byDay: [{ weekday: "TU" }, { weekday: "SU" }],
        count: 4,
        frequency: "WEEKLY",
        interval: 2,
        weekStart: "SU",
      },
      "FREQ=WEEKLY;COUNT=4;INTERVAL=2;BYDAY=TU,SU;WKST=SU",
    ],
    [
      "RRULE:FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5",
      { byMonthDay: [15, 30], count: 5, frequency: "MONTHLY" },
      "FREQ=MONTHLY;COUNT=5;BYMONTHDAY=15,30",
    ],
  ];

  test.each(EXAMPLES)("reads %s", (text, rule, canonical) => {
    const read = parsed(text);
    expect(plain(read)).toEqual(plain(rule));
    expect(formatRecurrenceRule(read)).toBe(canonical);
  });
});
