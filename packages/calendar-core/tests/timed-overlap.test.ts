import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import { layoutTimedOverlaps, type TimedOverlapItem } from "../src/layout/timed-overlap";

/** Items as `key start-end` in hours, e.g. `"a 9-11"`. */
function items(...specs: readonly string[]): readonly TimedOverlapItem[] {
  return specs.map((spec) => {
    const [key, range] = spec.split(" ") as [string, string];
    const [start, end] = range.split("-").map(Number) as [number, number];
    return { height: end - start, key, top: start };
  });
}

function placed(specs: readonly string[]): readonly (readonly [string, number, number])[] {
  return layoutTimedOverlaps(items(...specs)).map(({ item, left, width }) => [
    item.key,
    left,
    width,
  ]);
}

describe("timed overlap layout", () => {
  test("keeps back-to-back events full width", () => {
    expect(placed(["a 9-10", "b 10-11", "c 11-12"])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
      ["c", 0, 1],
    ]);
  });

  test("reuses a lane freed by an event that ends exactly at the next start", () => {
    expect(placed(["a 9-11", "b 9-10", "c 10-11"])).toEqual([
      ["a", 0, 0.5],
      ["b", 0.5, 0.5],
      ["c", 0.5, 0.5],
    ]);
  });

  test("expands into free lanes to the right", () => {
    expect(placed(["a 9-12", "b 9-10", "c 9-10", "d 10-11"])).toEqual([
      ["a", 0, 1 / 3],
      ["b", 1 / 3, 1 / 3],
      ["c", 2 / 3, 1 / 3],
      ["d", 1 / 3, 2 / 3],
    ]);
  });

  test("packs a busy morning into three lanes and resets for the next collision group", () => {
    expect(
      placed(["a 8-10", "b 8.5-9.5", "c 9-11", "d 10-11", "e 10.5-12", "f 13-14", "g 13.5-15"]),
    ).toEqual([
      ["a", 0, 1 / 3],
      ["b", 1 / 3, 1 / 3],
      ["c", 2 / 3, 1 / 3],
      ["d", 0, 1 / 3],
      ["e", 1 / 3, 1 / 3],
      ["f", 0, 0.5],
      ["g", 0.5, 0.5],
    ]);
  });

  test("orders ties by top, longer first, then key", () => {
    expect(placed(["b 9-10", "a 9-10", "c 9-11"])).toEqual([
      ["c", 0, 1 / 3],
      ["a", 1 / 3, 1 / 3],
      ["b", 2 / 3, 1 / 3],
    ]);
  });

  test("reserves the minimum height so short events stay readable", () => {
    const short = items("a 9-9.25", "b 9.25-10");

    expect(layoutTimedOverlaps(short).map(({ width }) => width)).toEqual([1, 1]);
    expect(
      layoutTimedOverlaps(short, { minHeight: 0.5 }).map(({ height, width }) => [height, width]),
    ).toEqual([
      [0.5, 0.5],
      [0.75, 0.5],
    ]);
  });

  test("never overlaps two placements and is independent of input order", () => {
    const scenario = fc
      .array(
        fc.record({
          height: fc.integer({ max: 16, min: 1 }),
          top: fc.integer({ max: 92, min: 0 }),
        }),
        {
          maxLength: 40,
        },
      )
      .chain((specs) => {
        const input = specs.map((spec, index) => ({ ...spec, key: `e${index}` }));
        return fc.tuple(
          fc.constant(input),
          fc.shuffledSubarray(input, { maxLength: input.length, minLength: input.length }),
        );
      });

    fc.assert(
      fc.property(scenario, ([input, shuffled]) => {
        const placements = layoutTimedOverlaps(input);

        expect(layoutTimedOverlaps(shuffled)).toEqual(placements);
        expect(placements).toHaveLength(input.length);

        for (const [index, left] of placements.entries()) {
          expect(left.left + left.width).toBeLessThanOrEqual(1 + 1e-12);
          for (const right of placements.slice(index + 1)) {
            const vertical =
              left.top < right.top + right.height && right.top < left.top + left.height;
            const horizontal =
              left.left < right.left + right.width - 1e-12 &&
              right.left < left.left + left.width - 1e-12;
            expect(vertical && horizontal).toBe(false);
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
