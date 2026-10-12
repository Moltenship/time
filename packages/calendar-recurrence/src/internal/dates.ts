// Date, time zone and interval helpers that the engine, the expander, the ICS bridge and edits
// share, on Temporal values. The engine's fast path on integer epoch days and wall seconds stays in
// `rule/calendar.ts` and `rule/clock.ts`.

import type { CalendarEventInterval } from "@moltenship/calendar-core";
import type { IcsDateValue, IcsWeekday } from "@moltenship/ics";

import type { RecurrenceDate, RecurrencePeriod } from "../types";

export type SeriesKind = CalendarEventInterval["kind"];

/** Each kind's date type, with its article. */
export const dateTypes: Readonly<Record<SeriesKind, string>> = {
  "all-day": "a PlainDate",
  floating: "a PlainDateTime",
  timed: "an Instant",
};

export function kindOf(date: unknown): SeriesKind | undefined {
  if (date instanceof Temporal.Instant) return "timed";
  if (date instanceof Temporal.PlainDate) return "all-day";
  if (date instanceof Temporal.PlainDateTime) return "floating";
  return undefined;
}

export function isPeriod(value: RecurrenceDate | RecurrencePeriod): value is RecurrencePeriod {
  return kindOf(value) === undefined;
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

/** From `start` to `end`: exact time for instants, days for dates, wall time for floating times. */
export function durationBetween(start: RecurrenceDate, end: RecurrenceDate): Temporal.Duration {
  if (start instanceof Temporal.Instant && end instanceof Temporal.Instant) return start.until(end);
  if (start instanceof Temporal.PlainDate && end instanceof Temporal.PlainDate) {
    return start.until(end);
  }
  if (start instanceof Temporal.PlainDateTime && end instanceof Temporal.PlainDateTime) {
    return start.until(end);
  }
  throw new RangeError("Recurrence dates of different kinds don't subtract.");
}

/** The smallest date after `date`, so a window ending there still includes `date`. */
export function justAfter(date: RecurrenceDate): RecurrenceDate {
  return date instanceof Temporal.PlainDate ? date.add({ days: 1 }) : date.add({ nanoseconds: 1 });
}

const validTimeZones = new Map<string, boolean>();

/** Whether Temporal knows the zone. */
export function isTimeZone(timeZone: string): boolean {
  let valid = validTimeZones.get(timeZone);
  if (valid === undefined) {
    try {
      new Temporal.ZonedDateTime(0n, timeZone);
      valid = true;
    } catch {
      valid = false;
    }
    if (validTimeZones.size < 256) validTimeZones.set(timeZone, valid);
  }
  return valid;
}

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

/**
 * A wall time in `timeZone` as RFC 5545 §3.3.5 resolves it, which is Temporal's `compatible`: a
 * time in a DST gap moves forward by the gap, and a repeated time takes its first instant.
 */
export function resolveWall(wall: Temporal.PlainDateTime, timeZone: string): Temporal.Instant {
  return wall.toZonedDateTime(timeZone, { disambiguation: "compatible" }).toInstant();
}

/** A date on its series' wall clock; all-day dates start at midnight. */
export function toWall(date: RecurrenceDate, time: SeriesTime): Temporal.PlainDateTime {
  if (date instanceof Temporal.Instant) {
    return date.toZonedDateTimeISO(time.timeZone).toPlainDateTime();
  }
  return date instanceof Temporal.PlainDate ? date.toPlainDateTime() : date;
}

/** A wall time as a date of the series' kind, resolved as the engine places occurrences. */
export function fromWall(wall: Temporal.PlainDateTime, time: SeriesTime): RecurrenceDate {
  switch (time.kind) {
    case "timed":
      return resolveWall(wall, time.timeZone);
    case "all-day":
      return wall.toPlainDate();
    case "floating":
      return wall;
  }
}

/**
 * `EventRecurrence.wallStart` in the ISO calendar, when it still resolves to the series' first
 * start. A stale one, left after the start moved, is `undefined`, as the engine ignores it.
 */
export function writtenStart(
  wallStart: Temporal.PlainDateTime | undefined,
  start: Temporal.Instant,
  timeZone: string,
): Temporal.PlainDateTime | undefined {
  const written = wallStart?.withCalendar("iso8601");
  return written !== undefined && resolveWall(written, timeZone).equals(start)
    ? written
    : undefined;
}

/** An occurrence's interval, in the kind and source time zone of the series' first occurrence. */
export function intervalOf(
  start: RecurrenceDate,
  end: RecurrenceDate,
  first: CalendarEventInterval,
): CalendarEventInterval {
  if (first.kind !== "timed") return { end, kind: first.kind, start } as CalendarEventInterval;
  const instants = {
    end: end as Temporal.Instant,
    kind: "timed",
    start: start as Temporal.Instant,
  };
  return first.sourceTimeZone === undefined
    ? (instants as CalendarEventInterval)
    : { ...instants, kind: "timed", sourceTimeZone: first.sourceTimeZone };
}

export function isInterval(value: unknown): value is CalendarEventInterval {
  if (typeof value !== "object" || value === null) return false;
  const { end, kind, start } = value as Partial<Record<"end" | "kind" | "start", unknown>>;
  return (
    (kind === "timed" || kind === "all-day" || kind === "floating") &&
    kindOf(start) === kind &&
    kindOf(end) === kind
  );
}

export function sameInterval(left: CalendarEventInterval, right: CalendarEventInterval): boolean {
  return (
    left.kind === right.kind &&
    compareDates(left.start, right.start) === 0 &&
    compareDates(left.end, right.end) === 0 &&
    (left.kind !== "timed" || left.sourceTimeZone === (right as typeof left).sourceTimeZone)
  );
}

/** The `RecurrenceDate` an ICS value names in its own kind; an unresolved time keeps its wall time. */
export function recurrenceDateOf(value: IcsDateValue): RecurrenceDate {
  switch (value.kind) {
    case "date":
      return value.date;
    case "utc":
      return value.instant;
    case "zoned":
      return value.zoned.toInstant();
    default:
      return value.wallTime;
  }
}

/** ISO weekday numbers: Monday is 1, Sunday 7. */
export const weekdayNumbers: Readonly<Record<IcsWeekday, number>> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

/** Weekdays from Monday. */
export const weekdays: readonly IcsWeekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
