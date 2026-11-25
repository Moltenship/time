import {
  resourceIdAttributes,
  timeGridPosition,
  useNow,
  type CalendarEnvironmentBase,
  type ResourceColumn,
  type TimeGridPosition,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import type { VirtualItem } from "@tanstack/virtual-core";
import { createMemo, For } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { UnavailableTimeRender } from "@registry/calendar/unavailable-time";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { resourceTitle } from "@registry/shared/resource-columns-view/resource-columns-labels";
import { resourceColIndex } from "@registry/shared/resource-columns-view/resource-columns-layout";
import {
  resourceBodyClass,
  resourceBodyGutterClass,
  resourceBodyHoursClass,
  resourceBodyRowClass,
  resourceBodyTrackClass,
  resourceDaysClass,
} from "@registry/shared/resource-columns-view/resource-columns.styles";
import { dayColumns } from "@registry/shared/time-grid-view/time-grid-geometry";
import { timedEventsLabel } from "@registry/shared/time-grid-view/time-grid-labels";
import { srOnlyClass } from "@registry/shared/time-grid-view/time-grid.styles";
import { TimeGridHours, useOpeningScroll } from "@registry/time-grid-view/time-grid-body";
import {
  TimeGridColumn,
  useTimeGridColumnFormats,
  type TimeGridColumnFormats,
  type TimeGridColumnResource,
} from "@registry/time-grid-view/time-grid-column";
import type { TimeGridZone } from "@registry/time-grid-view/time-grid-zones";

import type { AxisFollower } from "./use-axis-sync";

export interface ResourceColumnsBodyProps<TEvent> {
  readonly environment: CalendarEnvironmentBase;
  /** Follows the body's vertical scroll; see `useAxisSync`. */
  readonly followY: AxisFollower;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  /** The rendered columns, from the column virtualizer. */
  readonly items: readonly VirtualItem[];
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onScroll: () => void;
  /** Takes the scrolling element, which the virtualizer reads and dragging scrolls near its edges. */
  readonly ref: (element: HTMLDivElement) => void;
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly resources: readonly ResourceColumn<TEvent>[];
  /** Length of a keyboard slot, as the keyboard's snap sets it. */
  readonly slotMinutes: number;
  readonly totalSize: number;
  /** The root's secondary time zones, with an hour column each in the gutter. */
  readonly zones?: readonly TimeGridZone[];
}

/**
 * One resource's day columns. `data-resource-id` around them puts every drop, create, and
 * keyboard cell inside in this resource.
 */
function ResourceDays<TEvent>(props: {
  readonly column: ResourceColumn<TEvent>;
  readonly colIndex: number;
  readonly formats: TimeGridColumnFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly isReadOnly: boolean | undefined;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly now: TimeGridPosition | null;
  readonly renderUnavailable?: UnavailableTimeRender;
  readonly size: number;
  readonly slotMinutes: number;
  readonly start: number;
  readonly timeZone: string;
  readonly zones: readonly TimeGridZone[] | undefined;
}) {
  const here = createMemo(
    (): TimeGridColumnResource => {
      const { resource } = props.column;
      return { id: resource.id, resource: resource.resource, title: resourceTitle(resource) };
    },
    {
      equals: (left, right) =>
        left.id === right.id && left.resource === right.resource && left.title === right.title,
    },
  );

  return (
    <div
      {...resourceIdAttributes(props.column.resource.id)}
      class={resourceDaysClass}
      style={{
        "grid-template-columns": dayColumns(props.column.days.length),
        "inset-inline-start": `${props.start}px`,
        width: `${props.size}px`,
      }}
    >
      <For each={props.column.days} keyed={(day) => day.column.key}>
        {(day, index) => (
          <TimeGridColumn
            colIndex={props.colIndex + index()}
            day={day()}
            formats={props.formats}
            getEventColor={props.getEventColor}
            getEventIcon={props.getEventIcon}
            isReadOnly={props.isReadOnly}
            labelEvent={props.labelEvent}
            nowTop={props.now?.column === index() ? props.now.top : null}
            renderUnavailable={props.renderUnavailable}
            resource={here()}
            slotMinutes={props.slotMinutes}
            timeZone={props.timeZone}
            zones={props.zones}
          />
        )}
      </For>
    </div>
  );
}

/**
 * The grid's timed row: the hour gutter, then the 24 hours of every rendered resource column,
 * scrolling both ways. Each resource holds one `TimeGridColumn` per day, so events, the keyboard
 * slot, daylight-saving bands, and the now-line render as in the week and day views.
 */
export function ResourceColumnsBody<TEvent>(props: ResourceColumnsBodyProps<TEvent>) {
  let body: HTMLDivElement | undefined;
  const days = () => props.resources[0]?.days;
  const now = useNow();
  const nowPosition = createMemo(() => {
    const instant = now();
    const shown = days();
    return instant === null || shown === undefined
      ? null
      : timeGridPosition(
          shown.map(({ column }) => column),
          instant,
        );
  });
  const formats = useTimeGridColumnFormats(() => props.environment.locale);
  useOpeningScroll(
    () => body,
    now,
    () => nowPosition()?.top ?? null,
  );
  const hours = props.followY();

  return (
    <div role="row" class={resourceBodyRowClass}>
      <div role="rowheader" aria-colindex={1} class={resourceBodyGutterClass}>
        <span class={srOnlyClass}>{timedEventsLabel}</span>
        <div ref={hours} class={resourceBodyHoursClass}>
          <TimeGridHours locale={props.environment.locale} zones={props.zones} />
        </div>
      </div>
      <div
        ref={(element) => {
          body = element;
          props.ref(element);
        }}
        data-slot="resource-columns-body"
        class={resourceBodyClass}
        onScroll={() => props.onScroll()}
      >
        <div class={resourceBodyTrackClass} style={{ width: `${props.totalSize}px` }}>
          <For each={props.items} keyed={(item) => item.key}>
            {(item) => (
              <ResourceDays
                colIndex={resourceColIndex(item().index, days()?.length ?? 1)}
                column={props.resources[item().index]!}
                formats={formats()}
                getEventColor={props.getEventColor}
                getEventIcon={props.getEventIcon}
                isReadOnly={props.isReadOnly}
                labelEvent={props.labelEvent}
                now={nowPosition()}
                renderUnavailable={props.renderUnavailable}
                size={item().size}
                slotMinutes={props.slotMinutes}
                start={item().start}
                timeZone={props.environment.timeZone}
                zones={props.zones}
              />
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
