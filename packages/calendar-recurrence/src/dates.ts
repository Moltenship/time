import type { CalendarEventInterval } from "@moltenship/calendar-core";

import type { RecurrenceDate } from "./types";

/** What a date means to a series, which decides how a date of another kind converts. */
export type RecurrenceDateRole =
  /** EXDATE: a `PlainDate` stays one, excluding the whole day. */
  | "exception"
  /** RDATE or RECURRENCE-ID: an occurrence's start. */
  | "start"
  /** UNTIL: a `PlainDate` on a timed or floating series means the end of that day. */
  | "until";

export interface CoerceRecurrenceDateOptions {
  /**
   * The zone for a timed series without `sourceTimeZone`, and the one instants are read in for
   * all-day and floating series, such as a feed's X-WR-TIMEZONE. Defaults to UTC.
   */
  readonly defaultTimeZone?: string;
}

function isoDate(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.withCalendar("iso8601");
}

function isoDateTime(date: Temporal.PlainDateTime): Temporal.PlainDateTime {
  return date.withCalendar("iso8601");
}

/**
 * Brings a date of any kind into the kind of a series' first occurrence, as real feeds need: a UTC
 * UNTIL on an all-day series, an UNTIL without `Z` on a zoned one, a date-only EXDATE on a timed
 * one. Wall times resolve with `compatible`, as RFC 5545 §3.3.5 does. Dates come back in the ISO
 * calendar. `undefined` when a date can't stand for the role, such as a date-only RDATE on a timed
 * series; report it as `date-kind-mismatch` and drop only that date.
 */
export function coerceRecurrenceDate(
  date: RecurrenceDate,
  first: CalendarEventInterval,
  role: RecurrenceDateRole,
  options: CoerceRecurrenceDateOptions = {},
): RecurrenceDate | undefined {
  const timeZone =
    (first.kind === "timed" ? first.sourceTimeZone : undefined) ?? options.defaultTimeZone ?? "UTC";

  if (first.kind === "timed") {
    if (date instanceof Temporal.Instant) return date;
    if (date instanceof Temporal.PlainDateTime) {
      return date.toZonedDateTime(timeZone, { disambiguation: "compatible" }).toInstant();
    }
    if (role === "exception") return isoDate(date);
    if (role === "until") {
      return isoDate(date)
        .add({ days: 1 })
        .toZonedDateTime(timeZone)
        .toInstant()
        .subtract({ nanoseconds: 1 });
    }
    return undefined;
  }

  if (first.kind === "all-day") {
    if (date instanceof Temporal.PlainDate) return isoDate(date);
    if (date instanceof Temporal.PlainDateTime) return isoDate(date.toPlainDate());
    return date.toZonedDateTimeISO(timeZone).toPlainDate();
  }

  if (date instanceof Temporal.PlainDateTime) return isoDateTime(date);
  if (date instanceof Temporal.Instant) return date.toZonedDateTimeISO(timeZone).toPlainDateTime();
  if (role === "exception") return isoDate(date);
  if (role === "until")
    return isoDate(date).toPlainDateTime(Temporal.PlainTime.from("23:59:59.999999999"));
  return undefined;
}
