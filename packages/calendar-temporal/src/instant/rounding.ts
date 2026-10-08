import { assertRoundingIncrement } from "../internal/rounding-increment";

export type InstantRoundingMode = NonNullable<
  Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]
>;

export interface InstantRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: InstantRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

/**
 * Rounds an absolute instant on the Unix-epoch grid through the native Temporal operation.
 * Calendar grids are wall-clock grids: use `snapZonedDateTime` for those.
 */
export function roundInstant(
  instant: Temporal.Instant,
  options: InstantRoundingOptions,
): Temporal.Instant {
  const increment = options.increment ?? 1;
  assertRoundingIncrement(increment, "invalid-instant-rounding-increment");

  return instant.round({
    roundingIncrement: increment,
    roundingMode: options.roundingMode,
    smallestUnit: options.smallestUnit,
  });
}
