import {
  instantInterval,
  iteratePlainDates,
  zonedDayRange,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { TimeGridBand, TimeGridColumn } from "../views/time-grid/columns";
import { timedFragmentBox, wallEpochNanoseconds, wallExtent } from "../views/time-grid/geometry";
import { timelineExtent, type TimelineExtent } from "../views/resource-timeline/geometry";
import type { AvailabilitySchedule } from "./types";

/** A date with no open time, and the exception's label when one closes it. */
export interface ClosedDate {
  readonly date: Temporal.PlainDate;
  readonly label?: string;
}

const DAY_NANOSECONDS = 86_400_000_000_000n;
const noBands: readonly TimeGridBand[] = Object.freeze([]);

/**
 * Every instant whose wall time can fall on `days` dates from `first`. Offsets stay within ±24
 * hours, so a day either side covers them, a repeated hour after the last midnight included.
 */
function datesWindow(first: Temporal.PlainDate, days: number): InstantInterval {
  const midnight = wallEpochNanoseconds(first.toPlainDateTime());
  return instantInterval(
    Temporal.Instant.fromEpochNanoseconds(midnight - DAY_NANOSECONDS),
    Temporal.Instant.fromEpochNanoseconds(midnight + BigInt(days + 1) * DAY_NANOSECONDS),
  );
}

/** Joins overlapping bands, as a repeated hour closed twice gives; others keep their objects. */
function joinBands(bands: readonly TimeGridBand[]): readonly TimeGridBand[] {
  const joined: TimeGridBand[] = [];
  for (const band of bands.toSorted((left, right) => left.top - right.top)) {
    const last = joined.at(-1);
    if (last === undefined || band.top > last.top + last.height) {
      joined.push(band);
    } else if (band.top + band.height > last.top + last.height) {
      joined[joined.length - 1] = Object.freeze({
        height: band.top + band.height - last.top,
        top: last.top,
      });
    }
  }
  return Object.freeze(joined);
}

/**
 * The closed time of each time-grid column, as bands on its 24-hour axis, measured like events:
 * a band across a repeated hour covers it, and one ending at a skipped hour stops there. A wall
 * time closed in either of its occurrences is shaded. `null` hours are always open, so no column
 * has bands.
 */
export function projectTimeGridAvailability(
  columns: readonly TimeGridColumn[],
  schedule: AvailabilitySchedule | null,
): readonly (readonly TimeGridBand[])[] {
  return Object.freeze(
    columns.map((column) => {
      if (schedule === null || column.day.interval === null) return noBands;
      return joinBands(
        schedule
          .unavailable(datesWindow(column.date, 1))
          .map((closed) => timedFragmentBox(column, closed))
          .filter((band) => band.height > 0),
      );
    }),
  );
}

/**
 * The closed time along a timeline of `columns`, as stretches of its width from the inline start;
 * see `timelineExtent`. `null` hours are always open.
 */
export function projectTimelineAvailability(
  columns: readonly TimeGridColumn[],
  schedule: AvailabilitySchedule | null,
): readonly TimelineExtent[] {
  const first = columns[0];
  if (schedule === null || first === undefined) return Object.freeze([]);
  const extents = schedule
    .unavailable(datesWindow(first.date, columns.length))
    .map((closed) => timelineExtent(columns, { ...closed, kind: "timed" }))
    .filter((extent) => extent !== null)
    .sort((left, right) => left.start - right.start);
  const joined: TimelineExtent[] = [];
  for (const extent of extents) {
    const last = joined.at(-1);
    // Closed time in both occurrences of a repeated hour overlaps on the wall clock.
    if (last !== undefined && extent.start <= last.end) {
      if (extent.end > last.end)
        joined[joined.length - 1] = Object.freeze({ ...last, end: extent.end });
    } else {
      joined.push(extent);
    }
  }
  return Object.freeze(joined);
}

/**
 * Whether no time on `date`'s wall clock in `timeZone` is open, a repeated hour after midnight
 * included. A date the time zone skips is never closed.
 */
export function isClosedOn(
  schedule: AvailabilitySchedule,
  date: Temporal.PlainDate,
  timeZone: string,
): boolean {
  if (zonedDayRange(date, timeZone).interval === null) return false;
  return schedule
    .available(datesWindow(date, 1))
    .every((open) => wallExtent(date, 1, timeZone, open) === null);
}

/**
 * The dates of `range` without open time on their day in `timeZone`, keyed by ISO date in date
 * order, such as weekends and holidays to mute in a month. An exception on the same date of the
 * schedule's wall clock lends its label.
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
    const label = schedule.exceptionOn(date)?.label;
    closed.set(date.toString(), Object.freeze(label === undefined ? { date } : { date, label }));
  }
  return closed;
}
