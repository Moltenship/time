import {
  snapZonedWallTime,
  type InstantInterval,
  type WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";

import type { TimeGridBand, TimeGridColumn } from "./columns";

const NOMINAL_DAY_NANOSECONDS = 86_400_000_000_000;
const DAY_NANOSECONDS = 86_400_000_000_000n;
const DEFAULT_SNAP: WallTimeSnapOptions = { increment: 15, smallestUnit: "minute" };

export interface TimeGridPosition {
  /** Index into the columns that were searched. */
  readonly column: number;
  readonly top: number;
}

export interface TimeGridPointOptions {
  /** Occurrence chosen for a repeated (fall-back) wall time. Defaults to `"earlier"`. */
  readonly fold?: "earlier" | "later";
  /** Wall-clock grid to snap to. Defaults to the nearest 15 minutes. */
  readonly snap?: WallTimeSnapOptions;
}

/** Wall-clock nanoseconds since the epoch: the wall time read as if it were UTC. */
export function wallEpochNanoseconds(dateTime: Temporal.PlainDateTime): bigint {
  return dateTime.toZonedDateTime("UTC").epochNanoseconds;
}

/** Converts wall-clock epoch nanoseconds to a position in the date's column, clamped to it. */
export function columnFraction(date: Temporal.PlainDate, wallNanoseconds: bigint): number {
  const origin = wallEpochNanoseconds(date.toPlainDateTime());
  const fraction = Number(wallNanoseconds - origin) / NOMINAL_DAY_NANOSECONDS;

  return Math.min(1, Math.max(0, fraction));
}

/** Column and vertical position of an instant, such as now, by its wall time; `null` off-grid. */
export function timeGridPosition(
  columns: readonly TimeGridColumn[],
  instant: Temporal.Instant,
): TimeGridPosition | null {
  if (columns.length === 0) {
    return null;
  }

  const zoned = instant.toZonedDateTimeISO(columns[0]!.day.timeZone);
  const date = zoned.toPlainDate();
  const column = columns.findIndex((candidate) => candidate.date.equals(date));
  if (column < 0) {
    return null;
  }

  return Object.freeze({
    column,
    top: columnFraction(date, zoned.epochNanoseconds + BigInt(zoned.offsetNanoseconds)),
  });
}

/**
 * Where an instant interval falls on the wall clock of `days` consecutive dates from `origin`, as
 * nanoseconds from `origin`'s midnight, clamped to those dates; `null` when it misses them. The
 * interval is walked one UTC offset at a time, so a piece crossing a fold covers the whole
 * repeated band (even when the fold crosses midnight), a piece ending at a spring-forward
 * transition stops at the gap, and only offset runs that touch the dates count.
 */
export function wallExtent(
  origin: Temporal.PlainDate,
  days: number,
  timeZone: string,
  interval: InstantInterval,
): { readonly end: bigint; readonly start: bigint } | null {
  const originNanoseconds = wallEpochNanoseconds(origin.toPlainDateTime());
  const length = BigInt(days) * DAY_NANOSECONDS;
  // Offsets stay within ±24 hours, so only these instants can have a wall time on these dates.
  const windowStart = originNanoseconds - DAY_NANOSECONDS;
  const windowEnd = originNanoseconds + length + DAY_NANOSECONDS;
  const start = interval.start.epochNanoseconds;
  const end = interval.end.epochNanoseconds < windowEnd ? interval.end.epochNanoseconds : windowEnd;
  let cursor = new globalThis.Temporal.ZonedDateTime(
    start > windowStart ? start : windowStart,
    timeZone,
  );
  let top = length;
  let bottom = 0n;

  while (cursor.epochNanoseconds < end) {
    const transition = cursor.getTimeZoneTransition("next");
    const runEnd =
      transition === null || transition.epochNanoseconds >= end ? end : transition.epochNanoseconds;
    const wallStart =
      cursor.epochNanoseconds + BigInt(cursor.offsetNanoseconds) - originNanoseconds;
    const wallEnd = wallStart + runEnd - cursor.epochNanoseconds;

    if (wallStart < length && wallEnd > 0n) {
      const runTop = wallStart > 0n ? wallStart : 0n;
      const runBottom = wallEnd < length ? wallEnd : length;
      top = runTop < top ? runTop : top;
      bottom = runBottom > bottom ? runBottom : bottom;
    }
    if (transition === null || runEnd === end) {
      break;
    }
    cursor = transition;
  }

  return bottom > top ? { end: bottom, start: top } : null;
}

/**
 * Vertical extent of the part of an instant interval whose wall time falls on the column's date,
 * measured as `wallExtent` does; empty when the interval never touches the date.
 */
export function timedFragmentBox(column: TimeGridColumn, interval: InstantInterval): TimeGridBand {
  const extent = wallExtent(column.date, 1, column.day.timeZone, interval);
  return extent === null
    ? Object.freeze({ height: 0, top: 0 })
    : Object.freeze({
        height: Number(extent.end - extent.start) / NOMINAL_DAY_NANOSECONDS,
        top: Number(extent.start) / NOMINAL_DAY_NANOSECONDS,
      });
}

/** Vertical extent of a wall-clock range, such as a floating event, in the column's date. */
export function wallRangeBox(
  column: TimeGridColumn,
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
): TimeGridBand {
  const top = columnFraction(column.date, wallEpochNanoseconds(start));
  const bottom = columnFraction(column.date, wallEpochNanoseconds(end));

  return Object.freeze({ height: Math.max(0, bottom - top), top });
}

/**
 * Wall-clock time at a vertical position, where `0` is the column's midnight and `1` the midnight
 * that ends it. The position is snapped on the wall grid before it is resolved, so the result never
 * lands inside a gap (a snapped spring-forward time resolves to the transition instant) and a
 * repeated time keeps the requested `fold` occurrence.
 */
export function timeGridDateTimeAt(
  column: TimeGridColumn,
  y: number,
  options: TimeGridPointOptions = {},
): Temporal.ZonedDateTime {
  const nanoseconds = Math.round(Math.min(1, Math.max(0, y)) * NOMINAL_DAY_NANOSECONDS);

  return snapZonedWallTime(column.date.toPlainDateTime().add({ nanoseconds }), {
    ...(options.snap ?? DEFAULT_SNAP),
    fold: options.fold,
    timeZone: column.day.timeZone,
  });
}
