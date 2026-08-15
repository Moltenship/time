import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  createFixedClock,
  halfOpenInterval,
  InvalidHalfOpenIntervalError,
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
  validateHalfOpenInterval,
  type InstantInterval,
  type PlainDateInterval,
  type PlainDateTimeInterval,
} from "../src/index";

const compareNumbers = (left: number, right: number) => left - right;

describe("half-open interval contracts", () => {
  test("constructs and freezes a non-empty interval", () => {
    const validation = validateHalfOpenInterval("test", 1, 3, compareNumbers);

    expect(validation).toMatchObject({
      interval: { end: 3, start: 1 },
      valid: true,
    });
    expect(validation.valid && Object.isFrozen(validation.interval)).toBe(true);
  });

  test.each([
    { end: 1, start: 1 },
    { end: 1, start: 2 },
  ])("rejects an empty or reversed interval: $start..$end", ({ end, start }) => {
    expect(validateHalfOpenInterval("test", start, end, compareNumbers)).toEqual({
      issue: { code: "start-not-before-end", end, start },
      valid: false,
    });
  });

  test("rejects an unordered comparator result", () => {
    expect(validateHalfOpenInterval("number", Number.NaN, 1, compareNumbers)).toEqual({
      issue: { code: "start-not-before-end", end: 1, start: Number.NaN },
      valid: false,
    });
  });

  test("offers an explicit throwing constructor", () => {
    expect(() => halfOpenInterval("test", 4, 4, compareNumbers)).toThrowError(
      InvalidHalfOpenIntervalError,
    );
    expect(() => halfOpenInterval("test", 4, 3, compareNumbers)).toThrow("start-not-before-end");
  });

  test("keeps every native Temporal interval type specific", () => {
    expectTypeOf<Parameters<typeof instantInterval>>().toEqualTypeOf<
      [start: Temporal.Instant, end: Temporal.Instant]
    >();
    expectTypeOf<ReturnType<typeof instantInterval>>().toEqualTypeOf<InstantInterval>();
    expectTypeOf<ReturnType<typeof plainDateInterval>>().toEqualTypeOf<PlainDateInterval>();
    expectTypeOf<ReturnType<typeof plainDateTimeInterval>>().toEqualTypeOf<PlainDateTimeInterval>();
    expectTypeOf<Parameters<typeof createFixedClock>[0]>().toEqualTypeOf<Temporal.Instant>();
  });
});
