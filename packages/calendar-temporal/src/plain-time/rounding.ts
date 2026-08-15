export type PlainTimeRoundingMode = NonNullable<
  Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]
>;

export type PlainTimeSnapMode = "ceil" | "floor" | "nearest";

export interface PlainTimeRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: PlainTimeRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

export interface PlainTimeSnapOptions {
  readonly increment: number;
  readonly mode?: PlainTimeSnapMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

function assertIncrement(increment: number): void {
  if (!Number.isSafeInteger(increment) || increment < 1) {
    throw new RangeError("invalid-plain-time-rounding-increment");
  }
}

/** Rounds a wall-clock time through the native Temporal operation. */
export function roundPlainTime(
  time: Temporal.PlainTime,
  options: PlainTimeRoundingOptions,
): Temporal.PlainTime {
  const increment = options.increment ?? 1;
  assertIncrement(increment);

  return time.round({
    roundingIncrement: increment,
    roundingMode: options.roundingMode,
    smallestUnit: options.smallestUnit,
  });
}

/** Snaps a wall-clock time to a midnight-anchored grid. */
export function snapPlainTime(
  time: Temporal.PlainTime,
  options: PlainTimeSnapOptions,
): Temporal.PlainTime {
  const roundingMode: PlainTimeRoundingMode =
    options.mode === "floor" ? "floor" : options.mode === "ceil" ? "ceil" : "halfExpand";

  return roundPlainTime(time, {
    increment: options.increment,
    roundingMode,
    smallestUnit: options.smallestUnit,
  });
}
