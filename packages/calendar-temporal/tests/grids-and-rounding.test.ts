import fc from "fast-check";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  compareInstants,
  comparePlainDates,
  comparePlainTimes,
  monthGrid,
  roundInstant,
  roundPlainTime,
  snapInstant,
  snapPlainTime,
  weekRange,
  type MonthGrid,
  type PlainTimeSnapOptions,
  type WeekStartsOn,
} from "../src/index";
import { NativeTemporal } from "./native-temporal";

describe("PlainDate calendar grids", () => {
  test("builds bounded natural and fixed month grids", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1900, max: 2100 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 7 }),
        fc.boolean(),
        (year, month, weekStart, fixedWeeks) => {
          const anchor = NativeTemporal.PlainDate.from({ day: 15, month, year });
          const grid = monthGrid(anchor, {
            fixedWeeks,
            weekStartsOn: weekStart as WeekStartsOn,
          });
          const nextMonth = grid.month.add({ months: 1 });

          expect(grid.month.day).toBe(1);
          expect(grid.range.start.dayOfWeek).toBe(weekStart);
          if (fixedWeeks) {
            expect(grid.weeks).toHaveLength(6);
          } else {
            expect([4, 5, 6]).toContain(grid.weeks.length);
          }
          expect(grid.weeks[0]).toEqual(expect.objectContaining({ start: grid.range.start }));
          expect(grid.weeks.at(-1)).toEqual(expect.objectContaining({ end: grid.range.end }));
          expect(comparePlainDates(grid.range.start, grid.month)).toBeLessThanOrEqual(0);
          expect(comparePlainDates(nextMonth, grid.range.end)).toBeLessThanOrEqual(0);
          expect(Object.isFrozen(grid)).toBe(true);
          expect(Object.isFrozen(grid.weeks)).toBe(true);

          for (let index = 1; index < grid.weeks.length; index += 1) {
            expect(grid.weeks[index - 1]!.end.equals(grid.weeks[index]!.start)).toBe(true);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  test("returns the containing week for every explicit week rule", () => {
    const anchor = NativeTemporal.PlainDate.from("2026-08-15");

    for (let day = 1; day <= 7; day += 1) {
      const range = weekRange(anchor, { weekStartsOn: day as WeekStartsOn });
      expect(range.start.dayOfWeek).toBe(day);
      expect(range.start.until(range.end, { largestUnit: "day" }).days).toBe(7);
      expect(comparePlainDates(range.start, anchor)).toBeLessThanOrEqual(0);
      expect(comparePlainDates(anchor, range.end)).toBeLessThan(0);
    }
  });

  test("rejects invalid week starts", () => {
    const anchor = NativeTemporal.PlainDate.from("2026-08-15");
    expect(() => weekRange(anchor, { weekStartsOn: 0 as WeekStartsOn })).toThrow(
      "invalid-week-start",
    );
  });
});

describe("type-specific rounding and snapping", () => {
  test("keeps randomized PlainTime grid snaps aligned and idempotent", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 23 }),
        fc.integer({ min: 0, max: 59 }),
        fc.constantFrom(1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30),
        (hour, minute, increment) => {
          const time = NativeTemporal.PlainTime.from({ hour, minute, second: 30 });
          const snapped = snapPlainTime(time, { increment, smallestUnit: "minute" });

          expect(snapped.minute % increment).toBe(0);
          expect(
            snapPlainTime(snapped, { increment, smallestUnit: "minute" }).equals(snapped),
          ).toBe(true);
        },
      ),
      { numRuns: 250 },
    );
  });

  test("rounds and snaps PlainTime without a date or timezone", () => {
    const time = NativeTemporal.PlainTime.from("10:07:30");

    expect(
      roundPlainTime(time, {
        increment: 15,
        roundingMode: "halfExpand",
        smallestUnit: "minute",
      }).toString(),
    ).toBe("10:15:00");
    expect(
      snapPlainTime(time, { increment: 15, mode: "floor", smallestUnit: "minute" }).toString(),
    ).toBe("10:00:00");
    expect(
      snapPlainTime(time, { increment: 15, mode: "ceil", smallestUnit: "minute" }).toString(),
    ).toBe("10:15:00");
    expect(
      comparePlainTimes(
        snapPlainTime(time, { increment: 15, smallestUnit: "minute" }),
        NativeTemporal.PlainTime.from("10:00"),
      ),
    ).toBeGreaterThan(0);
  });

  test("rounds and snaps instants on the epoch grid", () => {
    const instant = NativeTemporal.Instant.from("1970-01-01T00:00:00.0075Z");
    const floor = snapInstant(instant, {
      increment: 10,
      mode: "floor",
      smallestUnit: "millisecond",
    });
    const nearest = roundInstant(instant, {
      increment: 10,
      roundingMode: "halfExpand",
      smallestUnit: "millisecond",
    });

    expect(floor.epochMilliseconds).toBe(0);
    expect(nearest.epochMilliseconds).toBe(10);
    expect(compareInstants(floor, nearest)).toBeLessThan(0);
  });

  test("rejects invalid increments before calling native rounding", () => {
    const time = NativeTemporal.PlainTime.from("10:00");
    const instant = NativeTemporal.Instant.fromEpochMilliseconds(0);

    expect(() => roundPlainTime(time, { increment: 0, smallestUnit: "minute" })).toThrow(
      "invalid-plain-time-rounding-increment",
    );
    expect(() => roundInstant(instant, { increment: 1.5, smallestUnit: "millisecond" })).toThrow(
      "invalid-instant-rounding-increment",
    );
    expect(() => roundPlainTime(time, { increment: 7, smallestUnit: "minute" })).toThrow(
      RangeError,
    );
  });

  test("keeps grid and snapping return types type specific", () => {
    expectTypeOf<ReturnType<typeof monthGrid>>().toEqualTypeOf<MonthGrid>();
    expectTypeOf<Parameters<typeof snapPlainTime>>().toEqualTypeOf<
      [time: Temporal.PlainTime, options: PlainTimeSnapOptions]
    >();
    expectTypeOf<ReturnType<typeof snapInstant>>().toEqualTypeOf<Temporal.Instant>();
  });
});
