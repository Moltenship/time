import { compareInstants, type InstantInterval } from "../intervals/half-open.ts";

export const DEFAULT_INSTANT_ITERATION_LIMIT = 10_000;

export interface InstantIterationOptions {
  /** Maximum values produced before rejecting an unexpectedly large traversal. */
  readonly limit?: number;
  /** Positive, time-only Temporal duration used to advance each grid point. */
  readonly step: Temporal.DurationLike;
}

const NANOSECONDS_PER_HOUR = 3_600_000_000_000n;
const NANOSECONDS_PER_MINUTE = 60_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const NANOSECONDS_PER_MICROSECOND = 1_000n;

function iterationLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError("invalid-instant-iteration-limit");
  }

  return value;
}

function positiveTimeStep(value: Temporal.DurationLike): {
  readonly duration: Temporal.Duration;
  readonly nanoseconds: bigint;
} {
  const duration = globalThis.Temporal.Duration.from(value);
  if (
    duration.sign !== 1 ||
    duration.years !== 0 ||
    duration.months !== 0 ||
    duration.weeks !== 0 ||
    duration.days !== 0
  ) {
    throw new RangeError("invalid-instant-iteration-step");
  }

  const nanoseconds =
    BigInt(duration.hours) * NANOSECONDS_PER_HOUR +
    BigInt(duration.minutes) * NANOSECONDS_PER_MINUTE +
    BigInt(duration.seconds) * NANOSECONDS_PER_SECOND +
    BigInt(duration.milliseconds) * NANOSECONDS_PER_MILLISECOND +
    BigInt(duration.microseconds) * NANOSECONDS_PER_MICROSECOND +
    BigInt(duration.nanoseconds);
  if (nanoseconds <= 0n) {
    throw new RangeError("invalid-instant-iteration-step");
  }

  return { duration, nanoseconds };
}

/** Lazily visits instant grid points in `[start, end)` with an explicit positive step. */
export function* iterateInstants(
  range: InstantInterval,
  options: InstantIterationOptions,
): Generator<Temporal.Instant, void, undefined> {
  const limit = iterationLimit(options.limit ?? DEFAULT_INSTANT_ITERATION_LIMIT);
  const step = positiveTimeStep(options.step);
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
