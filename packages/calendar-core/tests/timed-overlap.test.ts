import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import {
  layoutTimedOverlaps,
  type OverlapLayout,
  type TimedOverlapItem,
  type TimedOverlapOptions,
} from "../src/layout/timed-overlap";

/** Items as `key start-end` in hours, e.g. `"a 9-11"`. */
function items(...specs: readonly string[]): readonly TimedOverlapItem[] {
  return specs.map((spec) => {
    const [key, range] = spec.split(" ") as [string, string];
    const [start, end] = range.split("-").map(Number) as [number, number];
    return { height: end - start, key, top: start };
  });
}

function placed(
  specs: readonly string[],
  options?: TimedOverlapOptions,
): readonly (readonly [string, number, number])[] {
  return layoutTimedOverlaps(items(...specs), options).map(({ item, left, width }) => [
    item.key,
    left,
    width,
  ]);
}

const policies: readonly OverlapLayout[] = ["columns", "equal", "stack"];

describe("columns overlap layout, the default", () => {
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
});

describe("equal overlap layout", () => {
  const equal = (...specs: readonly string[]) => placed(specs, { overlapLayout: "equal" });

  test("gives every event in a collision group the same width, without widening", () => {
    expect(equal("a 9-12", "b 9-10", "c 9-10", "d 10-11", "e 13-14")).toEqual([
      ["a", 0, 1 / 3],
      ["b", 1 / 3, 1 / 3],
      ["c", 2 / 3, 1 / 3],
      ["d", 1 / 3, 1 / 3],
      ["e", 0, 1],
    ]);
  });

  test("reuses a lane freed by an event that ends exactly at the next start", () => {
    expect(equal("a 9-11", "b 9-10", "c 10-11")).toEqual([
      ["a", 0, 0.5],
      ["b", 0.5, 0.5],
      ["c", 0.5, 0.5],
    ]);
  });
});

describe("stacked overlap layout", () => {
  const stack = (specs: readonly string[], stackIndent?: number) =>
    placed(specs, { overlapLayout: "stack", stackIndent });

  test("indents each event past the earlier events it overlaps and keeps it to the column's end", () => {
    expect(stack(["a 9-12", "b 9.5-11", "c 10-10.5", "d 11-12", "e 13-14"])).toEqual([
      ["a", 0, 1],
      ["b", 0.15, 0.85],
      ["c", 0.3, 0.7],
      // b has ended, so d only sits over a.
      ["d", 0.15, 0.85],
      ["e", 0, 1],
    ]);
  });

  test("cascades events that start together, longer first", () => {
    expect(stack(["b 9-10", "a 9-10", "c 9-11"])).toEqual([
      ["c", 0, 1],
      ["a", 0.15, 0.85],
      ["b", 0.3, 0.7],
    ]);
  });

  test("takes its indent as a fraction of the column width", () => {
    expect(stack(["a 9-11", "b 10-11"], 0.25)).toEqual([
      ["a", 0, 1],
      ["b", 0.25, 0.75],
    ]);
  });

  test("indents a deep stack less, so its top event keeps half the column", () => {
    const deep = stack(Array.from({ length: 11 }, (_, index) => `e${index} ${9 + index / 10}-12`));

    expect(deep.at(1)).toEqual(["e1", 0.05, 0.95]);
    expect(deep.at(-1)).toEqual(["e10", 0.5, 0.5]);
  });

  test("keeps back-to-back events full width", () => {
    expect(stack(["a 9-10", "b 10-11"])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  test("rejects an indent that is not positive", () => {
    for (const stackIndent of [0, -0.1, Number.NaN]) {
      expect(() => stack(["a 9-10"], stackIndent)).toThrow(new RangeError("invalid-stack-indent"));
    }
  });
});

test("rejects an unknown overlap layout", () => {
  expect(() => placed([], { overlapLayout: "grid" as OverlapLayout })).toThrow(
    new RangeError("invalid-overlap-layout"),
  );
});

/** Up to 40 items on a 96-step day, with stable keys, as random days. */
const day = fc
  .array(
    fc.record({ height: fc.integer({ max: 16, min: 1 }), top: fc.integer({ max: 92, min: 0 }) }),
    { maxLength: 40 },
  )
  .map((specs) => specs.map((spec, index) => ({ ...spec, key: `e${index}` })));

type Band = Pick<TimedOverlapItem, "height" | "top">;

function overlapVertically(left: Band, right: Band): boolean {
  return left.top < right.top + right.height && right.top < left.top + left.height;
}

describe.each(policies)("the %s layout's contract", (overlapLayout) => {
  const layout = (input: readonly TimedOverlapItem[]) =>
    layoutTimedOverlaps(input, { overlapLayout });

  test("places every item inside the column, independent of input order", () => {
    const scenario = day.chain((input) =>
      fc.tuple(
        fc.constant(input),
        fc.shuffledSubarray(input, { maxLength: input.length, minLength: input.length }),
      ),
    );

    fc.assert(
      fc.property(scenario, ([input, shuffled]) => {
        const placements = layout(input);

        expect(layout(shuffled)).toEqual(placements);
        expect(placements).toHaveLength(input.length);
        for (const { left, width } of placements) {
          expect(left).toBeGreaterThanOrEqual(0);
          expect(width).toBeGreaterThan(0);
          expect(left + width).toBeLessThanOrEqual(1 + 1e-12);
        }
      }),
      { numRuns: 200 },
    );
  });

  test("keeps every item's placement when an item it never collides with changes", () => {
    const scenario = day.chain((input) =>
      fc.tuple(
        fc.constant(input),
        fc.record({
          height: fc.integer({ max: 16, min: 1 }),
          key: fc.constant("extra"),
          top: fc.integer({ max: 92, min: 0 }),
        }),
      ),
    );

    fc.assert(
      fc.property(scenario, ([input, extra]) => {
        const before = layout(input);
        const after = layout([...input, extra]);
        // Items in another collision group than the extra one: nothing chains them to it.
        const group = new Set<string>([extra.key]);
        for (let grown = true; grown;) {
          grown = false;
          for (const item of input) {
            if (group.has(item.key)) continue;
            if (
              after.some((other) => group.has(other.item.key) && overlapVertically(item, other))
            ) {
              group.add(item.key);
              grown = true;
            }
          }
        }
        const unrelated = (placements: typeof before) =>
          placements.filter(({ item }) => !group.has(item.key));

        expect(unrelated(after)).toEqual(unrelated(before));
      }),
      { numRuns: 200 },
    );
  });

  test("lists placements as the keyboard walks them: top to bottom, then from the inline start", () => {
    fc.assert(
      fc.property(day, (input) => {
        const placements = layout(input);

        expect(placements.toSorted((a, b) => a.top - b.top || a.left - b.left)).toEqual(placements);
      }),
      { numRuns: 200 },
    );
  });

  test("never lets back-to-back events collide", () => {
    // Quarter hours as shares of a day, measured from midnight as the time grid measures them:
    // `top + height` can land a hair past the next event's top, as 10/24 + 1/24 does past 11/24.
    const chain = fc
      .array(fc.integer({ max: 8, min: 1 }), { maxLength: 12, minLength: 1 })
      .chain((lengths) =>
        fc
          .integer({ max: 96 - lengths.reduce((sum, length) => sum + length, 0), min: 0 })
          .map((first) => {
            let start = first;
            return lengths.map((length, index) => {
              const item = { height: length / 96, key: `e${index}`, top: start / 96 };
              start += length;
              return item;
            });
          }),
      );

    expect(layout(items("a 10-11", "b 11-11.25")).map(({ width }) => width)).toEqual([1, 1]);
    expect(
      layout([
        { height: 1 / 24, key: "a", top: 10 / 24 },
        { height: 1 / 96, key: "b", top: 11 / 24 },
      ]).map(({ width }) => width),
    ).toEqual([1, 1]);
    fc.assert(
      fc.property(chain, (input) => {
        expect(layout(input).map(({ left, width }) => [left, width])).toEqual(
          input.map(() => [0, 1]),
        );
      }),
      { numRuns: 300 },
    );
  });
});

describe("drawn overlap", () => {
  test("columns and equal lanes never overlap two placements", () => {
    fc.assert(
      fc.property(
        day,
        fc.constantFrom<OverlapLayout>("columns", "equal"),
        (input, overlapLayout) => {
          const placements = layoutTimedOverlaps(input, { overlapLayout });
          for (const [index, left] of placements.entries()) {
            for (const right of placements.slice(index + 1)) {
              const horizontal =
                left.left < right.left + right.width - 1e-12 &&
                right.left < left.left + left.width - 1e-12;
              expect(overlapVertically(left, right) && horizontal).toBe(false);
            }
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  test("a stack draws each placement over earlier ones, indented so theirs stays visible", () => {
    fc.assert(
      fc.property(day, (input) => {
        const placements = layoutTimedOverlaps(input, { overlapLayout: "stack" });
        for (const [index, earlier] of placements.entries()) {
          for (const later of placements.slice(index + 1)) {
            if (overlapVertically(earlier, later)) {
              expect(later.left).toBeGreaterThan(earlier.left);
              expect(later.left + later.width).toBeCloseTo(1, 12);
            }
          }
        }
      }),
      { numRuns: 300 },
    );
  });
});
