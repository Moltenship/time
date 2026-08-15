import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  instantInterval,
  splitInstantRangeByZonedDay,
  zonedDayRange,
  zonedDayTransitions,
  type ZonedDayRange,
  type ZonedDaySplit,
} from "../src/index";
import { NativeTemporal } from "./native-temporal";

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

  test("finds cross-midnight folds and assigns their repeated instants to boundary days", () => {
    const timeZone = "Antarctica/Casey";
    const march4 = NativeTemporal.PlainDate.from("2010-03-04");
    const march5 = NativeTemporal.PlainDate.from("2010-03-05");
    const march4Transitions = zonedDayTransitions(march4, timeZone);
    const march5Transitions = zonedDayTransitions(march5, timeZone);

    expect(march4Transitions).toHaveLength(1);
    expect(march5Transitions).toHaveLength(1);
    expect(march4Transitions[0]).toMatchObject({
      kind: "fold",
      offsetAfter: "+08:00",
      offsetBefore: "+11:00",
    });
    expect(march4Transitions[0]!.affectedWallRange.start.toString()).toBe("2010-03-04T23:00:00");
    expect(march4Transitions[0]!.affectedWallRange.end.toString()).toBe("2010-03-05T02:00:00");
    expect(march5Transitions[0]!.instant.equals(march4Transitions[0]!.instant)).toBe(true);

    const start = NativeTemporal.PlainDateTime.from("2010-03-04T23:30")
      .toZonedDateTime(timeZone, { disambiguation: "later" })
      .toInstant();
    const end = NativeTemporal.PlainDateTime.from("2010-03-05T03:00")
      .toZonedDateTime(timeZone, { disambiguation: "later" })
      .toInstant();
    const splits = splitInstantRangeByZonedDay(instantInterval(start, end), timeZone);

    expect(splits.map((split) => split.date.toString())).toEqual(["2010-03-05"]);
    expect(durationMinutes(splits[0]!.interval.start, splits[0]!.interval.end)).toBe(210);
  });

  test("scans transitions safely at Temporal's minimum instant", () => {
    const minimumDate = NativeTemporal.PlainDate.from("-271821-04-20");

    expect(zonedDayTransitions(minimumDate, "UTC")).toEqual([]);
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
