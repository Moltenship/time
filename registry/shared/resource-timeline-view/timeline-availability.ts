import {
  iteratePlainDates,
  type AvailabilityExtent,
  type ClosedDate,
  type PlainDateInterval,
  type TimelineExtent,
} from "@moltenship/calendar";

import type { TimelineAvailabilityNote } from "./timeline-labels";
import type { TimelineSlotUnit } from "./timeline-scale";

/** Well under a millisecond of a day, so stretches that only touch a cell never count. */
const EPSILON = 1e-9;

/** Whether any of `[start, end)`, as fractions of the timeline, is closed. */
export function isUnavailableIn(
  extents: readonly TimelineExtent[],
  start: number,
  end: number,
): boolean {
  return extents.some((extent) => extent.start < end - EPSILON && extent.end > start + EPSILON);
}

/**
 * Closed days of a day row as stretches of its width, a run of days with the same reason as one,
 * opening where an open day meets it.
 */
export function closedDayExtents(
  closed: ReadonlyMap<string, ClosedDate>,
  range: PlainDateInterval,
): readonly AvailabilityExtent[] {
  const days = [...iteratePlainDates(range)].map((date) => closed.get(date.toString()));
  const same = (left?: ClosedDate, right?: ClosedDate) =>
    left?.reason === right?.reason && left?.label === right?.label;
  const extents: AvailabilityExtent[] = [];
  for (let from = 0; from < days.length;) {
    const day = days[from];
    let to = from + 1;
    while (to < days.length && same(days[to], day)) to++;
    if (day !== undefined) {
      extents.push({
        ...(day.label === undefined ? {} : { label: day.label }),
        end: to / days.length,
        opensAfter: to < days.length && days[to] === undefined,
        opensBefore: from > 0 && days[from - 1] === undefined,
        reason: day.reason,
        start: from / days.length,
      });
    }
    from = to;
  }
  return extents;
}

/**
 * What a name says about working hours over `[from, to)`, in slots: "closed" for a day of a day
 * row, "outside working hours" for time of an hour row.
 */
export function availabilityNote(
  unit: TimelineSlotUnit,
  closedDays: ReadonlyMap<string, ClosedDate>,
  closedTime: readonly TimelineExtent[],
  slotCount: number,
  date: Temporal.PlainDate,
  from: number,
  to: number,
): TimelineAvailabilityNote | undefined {
  if (unit === "day") return closedDays.has(date.toString()) ? "closed" : undefined;
  return isUnavailableIn(closedTime, from / slotCount, to / slotCount)
    ? "outside working hours"
    : undefined;
}

/** The date a stretch of closed time starts on, of `days` dates from `origin`. */
export function extentDate(
  origin: Temporal.PlainDate,
  extent: TimelineExtent,
  days: number,
): Temporal.PlainDate {
  // A day's start can land a hair below its whole number, as 15 / 22 * 22 does.
  return origin.add({ days: Math.floor(extent.start * days + EPSILON) });
}

/** A stretch of closed time along a row `width` pixels wide, after the resource column. */
export function extentBox(extent: TimelineExtent, width: number) {
  return {
    insetInlineStart: `calc(var(--calendar-resource-column) + ${extent.start * width}px)`,
    width: (extent.end - extent.start) * width,
  };
}
