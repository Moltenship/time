import { wallTimeRoundingOptions, type WallTimeSnapOptions } from "../plain-time/rounding";

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
  const wallTime = zonedDateTime
    .toPlainDateTime()
    .round(wallTimeRoundingOptions(options, "invalid-zoned-date-time-rounding-increment"));
  const timeZone = zonedDateTime.timeZoneId;
  const earlier = wallTime.toZonedDateTime(timeZone, { disambiguation: "earlier" });

  if (!earlier.toPlainDateTime().equals(wallTime)) {
    // In a gap, "earlier" lands before the transition by the gap length.
    return earlier.getTimeZoneTransition("next")!;
  }

  const later = wallTime.toZonedDateTime(timeZone, { disambiguation: "later" });
  return later.offsetNanoseconds === zonedDateTime.offsetNanoseconds ? later : earlier;
}
