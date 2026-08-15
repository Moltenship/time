import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import {
  comparePlainDates,
  instantInterval,
  iterateInstants,
  iteratePlainDates,
  plainDateInterval,
} from "../src/index.ts";
import { NativeTemporal } from "./native-temporal.ts";

const dateOrigin = NativeTemporal.PlainDate.from("2000-01-01");

function dateAt(offset: number): Temporal.PlainDate {
  return dateOrigin.add({ days: offset });
}

describe("bounded lazy Temporal iteration", () => {
  test("iterates randomized date ranges with half-open endpoints and positive strides", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -5_000, max: 5_000 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 31 }),
        (startOffset, length, stepDays) => {
          const range = plainDateInterval(dateAt(startOffset), dateAt(startOffset + length));
          const dates = Array.from(iteratePlainDates(range, { stepDays }));

          expect(dates).toHaveLength(Math.ceil(length / stepDays));
          expect(dates[0]?.equals(range.start)).toBe(true);
          expect(dates.every((date) => comparePlainDates(date, range.end) < 0)).toBe(true);

          for (let index = 1; index < dates.length; index += 1) {
            expect(dates[index - 1]!.until(dates[index]!, { largestUnit: "day" }).days).toBe(
              stepDays,
            );
          }
        },
      ),
      { numRuns: 350 },
    );
  });

  test("rejects invalid strides and traversal limits", () => {
    const range = plainDateInterval(dateAt(0), dateAt(4));

    expect(() => Array.from(iteratePlainDates(range, { stepDays: 0 }))).toThrow(
      "invalid-plain-date-iteration-step",
    );
    expect(() => Array.from(iteratePlainDates(range, { limit: 2 }))).toThrow(
      "plain-date-iteration-limit-exceeded",
    );
  });

  test("iterates instant grids and preserves exact step round trips", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1_000_000, max: 1_000_000 }),
        fc.integer({ min: 1, max: 10_000 }),
        fc.integer({ min: 1, max: 200 }),
        (startMilliseconds, stepMilliseconds, count) => {
          const start = NativeTemporal.Instant.fromEpochMilliseconds(startMilliseconds);
          const end = start.add({ milliseconds: stepMilliseconds * count });
          const values = Array.from(
            iterateInstants(instantInterval(start, end), {
              step: { milliseconds: stepMilliseconds },
            }),
          );

          expect(values).toHaveLength(count);
          expect(values[0]?.equals(start)).toBe(true);
          expect(values.at(-1)?.add({ milliseconds: stepMilliseconds }).equals(end)).toBe(true);
        },
      ),
      { numRuns: 300 },
    );
  });

  test("rejects non-progressing instant steps and explicit over-limit traversals", () => {
    const start = NativeTemporal.Instant.fromEpochMilliseconds(0);
    const range = instantInterval(start, start.add({ seconds: 4 }));

    expect(() => Array.from(iterateInstants(range, { step: { seconds: 0 } }))).toThrow(
      "invalid-instant-iteration-step",
    );
    expect(() => Array.from(iterateInstants(range, { step: { days: 1 } }))).toThrow(RangeError);
    expect(() => Array.from(iterateInstants(range, { limit: 2, step: { seconds: 1 } }))).toThrow(
      "instant-iteration-limit-exceeded",
    );
  });

  test("terminates overshooting strides without leaving the Temporal domain", () => {
    const dateStart = NativeTemporal.PlainDate.from("2026-08-15");
    const dateEnd = dateStart.add({ days: 1 });
    expect(
      Array.from(
        iteratePlainDates(plainDateInterval(dateStart, dateEnd), {
          stepDays: 1_000_000_000,
        }),
      ),
    ).toEqual([dateStart]);

    const maximumDate = NativeTemporal.PlainDate.from("+275760-09-13");
    const penultimateDate = maximumDate.subtract({ days: 1 });
    expect(
      Array.from(
        iteratePlainDates(plainDateInterval(penultimateDate, maximumDate), {
          stepDays: 2,
        }),
      ),
    ).toEqual([penultimateDate]);

    const instantStart = NativeTemporal.Instant.from("2026-08-15T00:00:00Z");
    const instantEnd = instantStart.add({ nanoseconds: 1 });
    expect(
      Array.from(
        iterateInstants(instantInterval(instantStart, instantEnd), {
          step: { hours: 3_000_000_000 },
        }),
      ),
    ).toEqual([instantStart]);

    const maximumInstant =
      NativeTemporal.Instant.fromEpochNanoseconds(8_640_000_000_000_000_000_000n);
    const penultimateInstant = maximumInstant.subtract({ nanoseconds: 1 });
    expect(
      Array.from(
        iterateInstants(instantInterval(penultimateInstant, maximumInstant), {
          step: { nanoseconds: 2 },
        }),
      ),
    ).toEqual([penultimateInstant]);
  });
});
