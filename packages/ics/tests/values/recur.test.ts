import { describe, expect, test } from "vite-plus/test";

import type { IcsRecurrenceRule } from "../../src/types";
import { decodeIcsValue, encodeIcsValue } from "../../src/values";
import { decoded, lenient, plain, rejected, warningsOf } from "./helpers";

function utc(instant: string) {
  return { instant: Temporal.Instant.from(instant), kind: "utc" } as const;
}

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR"].map((weekday) => ({ weekday }));

// Every RRULE in RFC 5545 §3.3.10 and §3.8.5.3, in the order the RFC gives them.
const RFC_RULES: [string, IcsRecurrenceRule][] = [
  [
    "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1",
    {
      byDay: WEEKDAYS as IcsRecurrenceRule["byDay"],
      bySetPosition: [-1],
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=YEARLY;INTERVAL=2;BYMONTH=1;BYDAY=SU;BYHOUR=8,9;BYMINUTE=30",
    {
      byDay: [{ weekday: "SU" }],
      byHour: [8, 9],
      byMinute: [30],
      byMonth: [1],
      frequency: "YEARLY",
      interval: 2,
    },
  ],
  ["FREQ=DAILY;COUNT=10;INTERVAL=2", { count: 10, frequency: "DAILY", interval: 2 }],
  ["FREQ=DAILY;COUNT=10", { count: 10, frequency: "DAILY" }],
  ["FREQ=DAILY;UNTIL=19971224T000000Z", { frequency: "DAILY", until: utc("1997-12-24T00:00:00Z") }],
  ["FREQ=DAILY;INTERVAL=2", { frequency: "DAILY", interval: 2 }],
  ["FREQ=DAILY;INTERVAL=10;COUNT=5", { count: 5, frequency: "DAILY", interval: 10 }],
  [
    "FREQ=YEARLY;UNTIL=20000131T140000Z;BYMONTH=1;BYDAY=SU,MO,TU,WE,TH,FR,SA",
    {
      byDay: ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map((weekday) => ({
        weekday,
      })) as IcsRecurrenceRule["byDay"],
      byMonth: [1],
      frequency: "YEARLY",
      until: utc("2000-01-31T14:00:00Z"),
    },
  ],
  [
    "FREQ=DAILY;UNTIL=20000131T140000Z;BYMONTH=1",
    {
      byMonth: [1],
      frequency: "DAILY",
      until: utc("2000-01-31T14:00:00Z"),
    },
  ],
  ["FREQ=WEEKLY;COUNT=10", { count: 10, frequency: "WEEKLY" }],
  [
    "FREQ=WEEKLY;UNTIL=19971224T000000Z",
    { frequency: "WEEKLY", until: utc("1997-12-24T00:00:00Z") },
  ],
  ["FREQ=WEEKLY;INTERVAL=2;WKST=SU", { frequency: "WEEKLY", interval: 2, weekStart: "SU" }],
  [
    "FREQ=WEEKLY;UNTIL=19971007T000000Z;WKST=SU;BYDAY=TU,TH",
    {
      byDay: [{ weekday: "TU" }, { weekday: "TH" }],
      frequency: "WEEKLY",
      until: utc("1997-10-07T00:00:00Z"),
      weekStart: "SU",
    },
  ],
  [
    "FREQ=WEEKLY;COUNT=10;WKST=SU;BYDAY=TU,TH",
    {
      byDay: [{ weekday: "TU" }, { weekday: "TH" }],
      count: 10,
      frequency: "WEEKLY",
      weekStart: "SU",
    },
  ],
  [
    "FREQ=WEEKLY;INTERVAL=2;UNTIL=19971224T000000Z;WKST=SU;BYDAY=MO,WE,FR",
    {
      byDay: [{ weekday: "MO" }, { weekday: "WE" }, { weekday: "FR" }],
      frequency: "WEEKLY",
      interval: 2,
      until: utc("1997-12-24T00:00:00Z"),
      weekStart: "SU",
    },
  ],
  [
    "FREQ=WEEKLY;INTERVAL=2;COUNT=8;WKST=SU;BYDAY=TU,TH",
    {
      byDay: [{ weekday: "TU" }, { weekday: "TH" }],
      count: 8,
      frequency: "WEEKLY",
      interval: 2,
      weekStart: "SU",
    },
  ],
  [
    "FREQ=MONTHLY;COUNT=10;BYDAY=1FR",
    {
      byDay: [{ ordinal: 1, weekday: "FR" }],
      count: 10,
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=MONTHLY;UNTIL=19971224T000000Z;BYDAY=1FR",
    {
      byDay: [{ ordinal: 1, weekday: "FR" }],
      frequency: "MONTHLY",
      until: utc("1997-12-24T00:00:00Z"),
    },
  ],
  [
    "FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=1SU,-1SU",
    {
      byDay: [
        { ordinal: 1, weekday: "SU" },
        { ordinal: -1, weekday: "SU" },
      ],
      count: 10,
      frequency: "MONTHLY",
      interval: 2,
    },
  ],
  [
    "FREQ=MONTHLY;COUNT=6;BYDAY=-2MO",
    {
      byDay: [{ ordinal: -2, weekday: "MO" }],
      count: 6,
      frequency: "MONTHLY",
    },
  ],
  ["FREQ=MONTHLY;BYMONTHDAY=-3", { byMonthDay: [-3], frequency: "MONTHLY" }],
  [
    "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=2,15",
    { byMonthDay: [2, 15], count: 10, frequency: "MONTHLY" },
  ],
  [
    "FREQ=MONTHLY;COUNT=10;BYMONTHDAY=1,-1",
    { byMonthDay: [1, -1], count: 10, frequency: "MONTHLY" },
  ],
  [
    "FREQ=MONTHLY;INTERVAL=18;COUNT=10;BYMONTHDAY=10,11,12,13,14,15",
    {
      byMonthDay: [10, 11, 12, 13, 14, 15],
      count: 10,
      frequency: "MONTHLY",
      interval: 18,
    },
  ],
  [
    "FREQ=MONTHLY;INTERVAL=2;BYDAY=TU",
    {
      byDay: [{ weekday: "TU" }],
      frequency: "MONTHLY",
      interval: 2,
    },
  ],
  ["FREQ=YEARLY;COUNT=10;BYMONTH=6,7", { byMonth: [6, 7], count: 10, frequency: "YEARLY" }],
  [
    "FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=1,2,3",
    {
      byMonth: [1, 2, 3],
      count: 10,
      frequency: "YEARLY",
      interval: 2,
    },
  ],
  [
    "FREQ=YEARLY;INTERVAL=3;COUNT=10;BYYEARDAY=1,100,200",
    {
      byYearDay: [1, 100, 200],
      count: 10,
      frequency: "YEARLY",
      interval: 3,
    },
  ],
  ["FREQ=YEARLY;BYDAY=20MO", { byDay: [{ ordinal: 20, weekday: "MO" }], frequency: "YEARLY" }],
  [
    "FREQ=YEARLY;BYWEEKNO=20;BYDAY=MO",
    {
      byDay: [{ weekday: "MO" }],
      byWeekNumber: [20],
      frequency: "YEARLY",
    },
  ],
  [
    "FREQ=YEARLY;BYMONTH=3;BYDAY=TH",
    {
      byDay: [{ weekday: "TH" }],
      byMonth: [3],
      frequency: "YEARLY",
    },
  ],
  [
    "FREQ=YEARLY;BYDAY=TH;BYMONTH=6,7,8",
    {
      byDay: [{ weekday: "TH" }],
      byMonth: [6, 7, 8],
      frequency: "YEARLY",
    },
  ],
  [
    "FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13",
    {
      byDay: [{ weekday: "FR" }],
      byMonthDay: [13],
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=MONTHLY;BYDAY=SA;BYMONTHDAY=7,8,9,10,11,12,13",
    {
      byDay: [{ weekday: "SA" }],
      byMonthDay: [7, 8, 9, 10, 11, 12, 13],
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=YEARLY;INTERVAL=4;BYMONTH=11;BYDAY=TU;BYMONTHDAY=2,3,4,5,6,7,8",
    {
      byDay: [{ weekday: "TU" }],
      byMonth: [11],
      byMonthDay: [2, 3, 4, 5, 6, 7, 8],
      frequency: "YEARLY",
      interval: 4,
    },
  ],
  [
    "FREQ=MONTHLY;COUNT=3;BYDAY=TU,WE,TH;BYSETPOS=3",
    {
      byDay: [{ weekday: "TU" }, { weekday: "WE" }, { weekday: "TH" }],
      bySetPosition: [3],
      count: 3,
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-2",
    {
      byDay: WEEKDAYS as IcsRecurrenceRule["byDay"],
      bySetPosition: [-2],
      frequency: "MONTHLY",
    },
  ],
  [
    "FREQ=HOURLY;INTERVAL=3;UNTIL=19970902T170000Z",
    {
      frequency: "HOURLY",
      interval: 3,
      until: utc("1997-09-02T17:00:00Z"),
    },
  ],
  ["FREQ=MINUTELY;INTERVAL=15;COUNT=6", { count: 6, frequency: "MINUTELY", interval: 15 }],
  ["FREQ=MINUTELY;INTERVAL=90;COUNT=4", { count: 4, frequency: "MINUTELY", interval: 90 }],
  [
    "FREQ=DAILY;BYHOUR=9,10,11,12,13,14,15,16;BYMINUTE=0,20,40",
    {
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
      byMinute: [0, 20, 40],
      frequency: "DAILY",
    },
  ],
  [
    "FREQ=MINUTELY;INTERVAL=20;BYHOUR=9,10,11,12,13,14,15,16",
    {
      byHour: [9, 10, 11, 12, 13, 14, 15, 16],
      frequency: "MINUTELY",
      interval: 20,
    },
  ],
  [
    "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO",
    {
      byDay: [{ weekday: "TU" }, { weekday: "SU" }],
      count: 4,
      frequency: "WEEKLY",
      interval: 2,
      weekStart: "MO",
    },
  ],
  [
    "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU",
    {
      byDay: [{ weekday: "TU" }, { weekday: "SU" }],
      count: 4,
      frequency: "WEEKLY",
      interval: 2,
      weekStart: "SU",
    },
  ],
  [
    "FREQ=MONTHLY;BYMONTHDAY=15,30;COUNT=5",
    { byMonthDay: [15, 30], count: 5, frequency: "MONTHLY" },
  ],
];

function rule(raw: string): IcsRecurrenceRule {
  return decoded(decodeIcsValue("RECUR", raw));
}

describe("RECUR", () => {
  test.each(RFC_RULES)("reads RFC 5545's %s", (raw, expected) => {
    const value = rule(raw);
    expect(plain(value)).toEqual(plain(expected));
    expect(plain(rule(encodeIcsValue("RECUR", value)))).toEqual(plain(expected));
  });

  test("reads parts in any order and any case", () => {
    expect(plain(rule("byday=-1fr;Interval=3;freq=monthly;until=20261231"))).toEqual({
      byDay: [{ ordinal: -1, weekday: "FR" }],
      frequency: "MONTHLY",
      interval: 3,
      until: { date: "Temporal.PlainDate 2026-12-31", kind: "date" },
    });
  });

  test("reads UNTIL by its shape, without a time zone", () => {
    expect(plain(rule("FREQ=DAILY;UNTIL=19971224").until)).toEqual({
      date: "Temporal.PlainDate 1997-12-24",
      kind: "date",
    });
    expect(plain(rule("FREQ=DAILY;UNTIL=19971224T000000").until)).toEqual({
      kind: "floating",
      wallTime: "Temporal.PlainDateTime 1997-12-24T00:00:00",
    });
  });

  test("reads a + ordinal and the extremes of every range", () => {
    expect(
      plain(
        rule(
          "FREQ=YEARLY;BYDAY=+2TU,53MO,-53SU;BYSECOND=0,60;BYMINUTE=59;BYHOUR=0,23;BYMONTHDAY=-31,31;BYYEARDAY=-366,366;BYWEEKNO=-53,53;BYMONTH=12;BYSETPOS=+366,-366",
        ),
      ),
    ).toEqual({
      byDay: [
        { ordinal: 2, weekday: "TU" },
        { ordinal: 53, weekday: "MO" },
        { ordinal: -53, weekday: "SU" },
      ],
      byHour: [0, 23],
      byMinute: [59],
      byMonth: [12],
      byMonthDay: [-31, 31],
      bySecond: [0, 60],
      bySetPosition: [366, -366],
      byWeekNumber: [-53, 53],
      byYearDay: [-366, 366],
      frequency: "YEARLY",
    });
  });

  test("ignores empty parts, such as a trailing semicolon", () => {
    expect(rule("FREQ=DAILY;;COUNT=2;")).toEqual({ count: 2, frequency: "DAILY" });
  });

  test("keeps COUNT with UNTIL, with a warning", () => {
    const value = lenient(
      decodeIcsValue("RECUR", "FREQ=DAILY;COUNT=5;UNTIL=19971224T000000Z"),
      /COUNT with UNTIL/,
      "conflicting-properties",
    );
    expect(value.count).toBe(5);
    expect(value.until?.kind).toBe("utc");
  });

  test.each([
    "BYMONTH=13",
    "BYMONTH=0",
    "BYMONTH=1,13",
    "BYMONTHDAY=0",
    "BYMONTHDAY=32",
    "BYYEARDAY=367",
    "BYWEEKNO=0",
    "BYWEEKNO=-54",
    "BYSETPOS=0",
    "BYHOUR=24",
    "BYHOUR=-1",
    "BYMINUTE=60",
    "BYSECOND=61",
    "BYSECOND=",
    "BYSECOND=1,,2",
    "BYSECOND=a",
    "BYDAY=0MO",
    "BYDAY=54MO",
    "BYDAY=XX",
    "BYDAY=MO,",
    "BYDAY=1",
    "WKST=XX",
    "INTERVAL=0",
    "INTERVAL=-1",
    "COUNT=abc",
    "COUNT=0",
    "UNTIL=19971232",
    "UNTIL=tomorrow",
  ])("drops the invalid part %s, with a warning", (part) => {
    expect(lenient(decodeIcsValue("RECUR", `FREQ=YEARLY;${part}`), /dropped/)).toEqual({
      frequency: "YEARLY",
    });
  });

  test("keeps the first of a repeated part, with a warning", () => {
    expect(lenient(decodeIcsValue("RECUR", "FREQ=DAILY;COUNT=2;COUNT=3"), /first/).count).toBe(2);
    expect(lenient(decodeIcsValue("RECUR", "FREQ=DAILY;FREQ=WEEKLY"), /first/).frequency).toBe(
      "DAILY",
    );
  });

  test("drops a part without =, with a warning", () => {
    expect(lenient(decodeIcsValue("RECUR", "FREQ=DAILY;COUNT"), /NAME=VALUE/)).toEqual({
      frequency: "DAILY",
    });
  });

  test("ignores parts it doesn't support, with a warning", () => {
    const value = lenient(
      decodeIcsValue("RECUR", "RSCALE=HEBREW;FREQ=YEARLY;SKIP=FORWARD;X-NAME=1;BYMONTH=5L"),
      /unsupported.*RSCALE, SKIP, X-NAME/,
      "unsupported",
    );
    expect(value.frequency).toBe("YEARLY");
  });

  test("keeps the code of an UNTIL's warnings, prefixed", () => {
    const result = decodeIcsValue("RECUR", "FREQ=DAILY;UNTIL=19971224T0000Z;COUNT=5;RSCALE=X");
    expect(result).toMatchObject({
      warnings: [
        { code: "invalid-value", message: expect.stringMatching(/^UNTIL: no seconds/) },
        { code: "conflicting-properties" },
        { code: "unsupported" },
      ],
    });
    expect(warningsOf(result)).toHaveLength(3);
  });

  test("rejects a rule without a valid FREQ", () => {
    for (const raw of ["", "COUNT=5", "FREQ=FORTNIGHTLY;COUNT=5", "FREQ=", "FREQ"]) {
      rejected(decodeIcsValue("RECUR", raw));
    }
  });

  test("writes parts in a stable order, FREQ first", () => {
    expect(
      encodeIcsValue(
        "RECUR",
        rule(
          "WKST=SU;BYSETPOS=-1;BYDAY=TU,-1TH;UNTIL=19971224;FREQ=MONTHLY;INTERVAL=2;BYMONTH=1;BYMINUTE=5",
        ),
      ),
    ).toBe(
      "FREQ=MONTHLY;UNTIL=19971224;INTERVAL=2;BYMINUTE=5;BYDAY=TU,-1TH;BYMONTH=1;BYSETPOS=-1;WKST=SU",
    );
  });

  test("writes a zoned UNTIL as the UTC instant it names, and leaves out empty lists", () => {
    const wallTime = Temporal.PlainDateTime.from("2026-03-01T09:00");
    expect(
      encodeIcsValue("RECUR", {
        byDay: [],
        frequency: "WEEKLY",
        until: {
          kind: "zoned",
          tzid: "Europe/Berlin",
          wallTime,
          zoned: wallTime.toZonedDateTime("Europe/Berlin"),
        },
      }),
    ).toBe("FREQ=WEEKLY;UNTIL=20260301T080000Z");
  });
});
