import { iteratePlainDates, type PlainDateInterval } from "@moltenship/calendar-temporal";

import type { TimeGridBand, TimeGridColumn } from "../views/time-grid/columns";
import { timedFragmentBox } from "../views/time-grid/geometry";
import { timelineExtent, type TimelineExtent } from "../views/resource-timeline/geometry";
import {
  availabilityClosures,
  datesWindow,
  isClosedOn,
  type AvailabilityClosure,
  type ClosedTime,
} from "./closures";
import type { AvailabilitySchedule } from "./types";

/**
 * Closed time on a time-grid column's 24-hour axis. Its edges open only where open time meets it
 * inside the column, not where it runs on past midnight.
 */
export interface AvailabilityBand extends TimeGridBand, ClosedTime {}

/** Closed time along a timeline, as fractions of its width; see `AvailabilityBand`. */
export interface AvailabilityExtent extends TimelineExtent, ClosedTime {}

/** A date with no open time, why, and the exception's label when one closes it. */
export interface ClosedDate {
  readonly date: Temporal.PlainDate;
  readonly label?: string;
  readonly reason: "closed-day" | "exception";
}

const noBands: readonly AvailabilityBand[] = Object.freeze([]);

/** A closure's reason and label, with its edges open only inside `[0, 1]` of the view. */
function placed<T extends object>(
  { label, opensAfter, opensBefore, reason }: AvailabilityClosure,
  start: number,
  end: number,
  geometry: T,
): T & ClosedTime {
  return Object.freeze({
    ...geometry,
    ...(label === undefined ? {} : { label }),
    opensAfter: opensAfter && end < 1,
    opensBefore: opensBefore && start > 0,
    reason,
  });
}

function sameReason(left: ClosedTime, right: ClosedTime): boolean {
  return left.reason === right.reason && left.label === right.label;
}

/**
 * Joins closed time that overlaps on the wall clock, as both occurrences of a repeated hour can,
 * when it is closed for the same reason; otherwise the later piece starts where the earlier ends.
 * Others keep their objects.
 */
function joinWall<T extends ClosedTime>(
  pieces: readonly T[],
  startOf: (piece: T) => number,
  endOf: (piece: T) => number,
  span: (piece: T, start: number, end: number) => T,
): readonly T[] {
  const joined: T[] = [];
  for (const piece of pieces.toSorted((left, right) => startOf(left) - startOf(right))) {
    const last = joined.at(-1);
    if (last === undefined || startOf(piece) > endOf(last)) {
      joined.push(piece);
    } else if (sameReason(last, piece)) {
      if (endOf(piece) > endOf(last)) {
        joined[joined.length - 1] = Object.freeze({
          ...span(last, startOf(last), endOf(piece)),
          opensAfter: piece.opensAfter,
        });
      }
    } else if (endOf(piece) > endOf(last)) {
      joined.push(
        startOf(piece) === endOf(last)
          ? piece
          : Object.freeze({ ...span(piece, endOf(last), endOf(piece)), opensBefore: false }),
      );
    }
  }
  return Object.freeze(joined);
}

const bandSpan = (band: AvailabilityBand, start: number, end: number): AvailabilityBand =>
  Object.freeze({ ...band, height: end - start, top: start });
const extentSpan = (extent: AvailabilityExtent, start: number, end: number): AvailabilityExtent =>
  Object.freeze({ ...extent, end, start });

/**
 * The closed time of each time-grid column, as bands on its 24-hour axis with their reasons,
 * measured like events: a band across a repeated hour covers it, and one ending at a skipped hour
 * stops there. A wall time closed in either of its occurrences is shaded. `null` hours are always
 * open, so no column has bands.
 */
export function projectTimeGridAvailability(
  columns: readonly TimeGridColumn[],
  schedule: AvailabilitySchedule | null,
): readonly (readonly AvailabilityBand[])[] {
  return Object.freeze(
    columns.map((column) => {
      if (schedule === null || column.day.interval === null) return noBands;
      const bands = availabilityClosures(schedule, datesWindow(column.date, 1)).flatMap(
        (closure) => {
          const { height, top } = timedFragmentBox(column, closure.interval);
          return height > 0 ? [placed(closure, top, top + height, { height, top })] : [];
        },
      );
      return joinWall(
        bands,
        ({ top }) => top,
        ({ height, top }) => top + height,
        bandSpan,
      );
    }),
  );
}

/**
 * The closed time along a timeline of `columns`, as stretches of its width from the inline start
 * with their reasons; see `timelineExtent`. `null` hours are always open.
 */
export function projectTimelineAvailability(
  columns: readonly TimeGridColumn[],
  schedule: AvailabilitySchedule | null,
): readonly AvailabilityExtent[] {
  const first = columns[0];
  if (schedule === null || first === undefined) return Object.freeze([]);
  const extents = availabilityClosures(schedule, datesWindow(first.date, columns.length)).flatMap(
    (closure) => {
      const extent = timelineExtent(columns, { ...closure.interval, kind: "timed" });
      return extent === null ? [] : [placed(closure, extent.start, extent.end, extent)];
    },
  );
  return joinWall(
    extents,
    ({ start }) => start,
    ({ end }) => end,
    extentSpan,
  );
}

/**
 * The dates of `range` without open time on their day in `timeZone`, keyed by ISO date in date
 * order, such as weekends and holidays to mute in a month. An exception on the same date of the
 * schedule's wall clock lends its label, and makes the reason `"exception"`.
 */
export function closedDates(
  range: PlainDateInterval,
  schedule: AvailabilitySchedule | null,
  timeZone: string,
): ReadonlyMap<string, ClosedDate> {
  const closed = new Map<string, ClosedDate>();
  if (schedule === null) return closed;
  for (const date of iteratePlainDates(range)) {
    if (!isClosedOn(schedule, date, timeZone)) continue;
    const exception = schedule.exceptionOn(date);
    const { label } = exception ?? {};
    const reason = exception === undefined ? "closed-day" : "exception";
    closed.set(
      date.toString(),
      Object.freeze(label === undefined ? { date, reason } : { date, label, reason }),
    );
  }
  return closed;
}
