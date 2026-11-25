import type { AvailabilityExtent, CalendarResource, ResourceId } from "@moltenship/calendar";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { timelineUnavailableClass } from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  extentBox,
  extentDate,
} from "@registry/shared/resource-timeline-view/timeline-availability";

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
      className={timelineUnavailableClass}
      date={extentDate(origin, extent, days)}
      end={extent.end}
      render={render}
      resource={resource}
      slot="resource-timeline-unavailable"
      start={extent.start}
      style={extentBox(extent, width)}
    />
  ));
}
