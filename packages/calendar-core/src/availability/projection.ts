import {
  instantInterval,
  iteratePlainDates,
  zonedDayRange,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { TimeGridBand, TimeGridColumn } from "../views/time-grid/columns";
import { timedFragmentBox } from "../views/time-grid/geometry";
import { timelineExtent, type TimelineExtent } from "../views/resource-timeline/geometry";
import type { AvailabilitySchedule } from "./types";

/** A date with no open time, and the exception's label when one closes it. */
export interface ClosedDate {
  readonly date: Temporal.PlainDate;
  readonly label?: string;
}

const noBands: readonly TimeGridBand[] = Object.freeze([]);

/**
 * The closed time of each time-grid column, as bands on its 24-hour axis, measured like events:
 * a band across a repeated hour covers it, and one ending at a skipped hour stops there. `null`
 * hours are always open, so no column has bands.
 */
export function projectTimeGridAvailability(
  columns: readonly TimeGridColumn[],
  schedule: AvailabilitySchedule | null,
): readonly (readonly TimeGridBand[])[] {
  return Object.freeze(
    columns.map((column) => {
      const day = column.day.interval;
      if (schedule === null || day === null) return noBands;
      return Object.freeze(
        schedule
          .unavailable(day)
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
  const first = columns[0]?.day;
  const last = columns.at(-1)?.day;
  if (
    schedule === null ||
    first === undefined ||
    last === undefined ||
    Temporal.Instant.compare(first.start, last.end) >= 0
  ) {
    return Object.freeze([]);
  }
  return Object.freeze(
    schedule
      .unavailable(instantInterval(first.start, last.end))
      .map(({ end, start }) => timelineExtent(columns, { end, kind: "timed", start }))
      .filter((extent) => extent !== null),
  );
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
    const day = zonedDayRange(date, timeZone).interval;
    if (day === null || schedule.available(day).length > 0) continue;
    const label = schedule.exceptionOn(date)?.label;
    closed.set(date.toString(), Object.freeze(label === undefined ? { date } : { date, label }));
  }
  return closed;
}
