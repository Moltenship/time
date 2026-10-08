import { assertRoundingIncrement } from "../internal/rounding-increment";

export type PlainTimeRoundingMode = NonNullable<
  Temporal.RoundingOptions<Temporal.TimeUnit>["roundingMode"]
>;

export type WallTimeSnapMode = "ceil" | "floor" | "nearest";

export interface PlainTimeRoundingOptions {
  readonly increment?: number;
  readonly roundingMode?: PlainTimeRoundingMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

/** A midnight-anchored wall-clock grid: `increment` must divide the next larger unit. */
export interface WallTimeSnapOptions {
  readonly increment: number;
  readonly mode?: WallTimeSnapMode;
  readonly smallestUnit: Temporal.TimeUnit;
}

export interface SnappedPlainTime {
  /** `1` when rounding up crossed midnight, so `time` is `00:00` on the following day. */
  readonly days: 0 | 1;
  readonly time: Temporal.PlainTime;
}

export function wallTimeRoundingOptions(
  options: WallTimeSnapOptions,
  errorCode: string,
): Temporal.RoundingOptions<Temporal.TimeUnit> {
  assertRoundingIncrement(options.increment, errorCode);

  return {
    roundingIncrement: options.increment,
    roundingMode:
      options.mode === "floor" ? "floor" : options.mode === "ceil" ? "ceil" : "halfExpand",
    smallestUnit: options.smallestUnit,
  };
}

/** Rounds a wall-clock time through the native Temporal operation, wrapping at midnight. */
export function roundPlainTime(
  time: Temporal.PlainTime,
  options: PlainTimeRoundingOptions,
): Temporal.PlainTime {
  const increment = options.increment ?? 1;
  assertRoundingIncrement(increment, "invalid-plain-time-rounding-increment");

  return time.round({
    roundingIncrement: increment,
    roundingMode: options.roundingMode,
    smallestUnit: options.smallestUnit,
  });
}

/** Snaps a wall-clock time to a midnight-anchored grid and reports a carry into the next day. */
export function snapPlainTime(
  time: Temporal.PlainTime,
  options: WallTimeSnapOptions,
): SnappedPlainTime {
  const reference = new globalThis.Temporal.PlainDate(2000, 1, 1);
  const snapped = reference
    .toPlainDateTime(time)
    .round(wallTimeRoundingOptions(options, "invalid-plain-time-rounding-increment"));

  return Object.freeze({
    days: snapped.day === reference.day ? 0 : 1,
    time: snapped.toPlainTime(),
  });
}
