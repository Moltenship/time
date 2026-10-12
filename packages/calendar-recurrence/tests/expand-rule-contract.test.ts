import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import { expandRecurrenceRule, type RecurrenceDate } from "../src";

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
