import {
  instantIntervalContains,
  snapZonedWallTime,
  type InstantInterval,
  type WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";

import type { TimeGridBand, TimeGridColumn } from "./columns";

const NOMINAL_DAY_NANOSECONDS = 86_400_000_000_000;
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

/** Wall-clock epoch nanoseconds of `instant`, read with the offset in effect at `offsetSource`. */
function wallNanoseconds(
  instant: Temporal.Instant,
  offsetSource: Temporal.Instant,
  timeZone: string,
): bigint {
  return (
    instant.epochNanoseconds + BigInt(offsetSource.toZonedDateTimeISO(timeZone).offsetNanoseconds)
  );
}

/** Column and vertical position of an instant, such as now; `null` outside every column. */
export function timeGridPosition(
  columns: readonly TimeGridColumn[],
  instant: Temporal.Instant,
): TimeGridPosition | null {
  const column = columns.findIndex(
    ({ day }) => day.interval !== null && instantIntervalContains(day.interval, instant),
  );
  if (column < 0) {
    return null;
  }

  const { date, day } = columns[column]!;
  return Object.freeze({
    column,
    top: columnFraction(date, wallNanoseconds(instant, instant, day.timeZone)),
  });
}

/**
 * Vertical extent of a fragment already clipped to the column's day. The end is read with the
 * offset in effect just before it, so a fragment ending at a spring-forward transition stops at
 * the gap. A fragment crossing a fold spans the whole repeated band instead of inverting.
 */
export function timedFragmentBox(column: TimeGridColumn, interval: InstantInterval): TimeGridBand {
  const { date, day } = column;
  const start = interval.start.epochNanoseconds;
  const end = interval.end.epochNanoseconds;
  let top = wallNanoseconds(interval.start, interval.start, day.timeZone);
  let bottom = wallNanoseconds(
    interval.end,
    interval.end.subtract({ nanoseconds: 1 }),
    day.timeZone,
  );

  for (const transition of column.transitions) {
    const at = transition.instant.epochNanoseconds;
    if (transition.kind === "fold" && start < at && at < end) {
      const wallAfter = wallNanoseconds(transition.instant, transition.instant, day.timeZone);
      const wallBefore = wallAfter - BigInt(transition.offsetDeltaNanoseconds);
      top = wallAfter < top ? wallAfter : top;
      bottom = wallBefore > bottom ? wallBefore : bottom;
    }
  }

  const topFraction = columnFraction(date, top);
  return Object.freeze({ height: columnFraction(date, bottom) - topFraction, top: topFraction });
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
