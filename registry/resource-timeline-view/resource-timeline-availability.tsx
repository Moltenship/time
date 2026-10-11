import {
  iteratePlainDates,
  type AvailabilityExtent,
  type CalendarResource,
  type ClosedDate,
  type PlainDateInterval,
  type ResourceId,
  type TimelineExtent,
} from "@moltenship/calendar";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";

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
 * Shading over a resource's closed time along a row, behind its bars: stretches of a timeline
 * `width` pixels wide after the resource column, from `origin` over `days` dates. `render`
 * replaces it. Screen readers hear it in the cells' names instead, so it is hidden from them.
 */
export function TimelineAvailability({
  days,
  extents,
  origin,
  render,
  resource,
  width,
}: {
  readonly days: number;
  readonly extents: readonly AvailabilityExtent[];
  readonly origin: Temporal.PlainDate;
  readonly render?: UnavailableTimeRender;
  /** The resource whose hours these are; `null` for the unassigned row's. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  readonly width: number;
}) {
  return extents.map((extent) => (
    <UnavailableTime
      key={extent.start}
      band={extent}
      className="inset-y-0 bg-calendar-unavailable"
      // A day's start can land a hair below its whole number, as 15 / 22 * 22 does.
      date={origin.add({ days: Math.floor(extent.start * days + 1e-9) })}
      end={extent.end}
      render={render}
      resource={resource}
      slot="resource-timeline-unavailable"
      start={extent.start}
      style={{
        insetInlineStart: `calc(var(--calendar-resource-column) + ${extent.start * width}px)`,
        width: (extent.end - extent.start) * width,
      }}
    />
  ));
}
