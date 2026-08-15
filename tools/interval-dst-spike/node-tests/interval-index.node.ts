import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  FlattenIntervalIndex,
  ScanIntervalIndex,
  type HalfOpenInterval,
  type IntervalIndex,
} from "../src/interval-index";

function add<T>(index: IntervalIndex<T>, interval: HalfOpenInterval, value: T): IntervalIndex<T> {
  index.insert(interval, value);
  return index;
}

void test("half-open adjacency does not overlap", () => {
  const index = add(new FlattenIntervalIndex<string>(), { start: 0, end: 10 }, "left");
  index.insert({ start: 10, end: 20 }, "right");

  assert.deepEqual(index.query({ start: 10, end: 20 }), ["right"]);
  assert.deepEqual(index.query({ start: 5, end: 10 }), ["left"]);
});

void test("a cross-midnight event intersects both day slices but not its end adjacency", () => {
  const index = add(
    new FlattenIntervalIndex<string>(),
    { start: 23 * 60 + 30, end: 24 * 60 + 30 },
    "overnight",
  );

  assert.deepEqual(index.query({ start: 0, end: 24 * 60 }), ["overnight"]);
  assert.deepEqual(index.query({ start: 24 * 60, end: 48 * 60 }), ["overnight"]);
  assert.deepEqual(index.query({ start: 24 * 60 + 30, end: 25 * 60 }), []);
});

void test("duplicate candidate keys preserve distinct values", () => {
  const index = new FlattenIntervalIndex<string>();
  index.insert({ start: 5, end: 15 }, "first");
  index.insert({ start: 5, end: 15 }, "second");

  assert.equal(index.size, 2);
  assert.deepEqual(index.query({ start: 10, end: 11 }), ["first", "second"]);
});

void test("invalid event and query intervals are rejected at the wrapper", () => {
  const index = new FlattenIntervalIndex<string>();

  assert.throws(() => index.insert({ start: 1, end: 1 }, "empty"), RangeError);
  assert.throws(() => index.query({ start: 2, end: 1 }), RangeError);
  assert.throws(() => index.query({ start: Number.NaN, end: 1 }), RangeError);
});

void test("candidate queries agree with the scan oracle for randomized half-open intervals", () => {
  const entryArbitrary = fc.record({
    start: fc.integer({ min: -2_000, max: 2_000 }),
    length: fc.integer({ min: 1, max: 400 }),
  });
  const queryArbitrary = fc.record({
    start: fc.integer({ min: -2_200, max: 2_200 }),
    length: fc.integer({ min: 1, max: 500 }),
  });

  fc.assert(
    fc.property(
      fc.array(entryArbitrary, { maxLength: 250 }),
      queryArbitrary,
      (rawEntries, rawQuery) => {
        const tree = new FlattenIntervalIndex<number>();
        const scan = new ScanIntervalIndex<number>();

        for (const [value, entry] of rawEntries.entries()) {
          const interval = { start: entry.start, end: entry.start + entry.length };
          tree.insert(interval, value);
          scan.insert(interval, value);
        }

        const query = {
          start: rawQuery.start,
          end: rawQuery.start + rawQuery.length,
        };

        assert.deepEqual(tree.query(query), scan.query(query));
      },
    ),
    { numRuns: 1_000, seed: 0x16_2026 },
  );
});
