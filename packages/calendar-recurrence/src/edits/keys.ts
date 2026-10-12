import { coerceRecurrenceDate, type RecurrenceDateRole } from "../dates";
import type { RecurrenceDate, RecurrencePeriod } from "../types";
import { datesEqual, fromWall, toWall } from "./dates";
import { mapOrdinal } from "./ordinals";
import type { RecurrenceKeyShift } from "./types";

/** Reads a stored date in the old series' kind, as the expander does. */
export function readKey(
  shift: RecurrenceKeyShift,
  date: RecurrenceDate,
  role: RecurrenceDateRole,
): RecurrenceDate | undefined {
  return coerceRecurrenceDate(date, shift.first, role, { defaultTimeZone: shift.timeZone });
}

/**
 * A date on the series' wall clock. A start a DST gap moved forward reads back to the wall time the
 * series repeats at, which is what moves.
 */
export function seriesWall(
  date: RecurrenceDate,
  series: Pick<RecurrenceKeyShift, "first" | "timeZone" | "wallTime">,
): Temporal.PlainDateTime {
  const time = { kind: series.first.kind, timeZone: series.timeZone };
  const wall = toWall(date, time);
  if (series.wallTime === undefined || !(date instanceof Temporal.Instant)) return wall;
  const written = wall.toPlainDate().toPlainDateTime(series.wallTime);
  return datesEqual(fromWall(written, time), date) ? written : wall;
}

/**
 * Where a date of the old series goes on the new series' wall clock: by `shift.wall`, or, under an
 * ordinal weekday rule, to the new weekday of the same month or year at the moved time of day.
 */
export function targetWall(shift: RecurrenceKeyShift, key: RecurrenceDate): Temporal.PlainDateTime;
export function targetWall(
  shift: RecurrenceKeyShift,
  key: RecurrenceDate,
  strict: true,
): Temporal.PlainDateTime | undefined;
/**
 * `strict` gives `undefined` when an ordinal rule has no counterpart for the date, as a month
 * without a fifth Tuesday has none; otherwise such a date moves by `shift.wall`.
 */
export function targetWall(
  shift: RecurrenceKeyShift,
  key: RecurrenceDate,
  strict = false,
): Temporal.PlainDateTime | undefined {
  const wall = seriesWall(key, shift);
  const moved = wall.add(shift.wall);
  const date =
    shift.ordinals === undefined ? undefined : mapOrdinal(shift.ordinals, wall.toPlainDate());
  if (date === null && strict) return undefined;
  return date === undefined || date === null ? moved : date.toPlainDateTime(moved.toPlainTime());
}

/**
 * Moves an original start, EXDATE or UNTIL with its series, by `targetWall`, into the new kind and
 * zone. A date-only UNTIL, and a whole-day EXDATE on a timed or floating series, stay dates and
 * move by the day delta. `undefined` for a date the old series can't read; leave it as it is.
 */
export function rekey(
  shift: RecurrenceKeyShift,
  date: RecurrenceDate,
  role: RecurrenceDateRole,
): RecurrenceDate | undefined {
  if (
    date instanceof Temporal.PlainDate &&
    (role === "until" || (role === "exception" && shift.first.kind !== "all-day"))
  ) {
    return date.withCalendar("iso8601").add({ days: shift.days });
  }
  const key = readKey(shift, date, role);
  if (key === undefined) return undefined;
  if (shift.anchor !== undefined && datesEqual(key, shift.anchor.from)) return shift.anchor.to;
  return fromWall(targetWall(shift, key), { kind: shift.kind, timeZone: shift.toTimeZone });
}

export function isPeriod(value: RecurrenceDate | RecurrencePeriod): value is RecurrencePeriod {
  return !(
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainDateTime
  );
}

/** An RDATE's start in the old series' kind; `undefined` when it can't be read. */
export function extraStart(
  shift: RecurrenceKeyShift,
  extra: RecurrenceDate | RecurrencePeriod,
): RecurrenceDate | undefined {
  return readKey(shift, isPeriod(extra) ? extra.start : extra, "start");
}

/**
 * Moves an RDATE as `rekey` moves a start. A period keeps its length, or becomes a plain start when
 * the series changes kind, since its length doesn't carry over.
 */
export function rekeyExtra(
  shift: RecurrenceKeyShift,
  extra: RecurrenceDate | RecurrencePeriod,
): RecurrenceDate | RecurrencePeriod | undefined {
  if (!isPeriod(extra)) return rekey(shift, extra, "start");
  const start = readKey(shift, extra.start, "start");
  const end = readKey(shift, extra.end, "start");
  if (start === undefined || end === undefined) return undefined;
  const moved = rekey(shift, start, "start");
  if (moved === undefined || shift.kind !== shift.first.kind) return moved;
  if (moved instanceof Temporal.Instant && start instanceof Temporal.Instant) {
    return { end: moved.add(start.until(end as Temporal.Instant)), start: moved };
  }
  if (moved instanceof Temporal.PlainDate && start instanceof Temporal.PlainDate) {
    return { end: moved.add(start.until(end as Temporal.PlainDate)), start: moved };
  }
  if (moved instanceof Temporal.PlainDateTime && start instanceof Temporal.PlainDateTime) {
    return { end: moved.add(start.until(end as Temporal.PlainDateTime)), start: moved };
  }
  return moved;
}
