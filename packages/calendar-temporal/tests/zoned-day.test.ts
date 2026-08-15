import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  instantInterval,
  splitInstantRangeByZonedDay,
  zonedDayRange,
  type ZonedDayRange,
  type ZonedDaySplit,
} from "../src/index.ts";
import { NativeTemporal } from "./native-temporal.ts";

const MINUTE_NANOSECONDS = 60_000_000_000n;

function instantAt(wallTime: string, timeZone: string): Temporal.Instant {
  return NativeTemporal.PlainDateTime.from(wallTime)
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}

function durationMinutes(start: Temporal.Instant, end: Temporal.Instant): number {
  return Number((end.epochNanoseconds - start.epochNanoseconds) / MINUTE_NANOSECONDS);
}

describe("zoned day boundaries and splitting", () => {
  test("returns 23-hour and 25-hour day ranges across hourly DST changes", () => {
    const spring = zonedDayRange(NativeTemporal.PlainDate.from("2026-03-08"), "America/New_York");
    const fall = zonedDayRange(NativeTemporal.PlainDate.from("2026-11-01"), "America/New_York");

    expect(spring.kind).toBe("available");
    expect(spring.durationNanoseconds / MINUTE_NANOSECONDS).toBe(23n * 60n);
    expect(fall.kind).toBe("available");
    expect(fall.durationNanoseconds / MINUTE_NANOSECONDS).toBe(25n * 60n);
    expect(spring.startBoundary.toString()).toContain("T00:00:00-05:00");
    expect(spring.endBoundary.toString()).toContain("T00:00:00-04:00");
  });

  test("uses the first real instant for a midnight gap", () => {
    const day = zonedDayRange(NativeTemporal.PlainDate.from("2026-09-06"), "America/Santiago");

    expect(day.kind).toBe("available");
    expect(day.startBoundary.toString()).toContain("2026-09-06T01:00:00-03:00");
    expect(day.durationNanoseconds / MINUTE_NANOSECONDS).toBe(23n * 60n);
  });

  test("represents a date-line-skipped date without fabricating an interval", () => {
    const skipped = zonedDayRange(NativeTemporal.PlainDate.from("2011-12-30"), "Pacific/Apia");

    expect(skipped).toMatchObject({ interval: null, kind: "skipped", timeZone: "Pacific/Apia" });
    expect(skipped.start.equals(skipped.end)).toBe(true);
    expect(skipped.startBoundary.toPlainDate().toString()).toBe("2011-12-31");
    expect(skipped.durationNanoseconds).toBe(0n);
  });

  test("keeps unusual fixed offsets independent of the host timezone", () => {
    const day = zonedDayRange(NativeTemporal.PlainDate.from("2026-01-15"), "Asia/Kathmandu");

    expect(day.kind).toBe("available");
    expect(day.startBoundary.offset).toBe("+05:45");
    expect(day.durationNanoseconds / MINUTE_NANOSECONDS).toBe(24n * 60n);
  });

  test("splits at actual day boundaries across a spring gap", () => {
    const timeZone = "America/New_York";
    const range = instantInterval(
      instantAt("2026-03-07T23:00", timeZone),
      instantAt("2026-03-09T01:00", timeZone),
    );
    const splits = splitInstantRangeByZonedDay(range, timeZone);

    expect(splits.map((split) => split.date.toString())).toEqual([
      "2026-03-07",
      "2026-03-08",
      "2026-03-09",
    ]);
    expect(
      splits.map((split) => durationMinutes(split.interval.start, split.interval.end)),
    ).toEqual([60, 23 * 60, 60]);
    expect(splits.map((split) => [split.continuesBeforeDay, split.continuesAfterDay])).toEqual([
      [false, true],
      [true, true],
      [true, false],
    ]);
    expect(Object.isFrozen(splits)).toBe(true);
  });

  test("does not emit a fragment for a date skipped by a date-line change", () => {
    const timeZone = "Pacific/Apia";
    const range = instantInterval(
      instantAt("2011-12-29T12:00", timeZone),
      instantAt("2011-12-31T12:00", timeZone),
    );
    const splits = splitInstantRangeByZonedDay(range, timeZone);

    expect(splits.map((split) => split.date.toString())).toEqual(["2011-12-29", "2011-12-31"]);
    expect(
      splits.map((split) => durationMinutes(split.interval.start, split.interval.end)),
    ).toEqual([12 * 60, 12 * 60]);
    expect(new Set(splits.map((split) => split.key)).size).toBe(splits.length);
  });

  test("bounds accidental materialization", () => {
    const range = instantInterval(
      NativeTemporal.Instant.from("2026-01-01T00:00Z"),
      NativeTemporal.Instant.from("2026-01-04T00:00Z"),
    );

    expect(() => splitInstantRangeByZonedDay(range, "UTC", { limit: 2 })).toThrow(
      "zoned-day-split-limit-exceeded",
    );
  });

  test("keeps public day and split return types explicit", () => {
    expectTypeOf<ReturnType<typeof zonedDayRange>>().toEqualTypeOf<ZonedDayRange>();
    expectTypeOf<ReturnType<typeof splitInstantRangeByZonedDay>>().toEqualTypeOf<
      readonly ZonedDaySplit[]
    >();
  });
});
