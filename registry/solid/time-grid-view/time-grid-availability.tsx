import {
  useTimeGridAvailability,
  type AvailabilityBand,
  type CalendarResource,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-solid";
import { createMemo, For, type Accessor } from "solid-js";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import { percent } from "@registry/shared/time-grid-view/time-grid-geometry";
import { timeGridUnavailableClass } from "@registry/shared/time-grid-view/time-grid.styles";

const noBands: readonly AvailabilityBand[] = Object.freeze([]);

/**
 * A column's closed time from the root's working hours, as an accessor: the calendar's, or with
 * `resourceId` that resource's, on its own time zone.
 */
export function useColumnAvailability(
  column: Accessor<TimeGridColumn>,
  resourceId?: Accessor<ResourceId | null | undefined>,
): Accessor<readonly AvailabilityBand[]> {
  const columns = createMemo(() => [column()]);
  const bands = useTimeGridAvailability(columns, resourceId);
  return () => bands()[0] ?? noBands;
}

export { isUnavailableIn } from "@registry/shared/time-grid-view/time-grid-geometry";

/**
 * Shading over a column's closed time, behind its events; `render` replaces it. Screen readers
 * hear it in the focused slot's name instead, so the shading is hidden from them.
 */
export function TimeGridAvailability(props: {
  readonly bands: readonly AvailabilityBand[];
  readonly date: Temporal.PlainDate;
  readonly render?: UnavailableTimeRender;
  /** The resource whose hours these are; `null` for the calendar's own. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
}) {
  return (
    <For each={props.bands} keyed={(band: AvailabilityBand) => band.top}>
      {(band) => (
        <UnavailableTime
          band={band()}
          class={timeGridUnavailableClass}
          date={props.date}
          end={band().top + band().height}
          render={props.render}
          resource={props.resource}
          slot="time-grid-unavailable"
          start={band().top}
          style={{ height: percent(band().height), top: percent(band().top) }}
        />
      )}
    </For>
  );
}
