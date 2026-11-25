import type { AvailabilityExtent, CalendarResource, ResourceId } from "@moltenship/calendar-solid";
import { For } from "solid-js";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { timelineUnavailableClass } from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  extentBox,
  extentDate,
} from "@registry/shared/resource-timeline-view/timeline-availability";
import { boxStyle } from "@registry/shared/resource-timeline-view/timeline-placement";

/**
 * Shading over a resource's closed time along a row, behind its bars: stretches of a timeline
 * `width` pixels wide after the resource column, from `origin` over `days` dates. `render`
 * replaces it. Screen readers hear it in the cells' names instead, so it is hidden from them.
 */
export function TimelineAvailability(props: {
  readonly days: number;
  readonly extents: readonly AvailabilityExtent[];
  readonly origin: Temporal.PlainDate;
  readonly render?: UnavailableTimeRender;
  /** The resource whose hours these are; `null` for the unassigned row's. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  readonly width: number;
}) {
  return (
    <For each={props.extents} keyed={(extent) => extent.start}>
      {(extent) => (
        <UnavailableTime
          band={extent()}
          class={timelineUnavailableClass}
          date={extentDate(props.origin, extent(), props.days)}
          end={extent().end}
          render={props.render}
          resource={props.resource}
          slot="resource-timeline-unavailable"
          start={extent().start}
          style={boxStyle(extentBox(extent(), props.width))}
        />
      )}
    </For>
  );
}
