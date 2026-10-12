import type { CalendarEventInterval } from "@moltenship/calendar-core";
import { getEventEnd, type IcsDateValue, type IcsPeriod } from "@moltenship/ics";

import { coerceRecurrenceDate, type RecurrenceDateRole } from "../dates";
import { compareDates } from "../series/clock";
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
 * a floating one on a timed override resolves in the override's zone. For feeds that follow RFC
 * 5545, where RECURRENCE-ID has the type of the master's DTSTART, that is the series' kind, so the
 * ID stays the same when the master loads.
 */
export function ownRecurrenceId(
  value: IcsDateValue,
  own: CalendarEventInterval | undefined,
): RecurrenceDate {
  const date = naturalDate(value);
  if (value.kind !== "floating" || own?.kind !== "timed") return date;
  return coerceRecurrenceDate(date, own, "start") ?? date;
}

// On all-day and floating series, a zoned value's wall time is the one written, even in a DST gap,
// and a UTC one's is the feed's. Timed series keep the instant.
function coerce(
  value: IcsDateValue,
  series: SeriesTime,
  role: RecurrenceDateRole,
): RecurrenceDate | undefined {
  const date =
    value.kind === "zoned" && series.first.kind !== "timed" ? value.wallTime : naturalDate(value);
  const options = series.timeZone === undefined ? {} : { defaultTimeZone: series.timeZone };
  return coerceRecurrenceDate(date, series.first, role, options);
}

export interface SeriesDate<TDate = RecurrenceDate> {
  /** `undefined` when the value can't stand for its role in the series. */
  readonly date: TDate | undefined;
  /** Why it is an `invalid-period`, when it is one. */
  readonly invalid?: string;
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

/**
 * An RDATE PERIOD with both ends in the series' kind. One that doesn't end after it starts, as
 * written or once a few hours become one date on an all-day series, keeps only its start.
 */
export function toSeriesPeriod(
  period: IcsPeriod,
  series: SeriesTime,
): SeriesDate<RecurrenceDate | RecurrencePeriod> {
  const start = toSeriesDate(period.start, series, "start", "RDATE");
  // In the start's kind, so the two compare.
  const sourceEnd = getEventEnd(period);
  if (compareDates(naturalDate(sourceEnd), naturalDate(period.start)) <= 0) {
    const invalid = "RDATE PERIOD doesn't end after it starts; only its start was kept.";
    return { ...start, invalid };
  }
  const end = toSeriesDate("end" in period ? period.end : sourceEnd, series, "start", "RDATE");
  const mismatch = start.mismatch ?? end.mismatch;
  if (start.date === undefined || end.date === undefined) return { date: undefined, mismatch };
  if (compareDates(end.date, start.date) > 0) {
    return { date: { end: end.date, start: start.date }, mismatch };
  }
  return {
    date: start.date,
    mismatch:
      "RDATE PERIOD doesn't end after it starts in the series' kind; only its start was kept.",
  };
}
