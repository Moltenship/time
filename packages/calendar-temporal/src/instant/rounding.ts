export type InstantRoundingMode = NonNullable<
  Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]
>;

export type InstantSnapMode = "ceil" | "floor" | "nearest";

export interface InstantRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: InstantRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

export interface InstantSnapOptions {
  readonly increment: number;
  readonly mode?: InstantSnapMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

function assertIncrement(increment: number): void {
  if (!Number.isSafeInteger(increment) || increment < 1) {
    throw new RangeError("invalid-instant-rounding-increment");
  }
}

/** Rounds an absolute instant through the native Temporal operation. */
export function roundInstant(
  instant: Temporal.Instant,
  options: InstantRoundingOptions,
): Temporal.Instant {
  const increment = options.increment ?? 1;
  assertIncrement(increment);

  return instant.round({
    roundingIncrement: increment,
    roundingMode: options.roundingMode,
    smallestUnit: options.smallestUnit,
  });
}

/** Snaps an instant to a Unix-epoch-anchored grid. */
export function snapInstant(
  instant: Temporal.Instant,
  options: InstantSnapOptions,
): Temporal.Instant {
  const roundingMode: InstantRoundingMode =
    options.mode === "floor" ? "floor" : options.mode === "ceil" ? "ceil" : "halfExpand";

  return roundInstant(instant, {
    increment: options.increment,
    roundingMode,
    smallestUnit: options.smallestUnit,
  });
}
