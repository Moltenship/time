import fc from "fast-check";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  clampInstantInterval,
  clampPlainDateInterval,
  InvalidHalfOpenIntervalError,
  instantInterval,
  instantIntervalContains,
  instantIntervalsIntersect,
  intersectInstantIntervals,
  intersectPlainDateIntervals,
  plainDateInterval,
  plainDateIntervalContains,
  plainDateIntervalContainsInterval,
  plainDateIntervalsIntersect,
  plainDateTimeInterval,
  plainDateTimeIntervalContains,
  splitInstantInterval,
  splitPlainDateInterval,
  splitPlainDateTimeInterval,
  type InstantInterval,
  type PlainDateInterval,
  type PlainDateTimeInterval,
} from "../src/index";
import { NativeTemporal } from "./native-temporal";

const dateOrigin = NativeTemporal.PlainDate.from("2000-01-01");

function dateAt(offset: number): Temporal.PlainDate {
  return dateOrigin.add({ days: offset });
}

describe("type-specific half-open interval operations", () => {
  test("treats adjacent date intervals as disjoint", () => {
    const left = plainDateInterval(dateAt(0), dateAt(2));
    const right = plainDateInterval(dateAt(2), dateAt(5));

    expect(plainDateIntervalsIntersect(left, right)).toBe(false);
    expect(intersectPlainDateIntervals(left, right)).toBeNull();
    expect(plainDateIntervalContains(left, dateAt(0))).toBe(true);
    expect(plainDateIntervalContains(left, dateAt(2))).toBe(false);
  });

  test("rejects empty and reversed native Temporal intervals", () => {
    expect(() => plainDateInterval(dateAt(1), dateAt(1))).toThrowError(
      InvalidHalfOpenIntervalError,
    );
    expect(() => plainDateInterval(dateAt(2), dateAt(1))).toThrow("start-not-before-end");
  });

  test("intersects and clamps randomized date intervals symmetrically", () => {
    fc.assert(
      fc.property(
        fc.record({
          leftLength: fc.integer({ min: 1, max: 90 }),
          leftStart: fc.integer({ min: -2_000, max: 2_000 }),
          rightLength: fc.integer({ min: 1, max: 90 }),
          rightStart: fc.integer({ min: -2_000, max: 2_000 }),
        }),
        ({ leftLength, leftStart, rightLength, rightStart }) => {
          const leftEnd = leftStart + leftLength;
          const rightEnd = rightStart + rightLength;
          const left = plainDateInterval(dateAt(leftStart), dateAt(leftEnd));
          const right = plainDateInterval(dateAt(rightStart), dateAt(rightEnd));
          const expectedStart = Math.max(leftStart, rightStart);
          const expectedEnd = Math.min(leftEnd, rightEnd);
          const expectedIntersects = expectedStart < expectedEnd;

          expect(plainDateIntervalsIntersect(left, right)).toBe(expectedIntersects);
          expect(plainDateIntervalsIntersect(right, left)).toBe(expectedIntersects);

          const intersection = intersectPlainDateIntervals(left, right);
          const clamp = clampPlainDateInterval(left, right);
          if (!expectedIntersects) {
            expect(intersection).toBeNull();
            expect(clamp).toBeNull();
            return;
          }

          expect(intersection?.start.equals(dateAt(expectedStart))).toBe(true);
          expect(intersection?.end.equals(dateAt(expectedEnd))).toBe(true);
          expect(clamp?.start.equals(intersection!.start)).toBe(true);
          expect(clamp?.end.equals(intersection!.end)).toBe(true);
          expect(plainDateIntervalContainsInterval(left, intersection!)).toBe(true);
          expect(Object.isFrozen(intersection)).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });

  test("split date intervals round-trips their original boundaries", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 366 }),
        fc.integer({ min: 0, max: 10_000 }),
        (length, splitSeed) => {
          const splitOffset = 1 + (splitSeed % (length - 1));
          const interval = plainDateInterval(dateAt(0), dateAt(length));
          const splitAt = dateAt(splitOffset);
          const parts = splitPlainDateInterval(interval, splitAt);

          expect(parts).toHaveLength(2);
          expect(parts[0].start.equals(interval.start)).toBe(true);
          expect(parts[0].end.equals(splitAt)).toBe(true);
          expect(parts[1]?.start.equals(splitAt)).toBe(true);
          expect(parts[1]?.end.equals(interval.end)).toBe(true);
          expect(Object.isFrozen(parts)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  test("preserves an interval when the split point is not interior", () => {
    const interval = plainDateInterval(dateAt(0), dateAt(2));

    expect(splitPlainDateInterval(interval, interval.start)).toEqual([interval]);
    expect(splitPlainDateInterval(interval, interval.end)).toEqual([interval]);
    expect(splitPlainDateInterval(interval, dateAt(4))).toEqual([interval]);
  });

  test("applies the same contract to instants and plain date-times", () => {
    const firstInstant = NativeTemporal.Instant.from("2026-08-15T10:00:00Z");
    const middleInstant = NativeTemporal.Instant.from("2026-08-15T11:00:00Z");
    const lastInstant = NativeTemporal.Instant.from("2026-08-15T12:00:00Z");
    const instantRange = instantInterval(firstInstant, lastInstant);
    const instantTail = instantInterval(middleInstant, lastInstant);

    expect(instantIntervalContains(instantRange, middleInstant)).toBe(true);
    expect(instantIntervalsIntersect(instantRange, instantTail)).toBe(true);
    expect(intersectInstantIntervals(instantRange, instantTail)).toEqual(instantTail);
    expect(clampInstantInterval(instantRange, instantTail)).toEqual(instantTail);
    expect(splitInstantInterval(instantRange, middleInstant)).toHaveLength(2);

    const firstDateTime = NativeTemporal.PlainDateTime.from("2026-08-15T10:00");
    const middleDateTime = NativeTemporal.PlainDateTime.from("2026-08-15T11:00");
    const lastDateTime = NativeTemporal.PlainDateTime.from("2026-08-15T12:00");
    const dateTimeRange = plainDateTimeInterval(firstDateTime, lastDateTime);

    expect(plainDateTimeIntervalContains(dateTimeRange, middleDateTime)).toBe(true);
    expect(splitPlainDateTimeInterval(dateTimeRange, middleDateTime)).toHaveLength(2);
  });

  test("keeps operation signatures specific to one Temporal type", () => {
    expectTypeOf<Parameters<typeof intersectInstantIntervals>>().toEqualTypeOf<
      [left: InstantInterval, right: InstantInterval]
    >();
    expectTypeOf<
      ReturnType<typeof intersectPlainDateIntervals>
    >().toEqualTypeOf<PlainDateInterval | null>();
    expectTypeOf<ReturnType<typeof splitPlainDateTimeInterval>>().toEqualTypeOf<
      | readonly [interval: PlainDateTimeInterval]
      | readonly [before: PlainDateTimeInterval, after: PlainDateTimeInterval]
    >();
  });
});
