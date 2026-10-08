import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import {
  compareInstants,
  snapZonedDateTime,
  snapZonedWallTime,
  type WallTimeSnapMode,
  type ZonedWallTimeSnapOptions,
} from "../src/index";
import { NativeTemporal } from "./native-temporal";

function zoned(value: string): Temporal.ZonedDateTime {
  return NativeTemporal.ZonedDateTime.from(value);
}

function snap(value: string, minutes: number, mode: WallTimeSnapMode): string {
  return snapZonedDateTime(zoned(value), {
    increment: minutes,
    mode,
    smallestUnit: "minute",
  }).toString();
}

describe("wall-clock ZonedDateTime snapping", () => {
  test("snaps on the local wall grid instead of the UTC epoch grid", () => {
    const kolkata =
      NativeTemporal.Instant.from("2026-01-15T03:40Z").toZonedDateTimeISO("Asia/Kolkata");

    expect(
      snapZonedDateTime(kolkata, { increment: 1, mode: "floor", smallestUnit: "hour" }).toString(),
    ).toBe("2026-01-15T09:00:00+05:30[Asia/Kolkata]");
    expect(snap("2026-01-15T10:52+05:45[Asia/Kathmandu]", 15, "nearest")).toBe(
      "2026-01-15T10:45:00+05:45[Asia/Kathmandu]",
    );
  });

  test("carries a late ceil into the next day", () => {
    expect(snap("2026-10-08T23:50-04:00[America/New_York]", 30, "ceil")).toBe(
      "2026-10-09T00:00:00-04:00[America/New_York]",
    );
  });

  test("resolves a snapped wall time inside a gap to the transition instant", () => {
    expect(snap("2026-03-08T01:50-05:00[America/New_York]", 15, "ceil")).toBe(
      "2026-03-08T03:00:00-04:00[America/New_York]",
    );
    expect(snap("2026-03-29T00:55+00:00[Europe/London]", 30, "nearest")).toBe(
      "2026-03-29T02:00:00+01:00[Europe/London]",
    );
    // Native rounding resolves 02:20 with "compatible" and floors 02:35 forward to 02:50.
    expect(snap("2026-10-04T02:35+11:00[Australia/Lord_Howe]", 20, "floor")).toBe(
      "2026-10-04T02:30:00+11:00[Australia/Lord_Howe]",
    );
  });

  test("keeps the input occurrence inside a fold", () => {
    expect(snap("2026-11-01T01:40-04:00[America/New_York]", 30, "floor")).toBe(
      "2026-11-01T01:30:00-04:00[America/New_York]",
    );
    expect(snap("2026-11-01T01:40-05:00[America/New_York]", 30, "floor")).toBe(
      "2026-11-01T01:30:00-05:00[America/New_York]",
    );
    expect(snap("2026-11-01T00:50-04:00[America/New_York]", 30, "ceil")).toBe(
      "2026-11-01T01:00:00-04:00[America/New_York]",
    );
    expect(snap("2026-10-25T01:20+00:00[Europe/London]", 15, "nearest")).toBe(
      "2026-10-25T01:15:00+00:00[Europe/London]",
    );
  });

  test("never moves floor later or ceil earlier across DST days", () => {
    const zones = ["America/New_York", "Europe/London", "Australia/Lord_Howe", "America/Santiago"];
    const start = NativeTemporal.Instant.from("2026-01-01T00:00Z").epochNanoseconds;
    const yearNanoseconds = 365n * 86_400_000_000_000n;

    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.bigInt({ min: 0n, max: yearNanoseconds }),
        fc.constantFrom(5, 10, 15, 20, 30),
        (timeZone, offset, increment) => {
          const value = new NativeTemporal.ZonedDateTime(start + offset, timeZone);
          const options = { increment, smallestUnit: "minute" } as const;
          const floor = snapZonedDateTime(value, { ...options, mode: "floor" });
          const ceil = snapZonedDateTime(value, { ...options, mode: "ceil" });

          expect(compareInstants(floor.toInstant(), value.toInstant())).toBeLessThanOrEqual(0);
          expect(compareInstants(value.toInstant(), ceil.toInstant())).toBeLessThanOrEqual(0);
          expect(floor.timeZoneId).toBe(timeZone);
        },
      ),
      { numRuns: 500 },
    );
  });

  test("snaps a nominal wall time before resolving its fold occurrence or gap", () => {
    const wall = (
      value: string,
      options: Partial<ZonedWallTimeSnapOptions> & { timeZone: string },
    ) =>
      snapZonedWallTime(NativeTemporal.PlainDateTime.from(value), {
        increment: 15,
        smallestUnit: "minute",
        ...options,
      }).toString();

    expect(wall("2026-11-01T00:55", { mode: "ceil", timeZone: "America/New_York" })).toBe(
      "2026-11-01T01:00:00-04:00[America/New_York]",
    );
    expect(
      wall("2026-11-01T00:55", { fold: "later", mode: "ceil", timeZone: "America/New_York" }),
    ).toBe("2026-11-01T01:00:00-05:00[America/New_York]");
    // 02:11 snaps to 02:20, inside the 02:00–02:30 gap, so it resolves to the transition.
    expect(wall("2026-10-04T02:11", { increment: 20, timeZone: "Australia/Lord_Howe" })).toBe(
      "2026-10-04T02:30:00+11:00[Australia/Lord_Howe]",
    );
    expect(wall("2026-09-06T00:20", { mode: "floor", timeZone: "America/Santiago" })).toBe(
      "2026-09-06T01:00:00-03:00[America/Santiago]",
    );
  });

  test("rejects increments native Temporal would truncate", () => {
    expect(() =>
      snapZonedDateTime(zoned("2026-01-15T10:00Z[UTC]"), {
        increment: 1.5,
        smallestUnit: "minute",
      }),
    ).toThrow("invalid-zoned-date-time-rounding-increment");
  });
});
