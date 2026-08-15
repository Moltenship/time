import { compareInstants, type InstantInterval } from "../intervals/half-open";
import { positiveTimeDuration } from "../internal/time-duration";

export const DEFAULT_INSTANT_ITERATION_LIMIT = 10_000;

export interface InstantIterationOptions {
  /** Maximum values produced before rejecting an unexpectedly large traversal. */
  readonly limit?: number;
  /** Positive, time-only Temporal duration used to advance each grid point. */
  readonly step: Temporal.DurationLike;
}

function iterationLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("invalid-instant-iteration-limit");
  }

  return value;
}

/** Lazily visits instant grid points in `[start, end)` with an explicit positive step. */
export function* iterateInstants(
  range: InstantInterval,
  options: InstantIterationOptions,
): Generator<Temporal.Instant, void, undefined> {
  const limit = iterationLimit(options.limit ?? DEFAULT_INSTANT_ITERATION_LIMIT);
  const step = positiveTimeDuration(options.step, "invalid-instant-iteration-step");
  let current = range.start;
  let count = 0;

  while (compareInstants(current, range.end) < 0) {
    if (count >= limit) {
      throw new RangeError("instant-iteration-limit-exceeded");
    }

    yield current;
    count += 1;

    const remainingNanoseconds = range.end.epochNanoseconds - current.epochNanoseconds;
    if (step.nanoseconds >= remainingNanoseconds) {
      return;
    }

    current = current.add(step.duration);
  }
}
