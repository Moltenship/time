import { wallTimeRoundingOptions, type WallTimeSnapOptions } from "../plain-time/rounding";

const INVALID_INCREMENT = "invalid-zoned-date-time-rounding-increment";

export interface ZonedWallTimeSnapOptions extends WallTimeSnapOptions {
  /** Occurrence chosen when the snapped wall time is repeated (fall-back). Defaults to `"earlier"`. */
  readonly fold?: "earlier" | "later";
  readonly timeZone: string;
}

/** The transition instant that ends the gap containing `wallTime`: the gap's only real instant. */
function gapTransition(wallTime: Temporal.PlainDateTime, timeZone: string): Temporal.ZonedDateTime {
  // In a gap, "earlier" lands before the transition by the gap length.
  return wallTime
    .toZonedDateTime(timeZone, { disambiguation: "earlier" })
    .getTimeZoneTransition("next")!;
}

/**
 * Snaps a zoned value to a midnight-anchored wall-clock grid in its own timezone.
 *
 * A snapped wall time inside a fold keeps the input's offset, so a value in the repeated hour stays
 * in the same occurrence. A snapped wall time inside a gap resolves to the transition instant, the
 * only real instant at that wall position. `floor` therefore never moves later and `ceil` never
 * moves earlier, even on DST days.
 */
export function snapZonedDateTime(
  zonedDateTime: Temporal.ZonedDateTime,
  options: WallTimeSnapOptions,
): Temporal.ZonedDateTime {
  const rounding = wallTimeRoundingOptions(options, INVALID_INCREMENT);
  const wallTime = zonedDateTime.toPlainDateTime().round(rounding);
  // Native rounding prefers the input's offset in a fold but shifts a gap by its length.
  const rounded = zonedDateTime.round(rounding);

  return rounded.toPlainDateTime().equals(wallTime)
    ? rounded
    : gapTransition(wallTime, zonedDateTime.timeZoneId);
}

/**
 * Snaps a nominal wall time, such as a pointer position, to a midnight-anchored grid and only then
 * resolves it in `timeZone`: a repeated wall time picks the `fold` occurrence and a skipped one
 * resolves to the transition instant.
 */
export function snapZonedWallTime(
  wallTime: Temporal.PlainDateTime,
  options: ZonedWallTimeSnapOptions,
): Temporal.ZonedDateTime {
  const snapped = wallTime.round(wallTimeRoundingOptions(options, INVALID_INCREMENT));
  const resolved = snapped.toZonedDateTime(options.timeZone, {
    disambiguation: options.fold ?? "earlier",
  });

  return resolved.toPlainDateTime().equals(snapped)
    ? resolved
    : gapTransition(snapped, options.timeZone);
}
