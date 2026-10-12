import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { getEventEnd, type IcsDateValue, type IcsPeriod } from "@moltenship/ics";

import { coerceRecurrenceDate, type RecurrenceDateRole } from "../dates";
import type { RecurrenceDate } from "../types";

export function instantOf(value: IcsDateValue): Temporal.Instant | undefined {
  if (value.kind === "utc") return value.instant;
  return value.kind === "zoned" ? value.zoned.toInstant() : undefined;
}

/** The `RecurrenceDate` a value names in its own kind; an unresolved time keeps its wall time. */
export function naturalDate(value: IcsDateValue): RecurrenceDate {
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

// A zoned value's date or wall time is the one written, not UTC's.
function coerce(
  value: IcsDateValue,
  first: CalendarEventInterval,
  role: RecurrenceDateRole,
): RecurrenceDate | undefined {
  const options = value.kind === "zoned" ? { timeZone: value.zoned.timeZoneId } : {};
  return coerceRecurrenceDate(naturalDate(value), first, role, options);
}

export interface SeriesDate {
  /** `undefined` when the value can't stand for its role in the series. */
  readonly date: RecurrenceDate | undefined;
  /** Why it is a `date-kind-mismatch`, when it is one. */
  readonly mismatch?: string;
}

/**
 * `value` in the kind of the series' first occurrence. A DATE where the series is DATE-TIME, or the
 * other way round, or a TZID that resolved to no zone is a mismatch, except a date-only EXDATE,
 * which excludes the whole day.
 */
export function toSeriesDate(
  value: IcsDateValue,
  first: CalendarEventInterval,
  role: RecurrenceDateRole,
  label: string,
): SeriesDate {
  const date = coerce(value, first, role);
  const isDate = value.kind === "date";
  const differs = isDate !== (first.kind === "all-day") && !(isDate && role === "exception");
  if (value.kind !== "unresolved" && !differs) return { date };

  const zone = first.kind === "timed" ? ` in ${first.sourceTimeZone ?? "UTC"}` : "";
  const problem =
    value.kind === "unresolved"
      ? `has TZID "${value.tzid}", which resolved to no time zone`
      : `is a ${isDate ? "date" : "date-time"}, but the series is ${first.kind}`;
  const outcome =
    date === undefined
      ? "it was dropped"
      : first.kind === "all-day"
        ? "it was read as its date"
        : isDate
          ? `it was read as the end of that day${zone}`
          : `it was read as a wall time${zone}`;
  return { date, mismatch: `${label} ${problem}; ${outcome}.` };
}

// Nanoseconds since the epoch, wall times as if in UTC, to compare lengths of any kind.
function epochOf(date: RecurrenceDate): bigint {
  return date instanceof Temporal.Instant
    ? date.epochNanoseconds
    : Temporal.PlainDateTime.from(date).toZonedDateTime("UTC").epochNanoseconds;
}

/** Whether an RDATE PERIOD lasts as long as the series' first occurrence. */
export function lastsAsFirst(period: IcsPeriod, first: CalendarEventInterval): boolean {
  const start = coerce(period.start, first, "start");
  const end = coerce(getEventEnd(period), first, "start");
  if (start === undefined || end === undefined) return true;
  return epochOf(end) - epochOf(start) === epochOf(first.end) - epochOf(first.start);
}
