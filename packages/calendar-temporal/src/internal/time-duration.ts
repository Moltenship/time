const NANOSECONDS_PER_HOUR = 3_600_000_000_000n;
const NANOSECONDS_PER_MINUTE = 60_000_000_000n;
const NANOSECONDS_PER_SECOND = 1_000_000_000n;
const NANOSECONDS_PER_MILLISECOND = 1_000_000n;
const NANOSECONDS_PER_MICROSECOND = 1_000n;

export interface PositiveTimeDuration {
  readonly duration: Temporal.Duration;
  readonly nanoseconds: bigint;
}

export function positiveTimeDuration(
  value: Temporal.DurationLike,
  errorCode: string,
): PositiveTimeDuration {
  const duration = globalThis.Temporal.Duration.from(value);
  if (
    duration.sign !== 1 ||
    duration.years !== 0 ||
    duration.months !== 0 ||
    duration.weeks !== 0 ||
    duration.days !== 0
  ) {
    throw new RangeError(errorCode);
  }

  const nanoseconds =
    BigInt(duration.hours) * NANOSECONDS_PER_HOUR +
    BigInt(duration.minutes) * NANOSECONDS_PER_MINUTE +
    BigInt(duration.seconds) * NANOSECONDS_PER_SECOND +
    BigInt(duration.milliseconds) * NANOSECONDS_PER_MILLISECOND +
    BigInt(duration.microseconds) * NANOSECONDS_PER_MICROSECOND +
    BigInt(duration.nanoseconds);
  if (nanoseconds <= 0n) {
    throw new RangeError(errorCode);
  }

  return { duration, nanoseconds };
}
