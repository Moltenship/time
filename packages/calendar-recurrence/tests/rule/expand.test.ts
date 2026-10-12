import { describe, expect, test } from "vite-plus/test";

import {
  expandRecurrenceRule,
  parseRecurrenceRule,
  type RecurrenceDate,
  type RecurrenceRuleStart,
  type RecurrenceRuleWindow,
} from "../../src";

// One behaviour per test; the reference fixtures beside this file cover RFC 5545's examples and
// the DST matrix against python-dateutil.

/** A timed start at a wall time, or a ZonedDateTime string with an offset, in `timeZone`. */
function timed(text: string, timeZone = "UTC", wallStart?: string): RecurrenceRuleStart {
  const zoned = text.includes("[")
    ? Temporal.ZonedDateTime.from(text)
    : Temporal.PlainDateTime.from(text).toZonedDateTime(timeZone);
  const start = zoned.toInstant();
  return {
    end: start.add({ hours: 1 }),
    kind: "timed",
    sourceTimeZone: zoned.timeZoneId,
    start,
    ...(wallStart === undefined ? {} : { wallStart: Temporal.PlainDateTime.from(wallStart) }),
  };
}

function allDay(text: string): RecurrenceRuleStart {
  const start = Temporal.PlainDate.from(text);
  return { end: start.add({ days: 1 }), kind: "all-day", start };
}

function floating(text: string): RecurrenceRuleStart {
  const start = Temporal.PlainDateTime.from(text);
  return { end: start.add({ hours: 1 }), kind: "floating", start };
}

function rule(text: string) {
  const { issues, rule } = parseRecurrenceRule(text);
  expect(issues).toEqual([]);
  return rule!;
}

/** Starts as text: timed ones as wall time and offset in the series' zone. */
function show(dates: readonly RecurrenceDate[], first: RecurrenceRuleStart): string[] {
  return dates.map((date) =>
    date instanceof Temporal.Instant
      ? date
          .toZonedDateTimeISO(first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC")
          .toString({ timeZoneName: "never" })
      : date.toString(),
  );
}

function expand(text: string, first: RecurrenceRuleStart, window?: RecurrenceRuleWindow) {
  const expansion = expandRecurrenceRule(rule(text), first, window);
  return show(expansion.dates, first);
}

/** Wall times in UTC, written short. */
const utc = (...times: string[]) => times.map((time) => `${time}:00+00:00`);

describe("each FREQ", () => {
  test("SECONDLY", () => {
    expect(expand("FREQ=SECONDLY;INTERVAL=20;COUNT=4", timed("2026-01-01T09:00"))).toEqual([
      "2026-01-01T09:00:00+00:00",
      "2026-01-01T09:00:20+00:00",
      "2026-01-01T09:00:40+00:00",
      "2026-01-01T09:01:00+00:00",
    ]);
  });

  test("MINUTELY", () => {
    expect(expand("FREQ=MINUTELY;INTERVAL=90;COUNT=3", timed("2026-01-01T09:00"))).toEqual(
      utc("2026-01-01T09:00", "2026-01-01T10:30", "2026-01-01T12:00"),
    );
  });

  test("HOURLY, across midnight", () => {
    expect(expand("FREQ=HOURLY;INTERVAL=5;COUNT=4", timed("2026-01-01T20:00"))).toEqual(
      utc("2026-01-01T20:00", "2026-01-02T01:00", "2026-01-02T06:00", "2026-01-02T11:00"),
    );
  });

  test("DAILY", () => {
    expect(expand("FREQ=DAILY;INTERVAL=3;COUNT=3", allDay("2026-01-30"))).toEqual([
      "2026-01-30",
      "2026-02-02",
      "2026-02-05",
    ]);
  });

  test("WEEKLY on the start's weekday", () => {
    expect(expand("FREQ=WEEKLY;COUNT=3", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-01-08",
      "2026-01-15",
    ]);
  });

  test("MONTHLY on the start's day", () => {
    expect(expand("FREQ=MONTHLY;COUNT=3", allDay("2026-01-15"))).toEqual([
      "2026-01-15",
      "2026-02-15",
      "2026-03-15",
    ]);
  });

  test("YEARLY on the start's month and day", () => {
    expect(expand("FREQ=YEARLY;COUNT=3", allDay("2026-06-10"))).toEqual([
      "2026-06-10",
      "2027-06-10",
      "2028-06-10",
    ]);
  });
});

describe("BYMONTH", () => {
  test("expands YEARLY", () => {
    expect(expand("FREQ=YEARLY;BYMONTH=1,7;COUNT=4", allDay("2026-01-10"))).toEqual([
      "2026-01-10",
      "2026-07-10",
      "2027-01-10",
      "2027-07-10",
    ]);
  });

  test("limits DAILY", () => {
    expect(expand("FREQ=DAILY;BYMONTH=2;COUNT=3", allDay("2026-01-30"))).toEqual([
      "2026-01-30",
      "2026-02-01",
      "2026-02-02",
    ]);
  });
});

describe("BYWEEKNO", () => {
  test("takes week 1's days from late December when the week starts there", () => {
    expect(expand("FREQ=YEARLY;BYWEEKNO=1;BYDAY=MO;COUNT=4", allDay("2024-01-01"))).toEqual([
      "2024-01-01",
      "2024-12-30",
      "2025-12-29",
      "2027-01-04",
    ]);
  });

  test("counts negative weeks from the year's last", () => {
    expect(expand("FREQ=YEARLY;BYWEEKNO=-1;BYDAY=TH;COUNT=3", allDay("2026-12-31"))).toEqual([
      "2026-12-31",
      "2027-12-30",
      "2028-12-28",
    ]);
  });

  test("skips week 53 in years with 52", () => {
    expect(expand("FREQ=YEARLY;BYWEEKNO=53;BYDAY=MO;COUNT=3", allDay("2020-12-28"))).toEqual([
      "2020-12-28",
      "2026-12-28",
      "2032-12-27",
    ]);
  });

  test("numbers weeks from WKST", () => {
    const text = "FREQ=YEARLY;BYWEEKNO=1;BYDAY=SA;COUNT=2";
    expect(expand(`${text};WKST=MO`, allDay("2026-01-01"))).toEqual(["2026-01-01", "2026-01-03"]);
    expect(expand(`${text};WKST=SU`, allDay("2026-01-01"))).toEqual(["2026-01-01", "2026-01-10"]);
  });

  test("takes the start's weekday when nothing else names a day", () => {
    expect(expand("FREQ=YEARLY;BYWEEKNO=20;COUNT=3", allDay("2026-05-13"))).toEqual([
      "2026-05-13",
      "2027-05-19",
      "2028-05-17",
    ]);
  });
});

describe("BYYEARDAY", () => {
  test("counts from either end", () => {
    expect(expand("FREQ=YEARLY;BYYEARDAY=1,-1;COUNT=4", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-12-31",
      "2027-01-01",
      "2027-12-31",
    ]);
  });

  test("skips day 366 in common years", () => {
    expect(expand("FREQ=YEARLY;BYYEARDAY=366;COUNT=3", allDay("2024-12-31"))).toEqual([
      "2024-12-31",
      "2028-12-31",
      "2032-12-31",
    ]);
  });

  test("limits DAILY, where RFC 5545 doesn't define it", () => {
    expect(expand("FREQ=DAILY;BYYEARDAY=100;COUNT=2", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-04-10",
    ]);
  });
});

describe("BYMONTHDAY", () => {
  test("counts negative days from the month's end", () => {
    expect(expand("FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=4", allDay("2026-01-31"))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(expand("FREQ=MONTHLY;BYMONTHDAY=-31;COUNT=3", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-03-01",
      "2026-05-01",
    ]);
  });

  test("limits the start's weekday in a WEEKLY rule, where RFC 5545 doesn't define it", () => {
    expect(expand("FREQ=WEEKLY;BYMONTHDAY=13;COUNT=4", allDay("2026-02-13"))).toEqual([
      "2026-02-13",
      "2026-03-13",
      "2026-11-13",
      "2027-08-13",
    ]);
  });

  test("skips months without the day rather than clamping", () => {
    expect(expand("FREQ=MONTHLY;COUNT=4", allDay("2026-01-31"))).toEqual([
      "2026-01-31",
      "2026-03-31",
      "2026-05-31",
      "2026-07-31",
    ]);
  });

  test("never makes 30 February, and finds 29 February in leap years only", () => {
    expect(expand("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29,30;COUNT=3", allDay("2024-02-29"))).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
    expect(expand("FREQ=YEARLY;COUNT=3", allDay("2024-02-29"))).toEqual([
      "2024-02-29",
      "2028-02-29",
      "2032-02-29",
    ]);
  });
});

describe("BYDAY", () => {
  test("ordinals count within the month", () => {
    expect(expand("FREQ=MONTHLY;BYDAY=1MO,-1FR;COUNT=5", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-01-05",
      "2026-01-30",
      "2026-02-02",
      "2026-02-27",
    ]);
  });

  test("skips a fifth weekday that a month doesn't have", () => {
    expect(expand("FREQ=MONTHLY;BYDAY=5FR;COUNT=3", allDay("2026-01-30"))).toEqual([
      "2026-01-30",
      "2026-05-29",
      "2026-07-31",
    ]);
  });

  test("ordinals count within the year, or within BYMONTH's months", () => {
    expect(expand("FREQ=YEARLY;BYDAY=20MO;COUNT=2", allDay("2026-05-18"))).toEqual([
      "2026-05-18",
      "2027-05-17",
    ]);
    expect(expand("FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;COUNT=2", allDay("2026-03-29"))).toEqual([
      "2026-03-29",
      "2027-03-28",
    ]);
  });

  test("joins plain and ordinal entries", () => {
    expect(expand("FREQ=MONTHLY;BYDAY=MO,1TU;COUNT=4", allDay("2026-01-05"))).toEqual([
      "2026-01-05",
      "2026-01-06",
      "2026-01-12",
      "2026-01-19",
    ]);
  });

  test("ignores ordinals in WEEKLY rules", () => {
    expect(expand("FREQ=WEEKLY;BYDAY=1TU;COUNT=3", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-01-06",
      "2026-01-13",
    ]);
  });
});

describe("BYHOUR, BYMINUTE and BYSECOND", () => {
  test("expand DAILY", () => {
    expect(
      expand("FREQ=DAILY;BYHOUR=9,17;BYMINUTE=0,30;COUNT=5", timed("2026-01-01T09:00")),
    ).toEqual(
      utc(
        "2026-01-01T09:00",
        "2026-01-01T09:30",
        "2026-01-01T17:00",
        "2026-01-01T17:30",
        "2026-01-02T09:00",
      ),
    );
  });

  test("BYHOUR limits HOURLY", () => {
    expect(expand("FREQ=HOURLY;BYHOUR=9,10;COUNT=4", timed("2026-01-01T09:15"))).toEqual(
      utc("2026-01-01T09:15", "2026-01-01T10:15", "2026-01-02T09:15", "2026-01-02T10:15"),
    );
  });

  test("BYSECOND expands MINUTELY and BYMINUTE limits SECONDLY", () => {
    expect(expand("FREQ=MINUTELY;BYSECOND=0,30;COUNT=4", timed("2026-01-01T09:00"))).toEqual([
      "2026-01-01T09:00:00+00:00",
      "2026-01-01T09:00:30+00:00",
      "2026-01-01T09:01:00+00:00",
      "2026-01-01T09:01:30+00:00",
    ]);
    expect(
      expand("FREQ=SECONDLY;INTERVAL=30;BYMINUTE=0;COUNT=3", timed("2026-01-01T09:00")),
    ).toEqual([
      "2026-01-01T09:00:00+00:00",
      "2026-01-01T09:00:30+00:00",
      "2026-01-01T10:00:00+00:00",
    ]);
  });

  test("skip second 60, which no clock shows", () => {
    expect(expand("FREQ=DAILY;BYSECOND=30,60;COUNT=2", timed("2026-01-01T09:00:30"))).toEqual([
      "2026-01-01T09:00:30+00:00",
      "2026-01-02T09:00:30+00:00",
    ]);
  });

  test("are ignored for all-day series, as RFC 5545 says", () => {
    expect(expand("FREQ=DAILY;BYHOUR=9,17;COUNT=2", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
  });
});

describe("BYSETPOS", () => {
  test("picks from each period's set", () => {
    expect(
      expand("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3", allDay("2026-01-30")),
    ).toEqual(["2026-01-30", "2026-02-27", "2026-03-31"]);
  });

  test("counts times as well as days", () => {
    expect(
      expand("FREQ=DAILY;BYHOUR=9,12,17;BYSETPOS=2,-1;COUNT=4", timed("2026-01-01T12:00")),
    ).toEqual(utc("2026-01-01T12:00", "2026-01-01T17:00", "2026-01-02T12:00", "2026-01-02T17:00"));
  });

  test("skips periods without the position", () => {
    expect(expand("FREQ=MONTHLY;BYDAY=MO;BYSETPOS=5;COUNT=3", allDay("2026-03-30"))).toEqual([
      "2026-03-30",
      "2026-06-29",
      "2026-08-31",
    ]);
  });
});

describe("WKST", () => {
  // RFC 5545 §3.8.5.3's pair.
  test("decides which weeks an INTERVAL=2 WEEKLY rule takes", () => {
    const start = timed("1997-08-05T09:00", "America/New_York");
    const text = "FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU";
    expect(expand(`${text};WKST=MO`, start).map((date) => date.slice(0, 10))).toEqual([
      "1997-08-05",
      "1997-08-10",
      "1997-08-19",
      "1997-08-24",
    ]);
    expect(expand(`${text};WKST=SU`, start).map((date) => date.slice(0, 10))).toEqual([
      "1997-08-05",
      "1997-08-17",
      "1997-08-19",
      "1997-08-31",
    ]);
  });
});

describe("the first occurrence", () => {
  test("counts toward COUNT when the rule wouldn't produce it", () => {
    expect(expand("FREQ=MONTHLY;BYMONTHDAY=1;COUNT=3", allDay("2026-01-15"))).toEqual([
      "2026-01-15",
      "2026-02-01",
      "2026-03-01",
    ]);
  });

  test("keeps its fraction of a second, as every occurrence does", () => {
    expect(expand("FREQ=DAILY;COUNT=2", timed("2026-01-01T09:00:00.25"))).toEqual([
      "2026-01-01T09:00:00.25+00:00",
      "2026-01-02T09:00:00.25+00:00",
    ]);
  });
});

describe("UNTIL", () => {
  test("is inclusive", () => {
    expect(expand("FREQ=DAILY;UNTIL=20260103", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
  });

  test("with COUNT too, ends at whichever comes first", () => {
    const until = Temporal.PlainDate.from("2026-01-15");
    const { dates } = expandRecurrenceRule(
      { count: 10, frequency: "WEEKLY", until },
      allDay("2026-01-01"),
    );
    expect(dates.map(String)).toEqual(["2026-01-01", "2026-01-08", "2026-01-15"]);
  });

  test("a date-only UNTIL on a timed series ends with that day in its zone", () => {
    expect(expand("FREQ=DAILY;UNTIL=20260103", timed("2026-01-01T23:30", "Europe/Berlin"))).toEqual(
      ["2026-01-01T23:30:00+01:00", "2026-01-02T23:30:00+01:00", "2026-01-03T23:30:00+01:00"],
    );
  });
});

describe("DST", () => {
  const berlin = (text: string, wallStart?: string) => timed(text, "Europe/Berlin", wallStart);

  test("a wall time in the gap moves forward that day only", () => {
    expect(expand("FREQ=DAILY;COUNT=4", berlin("2026-03-27T02:30"))).toEqual([
      "2026-03-27T02:30:00+01:00",
      "2026-03-28T02:30:00+01:00",
      "2026-03-29T03:30:00+02:00",
      "2026-03-30T02:30:00+02:00",
    ]);
  });

  test("a repeated wall time takes its first instant", () => {
    expect(expand("FREQ=DAILY;COUNT=3", berlin("2026-10-24T02:30"))).toEqual([
      "2026-10-24T02:30:00+02:00",
      "2026-10-25T02:30:00+02:00",
      "2026-10-26T02:30:00+01:00",
    ]);
  });

  test("HOURLY keeps to the clock: the repeated hour happens once, the skipped one never", () => {
    expect(expand("FREQ=HOURLY;COUNT=4", berlin("2026-10-25T01:00"))).toEqual([
      "2026-10-25T01:00:00+02:00",
      "2026-10-25T02:00:00+02:00",
      "2026-10-25T03:00:00+01:00",
      "2026-10-25T04:00:00+01:00",
    ]);
    expect(expand("FREQ=HOURLY;COUNT=3", berlin("2026-03-29T01:00"))).toEqual([
      "2026-03-29T01:00:00+01:00",
      "2026-03-29T03:00:00+02:00",
      "2026-03-29T04:00:00+02:00",
    ]);
  });

  test("two wall times in one gap give one occurrence", () => {
    expect(expand("FREQ=DAILY;BYHOUR=2,3;COUNT=4", berlin("2026-03-28T02:00"))).toEqual([
      "2026-03-28T02:00:00+01:00",
      "2026-03-28T03:00:00+01:00",
      "2026-03-29T03:00:00+02:00",
      "2026-03-30T02:00:00+02:00",
    ]);
  });

  test("a time that moves forward past a later one still comes out in order", () => {
    expect(
      expand("FREQ=MINUTELY;INTERVAL=45", timed("2026-03-08T00:00", "America/New_York"), {
        before: Temporal.Instant.from("2026-03-08T09:00:00Z"),
      }),
    ).toEqual([
      "2026-03-08T00:00:00-05:00",
      "2026-03-08T00:45:00-05:00",
      "2026-03-08T01:30:00-05:00",
      "2026-03-08T03:00:00-04:00",
      "2026-03-08T03:15:00-04:00",
      "2026-03-08T03:45:00-04:00",
      "2026-03-08T04:30:00-04:00",
    ]);
  });

  test("a first start at the later instant of a repeated time drops the earlier one", () => {
    expect(
      expand(
        "FREQ=DAILY;BYHOUR=2,3;BYMINUTE=30;COUNT=3",
        timed("2026-10-25T02:30:00+01:00[Europe/Berlin]"),
      ),
    ).toEqual([
      "2026-10-25T02:30:00+01:00",
      "2026-10-25T03:30:00+01:00",
      "2026-10-26T02:30:00+01:00",
    ]);
  });

  test("an UNTIL in the second pass of a repeated hour keeps the first pass", () => {
    expect(
      expand("FREQ=MINUTELY;INTERVAL=30;UNTIL=20261025T011000Z", berlin("2026-10-25T01:00")),
    ).toEqual([
      "2026-10-25T01:00:00+02:00",
      "2026-10-25T01:30:00+02:00",
      "2026-10-25T02:00:00+02:00",
      "2026-10-25T02:30:00+02:00",
    ]);
  });

  test("a first start written in the gap repeats at its written time", () => {
    expect(expand("FREQ=WEEKLY;COUNT=2", berlin("2026-03-29T02:30", "2026-03-29T02:30"))).toEqual([
      "2026-03-29T03:30:00+02:00",
      "2026-04-05T02:30:00+02:00",
    ]);
  });

  test("30-minute shifts on Lord Howe Island", () => {
    expect(
      expand("FREQ=MINUTELY;INTERVAL=15;COUNT=6", timed("2026-10-04T01:30", "Australia/Lord_Howe")),
    ).toEqual([
      "2026-10-04T01:30:00+10:30",
      "2026-10-04T01:45:00+10:30",
      "2026-10-04T02:30:00+11:00",
      "2026-10-04T02:45:00+11:00",
      "2026-10-04T03:00:00+11:00",
      "2026-10-04T03:15:00+11:00",
    ]);
  });
});

describe("the window", () => {
  test("skips ahead to `from` without COUNT", () => {
    const first = timed("1990-01-01T09:00", "Europe/Berlin");
    const expansion = expandRecurrenceRule(rule("FREQ=DAILY"), first, {
      before: Temporal.Instant.from("2026-03-04T00:00:00Z"),
      from: Temporal.Instant.from("2026-03-01T00:00:00Z"),
      maxIterations: 10,
    });
    expect(expansion.truncated).toBe(false);
    expect(show(expansion.dates, first)).toEqual([
      "2026-03-01T09:00:00+01:00",
      "2026-03-02T09:00:00+01:00",
      "2026-03-03T09:00:00+01:00",
    ]);
  });

  test("an HOURLY series from 2010 queried in 2026 doesn't truncate", () => {
    const expansion = expandRecurrenceRule(
      rule("FREQ=HOURLY;INTERVAL=7"),
      timed("2010-01-01T00:00", "America/New_York"),
      {
        before: Temporal.Instant.from("2026-06-02T00:00:00Z"),
        from: Temporal.Instant.from("2026-06-01T00:00:00Z"),
        maxIterations: 10,
      },
    );
    expect(expansion.truncated).toBe(false);
    expect(expansion.dates.length).toBeGreaterThanOrEqual(3);
  });

  test("keeps INTERVAL's phase when it skips", () => {
    expect(
      expand("FREQ=DAILY;INTERVAL=3", allDay("2026-01-01"), {
        before: Temporal.PlainDate.from("2026-03-10"),
        from: Temporal.PlainDate.from("2026-03-01"),
      }),
    ).toEqual(["2026-03-02", "2026-03-05", "2026-03-08"]);
  });

  test("with COUNT, counts from the first occurrence", () => {
    const expansion = expandRecurrenceRule(rule("FREQ=DAILY;COUNT=1000"), allDay("1990-01-01"), {
      from: Temporal.PlainDate.from("2026-01-01"),
      maxIterations: 100,
    });
    expect(expansion).toEqual({ dates: [], truncated: true });
  });

  test("one step visits one period, so a sub-daily rule that never matches stops soon", () => {
    // Every other second from an even one never reaches second 1: 100,000 one-period steps.
    const { dates, truncated } = expandRecurrenceRule(
      rule("FREQ=SECONDLY;INTERVAL=2;BYSECOND=1"),
      timed("2026-01-01T09:00"),
    );
    expect(dates).toHaveLength(1);
    expect(truncated).toBe(true);
  });

  test("a rule whose days meet on no date ends after its first occurrence", () => {
    expect(
      expandRecurrenceRule(rule("FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30"), allDay("2026-01-01")),
    ).toEqual({ dates: [Temporal.PlainDate.from("2026-01-01")], truncated: false });
    expect(expand("FREQ=MONTHLY;BYDAY=6MO", allDay("2026-01-01"))).toEqual(["2026-01-01"]);
  });

  test("a rule that never matches stops at maxIterations, or at the window's end", () => {
    // Every other minute from an even one never reaches minute 1.
    const never = rule("FREQ=MINUTELY;INTERVAL=2;BYMINUTE=1");
    const first = timed("2026-01-01T09:00");
    expect(expandRecurrenceRule(never, first, { maxIterations: 50 }).truncated).toBe(true);
    expect(
      expandRecurrenceRule(never, first, { before: Temporal.Instant.from("2026-01-03T00:00:00Z") }),
    ).toEqual({ dates: [first.start], truncated: false });
  });

  test("ends quietly where Temporal's calendar does", () => {
    expect(expand("FREQ=YEARLY;INTERVAL=100000", allDay("2026-01-01"))).toEqual([
      "2026-01-01",
      "+102026-01-01",
      "+202026-01-01",
    ]);
  });
});

describe("floating series", () => {
  test("repeat on their wall time", () => {
    expect(expand("FREQ=WEEKLY;BYDAY=MO,WE;COUNT=3", floating("2026-01-05T18:00"))).toEqual([
      "2026-01-05T18:00:00",
      "2026-01-07T18:00:00",
      "2026-01-12T18:00:00",
    ]);
  });
});

describe("rules it can't expand", () => {
  test.each([
    [{ frequency: "FORTNIGHTLY" }, "invalid-rule", /FREQ/],
    [{ byMonthDay: [0], frequency: "MONTHLY" }, "invalid-rule", /BYMONTHDAY/],
    [{ byHour: [24], frequency: "DAILY" }, "invalid-rule", /BYHOUR/],
    [{ byDay: [{ ordinal: 0, weekday: "MO" }], frequency: "MONTHLY" }, "invalid-rule", /ordinal/],
    [{ frequency: "WEEKLY", weekStart: "XX" }, "invalid-rule", /WKST/],
    [{ frequency: "WEEKLY", weekStart: "constructor" }, "invalid-rule", /WKST/],
    [{ frequency: "toString" }, "invalid-rule", /FREQ/],
    [{ bySetPosition: [], frequency: "MONTHLY" }, "invalid-rule", /BYSETPOS/],
    [{ frequency: "HOURLY" }, "unsupported-rule", /all-day/],
  ])("%o", (bad, code, message) => {
    const expand = () =>
      expandRecurrenceRule(bad as Parameters<typeof expandRecurrenceRule>[0], allDay("2026-01-01"));
    expect(expand).toThrow(message);
    expect(expand).toThrow(expect.objectContaining({ code }));
  });

  test("only leap seconds, which Temporal's clocks don't have", () => {
    expect(() =>
      expandRecurrenceRule(rule("FREQ=DAILY;BYSECOND=60"), timed("2026-01-01T09:00")),
    ).toThrow(expect.objectContaining({ code: "unsupported-rule" }));
  });

  test("a time zone that isn't one", () => {
    const start = Temporal.Instant.from("2026-01-01T09:00:00Z");
    expect(() =>
      expandRecurrenceRule(rule("FREQ=DAILY"), {
        end: start,
        kind: "timed",
        sourceTimeZone: "Mars/Olympus",
        start,
      }),
    ).toThrow(expect.objectContaining({ code: "invalid-time-zone" }));
  });

  test("a maxIterations that isn't a positive integer", () => {
    expect(() =>
      expandRecurrenceRule(rule("FREQ=DAILY"), allDay("2026-01-01"), { maxIterations: 0 }),
    ).toThrow(RangeError);
  });

  test("window dates of another kind", () => {
    expect(() =>
      expandRecurrenceRule(rule("FREQ=DAILY"), allDay("2026-01-01"), {
        from: Temporal.Instant.from("2026-01-01T00:00:00Z"),
      }),
    ).toThrow(/window.from must be a Temporal.PlainDate/);
  });
});
