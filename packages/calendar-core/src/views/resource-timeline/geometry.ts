import { instantInterval } from "@moltenship/calendar-temporal";

import type { CalendarEventInterval } from "../../events";
import type { TimeGridColumn } from "../time-grid/columns";
import { timeGridPosition, wallEpochNanoseconds, wallExtent } from "../time-grid/geometry";

const DAY_NANOSECONDS = 86_400_000_000_000n;

/** A stretch of a timeline, as fractions of its width from the inline start. */
export interface TimelineExtent {
  readonly end: number;
  readonly start: number;
}

function extent(start: bigint, end: bigint, length: bigint): TimelineExtent | null {
  const from = start > 0n ? start : 0n;
  const to = end < length ? end : length;
  return to > from
    ? Object.freeze({ end: Number(to) / Number(length), start: Number(from) / Number(length) })
    : null;
}

/**
 * Where an interval falls along a timeline of `columns`: each date is one nominal 24-hour wall
 * clock, as in a time grid, so 23- and 25-hour days keep their neighbours' width and DST shows as
 * the columns' bands. Timed intervals are measured by their instants (one crossing a fold covers
 * the repeated band, one ending at a gap stops there), floating ones by wall time, and all-day ones
 * by whole dates. Clipped to the timeline; `null` when the interval misses it.
 */
export function timelineExtent(
  columns: readonly TimeGridColumn[],
  interval: CalendarEventInterval,
): TimelineExtent | null {
  if (columns.length === 0) return null;
  const origin = columns[0]!.date;
  const length = BigInt(columns.length) * DAY_NANOSECONDS;
  switch (interval.kind) {
    case "timed": {
      const { timeZone } = columns[0]!.day;
      const wall = wallExtent(
        origin,
        columns.length,
        timeZone,
        instantInterval(interval.start, interval.end),
      );
      return wall === null ? null : extent(wall.start, wall.end, length);
    }
    case "floating": {
      const zero = wallEpochNanoseconds(origin.toPlainDateTime());
      return extent(
        wallEpochNanoseconds(interval.start) - zero,
        wallEpochNanoseconds(interval.end) - zero,
        length,
      );
    }
    case "all-day":
      return extent(
        BigInt(origin.until(interval.start).days) * DAY_NANOSECONDS,
        BigInt(origin.until(interval.end).days) * DAY_NANOSECONDS,
        length,
      );
  }
}

/** Where an instant, such as now, falls along a timeline by its wall time; `null` off it. */
export function timelinePosition(
  columns: readonly TimeGridColumn[],
  instant: Temporal.Instant,
): number | null {
  const position = timeGridPosition(columns, instant);
  return position === null ? null : (position.column + position.top) / columns.length;
}
