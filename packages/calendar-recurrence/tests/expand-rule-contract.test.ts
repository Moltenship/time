import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import type { IcsWeekday } from "@moltenship/ics";

import {
  expandRecurrenceRule,
  RecurrenceRuleError,
  type RecurrenceDate,
  type RecurrenceRule,
} from "../src";

// The contract every engine keeps; the full RFC 5545 suite lives beside the engine.

const berlinNine: CalendarEventInterval = {
  end: Temporal.Instant.from("2026-10-21T08:00:00Z"),
  kind: "timed",
  sourceTimeZone: "Europe/Berlin",
  start: Temporal.Instant.from("2026-10-21T07:00:00Z"),
};

const strings = (dates: readonly RecurrenceDate[]) => dates.map(String);

describe("expandRecurrenceRule contract", () => {
  test("keeps a timed series on its wall clock across DST", () => {
    const { dates } = expandRecurrenceRule({ count: 3, frequency: "WEEKLY" }, berlinNine);
    expect(
      dates.map((date) =>
        (date as Temporal.Instant).toZonedDateTimeISO("Europe/Berlin").toString(),
      ),
    ).toEqual([
      "2026-10-21T09:00:00+02:00[Europe/Berlin]",
      "2026-10-28T09:00:00+01:00[Europe/Berlin]",
      "2026-11-04T09:00:00+01:00[Europe/Berlin]",
    ]);
  });

  test("counts the first occurrence even when the rule wouldn't produce it", () => {
    const { dates } = expandRecurrenceRule(
      { byDay: [{ weekday: "FR" }], count: 3, frequency: "WEEKLY" },
      {
        end: Temporal.PlainDate.from("2026-10-22"),
        kind: "all-day",
        start: Temporal.PlainDate.from("2026-10-21"),
      },
    );
    expect(strings(dates)).toEqual(["2026-10-21", "2026-10-23", "2026-10-30"]);
  });

  test("treats UNTIL as inclusive", () => {
    const { dates } = expandRecurrenceRule(
      { frequency: "DAILY", until: Temporal.PlainDateTime.from("2026-10-23T18:00") },
      {
        end: Temporal.PlainDateTime.from("2026-10-21T19:00"),
        kind: "floating",
        start: Temporal.PlainDateTime.from("2026-10-21T18:00"),
      },
    );
    expect(strings(dates)).toEqual([
      "2026-10-21T18:00:00",
      "2026-10-22T18:00:00",
      "2026-10-23T18:00:00",
    ]);
  });

  test("bounds work by the window, and COUNT still counts from the first occurrence", () => {
    const { dates } = expandRecurrenceRule({ count: 4, frequency: "WEEKLY" }, berlinNine, {
      from: Temporal.Instant.from("2026-11-01T00:00:00Z"),
      before: Temporal.Instant.from("2027-01-01T00:00:00Z"),
    });
    expect(strings(dates)).toEqual(["2026-11-04T08:00:00Z", "2026-11-11T08:00:00Z"]);
  });

  test("stops an endless rule at maxIterations and says so", () => {
    const expansion = expandRecurrenceRule({ frequency: "DAILY" }, berlinNine, {
      maxIterations: 10,
    });
    expect(expansion.dates).toHaveLength(10);
    expect(expansion.truncated).toBe(true);
  });
});

describe("expandRecurrenceRule limits", () => {
  const allDay: CalendarEventInterval = {
    end: Temporal.PlainDate.from("2026-01-02"),
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-01-01"),
  };

  test("reports truncation only when occurrences were left", () => {
    const rule = { frequency: "DAILY", until: Temporal.PlainDate.from("2026-01-05") } as const;
    expect(expandRecurrenceRule(rule, allDay, { maxIterations: 50 }).truncated).toBe(false);
    expect(
      expandRecurrenceRule({ frequency: "DAILY" }, allDay, {
        before: Temporal.PlainDate.from("2026-01-06"),
        maxIterations: 50,
      }).truncated,
    ).toBe(false);
    // Every occurrence costs at least one step, so five can't fit in four.
    expect(expandRecurrenceRule(rule, allDay, { maxIterations: 4 }).truncated).toBe(true);
  });

  test("skips ahead to the window when there's no COUNT", () => {
    const { dates, truncated } = expandRecurrenceRule(
      { frequency: "DAILY" },
      {
        ...allDay,
        end: Temporal.PlainDate.from("2000-01-02"),
        start: Temporal.PlainDate.from("2000-01-01"),
      },
      {
        before: Temporal.PlainDate.from("2026-01-04"),
        from: Temporal.PlainDate.from("2026-01-01"),
        maxIterations: 100,
      },
    );
    expect(truncated).toBe(false);
    expect(strings(dates)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  test("ends at whichever of COUNT and UNTIL comes first", () => {
    const until = Temporal.PlainDate.from("2026-01-03");
    expect(
      strings(expandRecurrenceRule({ count: 5, frequency: "DAILY", until }, allDay).dates),
    ).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    expect(
      strings(expandRecurrenceRule({ count: 2, frequency: "DAILY", until }, allDay).dates),
    ).toEqual(["2026-01-01", "2026-01-02"]);
  });

  test("rejects rules built in code with a code for the series layer's issue", () => {
    const codeOf = (rule: RecurrenceRule, first: CalendarEventInterval = allDay) => {
      try {
        expandRecurrenceRule(rule, first);
      } catch (error) {
        return error instanceof RecurrenceRuleError ? error.code : "other";
      }
      return "none";
    };
    expect(codeOf({ frequency: "DAILY", interval: 0 })).toBe("invalid-rule");
    expect(codeOf({ byDay: [], frequency: "WEEKLY" })).toBe("invalid-rule");
    expect(codeOf({ count: 0, frequency: "DAILY" })).toBe("invalid-rule");
    expect(codeOf({ frequency: "FOO" as RecurrenceRule["frequency"] })).toBe("invalid-rule");
    expect(codeOf({ frequency: "WEEKLY", weekStart: "XX" as IcsWeekday })).toBe("invalid-rule");
    expect(codeOf({ frequency: "DAILY" }, { ...berlinNine, sourceTimeZone: "Mars/Olympus" })).toBe(
      "invalid-time-zone",
    );
  });

  test("rejects a cap that isn't a positive integer", () => {
    for (const maxIterations of [0, -1, Number.NaN, 1.5]) {
      expect(() => expandRecurrenceRule({ frequency: "DAILY" }, allDay, { maxIterations })).toThrow(
        RangeError,
      );
    }
  });

  test("always gives the first occurrence, even after UNTIL", () => {
    const { dates } = expandRecurrenceRule(
      { frequency: "DAILY", until: Temporal.PlainDate.from("2025-12-01") },
      allDay,
    );
    expect(strings(dates)).toEqual(["2026-01-01"]);
  });

  test("brings UNTIL of another kind into the series' kind", () => {
    const { dates } = expandRecurrenceRule(
      { frequency: "DAILY", until: Temporal.Instant.from("2026-01-03T23:59:59Z") },
      allDay,
    );
    expect(strings(dates)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });

  test("repeats a first start written in a DST gap at its written time", () => {
    const written = Temporal.PlainDateTime.from("2027-03-28T02:30");
    const start = written.toZonedDateTime("Europe/Berlin").toInstant();
    const { dates } = expandRecurrenceRule(
      { count: 2, frequency: "DAILY" },
      {
        end: start.add({ hours: 1 }),
        kind: "timed",
        sourceTimeZone: "Europe/Berlin",
        start,
        wallStart: written,
      },
    );
    expect(
      dates.map((date) =>
        (date as Temporal.Instant).toZonedDateTimeISO("Europe/Berlin").toString(),
      ),
    ).toEqual([
      "2027-03-28T03:30:00+02:00[Europe/Berlin]",
      "2027-03-29T02:30:00+02:00[Europe/Berlin]",
    ]);
  });

  test("ignores a written start that no longer resolves to the first start", () => {
    const start = Temporal.Instant.from("2027-04-05T08:00:00Z");
    const { dates } = expandRecurrenceRule(
      { count: 2, frequency: "DAILY" },
      {
        end: start.add({ hours: 1 }),
        kind: "timed",
        sourceTimeZone: "Europe/Berlin",
        start,
        wallStart: Temporal.PlainDateTime.from("2027-03-28T02:30"),
      },
    );
    expect(strings(dates)).toEqual(["2027-04-05T08:00:00Z", "2027-04-06T08:00:00Z"]);
  });

  test("moves a later start out of a DST gap and counts it, and takes the first of a repeated time", () => {
    const zoned = (dates: readonly RecurrenceDate[]) =>
      dates.map((date) =>
        (date as Temporal.Instant).toZonedDateTimeISO("Europe/Berlin").toString(),
      );
    const at = (iso: string) => {
      const start = Temporal.ZonedDateTime.from(iso).toInstant();
      return {
        end: start.add({ minutes: 30 }),
        kind: "timed",
        sourceTimeZone: "Europe/Berlin",
        start,
      } as const;
    };
    expect(
      zoned(
        expandRecurrenceRule(
          { count: 3, frequency: "DAILY" },
          at("2026-03-28T02:30[Europe/Berlin]"),
        ).dates,
      ),
    ).toEqual([
      "2026-03-28T02:30:00+01:00[Europe/Berlin]",
      "2026-03-29T03:30:00+02:00[Europe/Berlin]",
      "2026-03-30T02:30:00+02:00[Europe/Berlin]",
    ]);
    expect(
      zoned(
        expandRecurrenceRule(
          { count: 2, frequency: "DAILY" },
          at("2026-10-24T02:30[Europe/Berlin]"),
        ).dates,
      ),
    ).toEqual([
      "2026-10-24T02:30:00+02:00[Europe/Berlin]",
      "2026-10-25T02:30:00+02:00[Europe/Berlin]",
    ]);
  });

  test("gives dates in the ISO calendar", () => {
    const hebrew = Temporal.PlainDate.from("2026-01-01").withCalendar("hebrew");
    const { dates } = expandRecurrenceRule(
      { count: 2, frequency: "DAILY" },
      { end: hebrew.add({ days: 1 }), kind: "all-day", start: hebrew },
    );
    expect(strings(dates)).toEqual(["2026-01-01", "2026-01-02"]);
  });
});
