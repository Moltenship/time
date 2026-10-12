import type { CalendarEventInterval } from "@moltenship/calendar-core";

import type { RecurrenceDate } from "../types";

export type SeriesKind = CalendarEventInterval["kind"];

/** The time a series repeats in: its kind, and the zone its dates are read in. */
export interface SeriesTime {
  readonly kind: SeriesKind;
  /**
   * For a timed series, the zone of its wall clock: `sourceTimeZone`, or the default zone. For the
   * others, the default zone, which instants are read in.
   */
  readonly timeZone: string;
}

export function seriesTimeOf(interval: CalendarEventInterval, defaultTimeZone = "UTC"): SeriesTime {
  return {
    kind: interval.kind,
    timeZone:
      interval.kind === "timed" ? (interval.sourceTimeZone ?? defaultTimeZone) : defaultTimeZone,
  };
}

/** Whether Temporal knows the zone. */
export function isTimeZone(timeZone: string): boolean {
  try {
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

export function kindOf(date: unknown): SeriesKind | undefined {
  if (date instanceof Temporal.Instant) return "timed";
  if (date instanceof Temporal.PlainDate) return "all-day";
  if (date instanceof Temporal.PlainDateTime) return "floating";
  return undefined;
}

/** Orders two dates of the same kind; throws a `RangeError` for dates of different kinds. */
export function compareDates(left: RecurrenceDate, right: RecurrenceDate): number {
  if (left instanceof Temporal.Instant && right instanceof Temporal.Instant) {
    return Temporal.Instant.compare(left, right);
  }
  if (left instanceof Temporal.PlainDate && right instanceof Temporal.PlainDate) {
    return Temporal.PlainDate.compare(left, right);
  }
  if (left instanceof Temporal.PlainDateTime && right instanceof Temporal.PlainDateTime) {
    return Temporal.PlainDateTime.compare(left, right);
  }
  throw new RangeError("Recurrence dates of different kinds don't compare.");
}

export function datesEqual(left: RecurrenceDate, right: RecurrenceDate): boolean {
  return kindOf(left) === kindOf(right) && compareDates(left, right) === 0;
}

/** The smallest date after `date`, so a window ending there still includes `date`. */
export function justAfter(date: RecurrenceDate): RecurrenceDate {
  return date instanceof Temporal.PlainDate ? date.add({ days: 1 }) : date.add({ nanoseconds: 1 });
}

/** A date on its series' wall clock; all-day dates start at midnight. */
export function toWall(date: RecurrenceDate, time: SeriesTime): Temporal.PlainDateTime {
  if (date instanceof Temporal.Instant) {
    return date.toZonedDateTimeISO(time.timeZone).toPlainDateTime();
  }
  return date instanceof Temporal.PlainDate ? date.toPlainDateTime() : date;
}

/**
 * A wall time as a date of the series' kind. A time in a DST gap moves forward and a repeated time
 * takes its first occurrence, as the engine places occurrences (RFC 5545 §3.3.10).
 */
export function fromWall(wall: Temporal.PlainDateTime, time: SeriesTime): RecurrenceDate {
  switch (time.kind) {
    case "timed":
      return wall.toZonedDateTime(time.timeZone, { disambiguation: "compatible" }).toInstant();
    case "all-day":
      return wall.toPlainDate();
    case "floating":
      return wall;
  }
}

/** Same members, in any order. */
export function sameResources(
  left: readonly (string | number)[],
  right: readonly (string | number)[],
): boolean {
  return left.length === right.length && left.every((resourceId) => right.includes(resourceId));
}
