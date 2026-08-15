import { comparePlainDates, type PlainDateInterval } from "../intervals/half-open.ts";

export const DEFAULT_PLAIN_DATE_ITERATION_LIMIT = 10_000;

export interface PlainDateIterationOptions {
  /** Maximum values produced before rejecting an unexpectedly large traversal. */
  readonly limit?: number;
  /** Positive whole-day stride. Defaults to one day. */
  readonly stepDays?: number;
}

function positiveInteger(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(code);
  }

  return value;
}

/** Lazily visits dates in a half-open interval and never reads the host timezone. */
export function* iteratePlainDates(
  range: PlainDateInterval,
  options: PlainDateIterationOptions = {},
): Generator<Temporal.PlainDate, void, undefined> {
  const limit = positiveInteger(
    options.limit ?? DEFAULT_PLAIN_DATE_ITERATION_LIMIT,
    "invalid-plain-date-iteration-limit",
  );
  const stepDays = positiveInteger(options.stepDays ?? 1, "invalid-plain-date-iteration-step");
  let current = range.start;
  let count = 0;

  while (comparePlainDates(current, range.end) < 0) {
    if (count >= limit) {
      throw new RangeError("plain-date-iteration-limit-exceeded");
    }

    yield current;
    count += 1;

    const remainingDays = current.until(range.end, { largestUnit: "day" }).days;
    if (stepDays >= remainingDays) {
      return;
    }

    current = current.add({ days: stepDays });
  }
}
