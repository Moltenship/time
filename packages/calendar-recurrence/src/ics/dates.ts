import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { getEventEnd, type IcsDateValue, type IcsPeriod } from "@moltenship/ics";

import { coerceRecurrenceDate, type RecurrenceDateRole } from "../dates";
import type { RecurrenceDate, RecurrencePeriod } from "../types";

/** Where a series' dates are read. */
export interface SeriesTime {
  readonly first: CalendarEventInterval;
  /** The feed's zone, which instants on all-day and floating series are read in; else UTC. */
  readonly timeZone?: string;
}

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

/**
 * An override's RECURRENCE-ID when its master isn't among the events: in its own kind, except that
 * a floating one on a timed override resolves in the override's zone, as its series would.
 */
export function ownRecurrenceId(
  value: IcsDateValue,
  own: CalendarEventInterval | undefined,
): RecurrenceDate {
  const date = naturalDate(value);
  if (value.kind !== "floating" || own?.kind !== "timed") return date;
  return coerceRecurrenceDate(date, own, "start") ?? date;
}

// A zoned value's date or wall time is the one written; a UTC one's is the feed's.
function coerce(
  value: IcsDateValue,
  series: SeriesTime,
  role: RecurrenceDateRole,
): RecurrenceDate | undefined {
  const zone = value.kind === "zoned" ? value.zoned.timeZoneId : series.timeZone;
  const options = zone === undefined ? {} : { defaultTimeZone: zone };
  return coerceRecurrenceDate(naturalDate(value), series.first, role, options);
}

export interface SeriesDate<TDate = RecurrenceDate> {
  /** `undefined` when the value can't stand for its role in the series. */
  readonly date: TDate | undefined;
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
  series: SeriesTime,
  role: RecurrenceDateRole,
  label: string,
): SeriesDate {
  const { first } = series;
  const date = coerce(value, series, role);
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

// Nanoseconds since the epoch, wall times as if in UTC, to order dates of any kind.
function epochOf(date: RecurrenceDate): bigint {
  return date instanceof Temporal.Instant
    ? date.epochNanoseconds
    : Temporal.PlainDateTime.from(date).toZonedDateTime("UTC").epochNanoseconds;
}

/**
 * An RDATE PERIOD with both ends in the series' kind. When it doesn't end after it starts there,
 * as a few hours become one date on an all-day series, only its start is kept.
 */
export function toSeriesPeriod(
  period: IcsPeriod,
  series: SeriesTime,
): SeriesDate<RecurrenceDate | RecurrencePeriod> {
  const start = toSeriesDate(period.start, series, "start", "RDATE");
  const end = "end" in period ? period.end : getEventEnd(period);
  const { date: endDate, mismatch } = toSeriesDate(end, series, "start", "RDATE");
  if (start.date === undefined || endDate === undefined) {
    return { date: undefined, mismatch: start.mismatch ?? mismatch };
  }
  if (epochOf(endDate) > epochOf(start.date)) {
    return { date: { end: endDate, start: start.date }, mismatch: start.mismatch ?? mismatch };
  }
  return {
    date: start.date,
    mismatch:
      "RDATE PERIOD doesn't end after it starts in the series' kind; only its start was kept.",
  };
}
