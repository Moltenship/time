import type {
  CalendarResource,
  EventDayFragment,
  EventId,
  ResourceId,
  TimeGridDay,
  TimeGridEventLayout,
} from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { createMemo, For, Show, type Accessor } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { bandBox, eventKey, percent } from "@registry/shared/time-grid-view/time-grid-geometry";
import {
  clockChangeTitles,
  timeGridColumnFormats,
  type TimeGridColumnFormats,
} from "@registry/shared/time-grid-view/time-grid-labels";
import {
  timeGridColumnClass,
  timeGridEventsClass,
  timeGridFoldClass,
  timeGridGapClass,
  timeGridNowClass,
} from "@registry/shared/time-grid-view/time-grid.styles";

import { TimeGridEvent } from "./time-grid-event";

export { inResource } from "@registry/shared/time-grid-view/time-grid-geometry";
export type { TimeGridColumnFormats } from "@registry/shared/time-grid-view/time-grid-labels";

/** The formats a column reads, made once per locale for all of a grid's columns. */
export function useTimeGridColumnFormats(
  locale: Accessor<Intl.LocalesArgument>,
): Accessor<TimeGridColumnFormats> {
  return createMemo(() => timeGridColumnFormats(locale()));
}

/** The resource a column shows, in a view with a column per resource. */
export interface TimeGridColumnResource {
  /** `null` for the unassigned bucket. */
  readonly id: ResourceId | null;
  /** `null` for the unassigned bucket. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
  /** Added to the accessible names of the column's events. */
  readonly title: string;
}

export interface TimeGridColumnProps<TEvent> {
  /** The column's `aria-colindex`, in a grid that renders only some of its columns. */
  readonly colIndex?: number;
  readonly day: TimeGridDay<TEvent>;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor | undefined;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  /** The root takes no changes: events have no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Position of the now-line when the current time falls in this column. */
  readonly nowTop: number | null;
  readonly formats: TimeGridColumnFormats;
  /** Rendered beside the visible dates of a scrolling grid, so hidden from assistive technology. */
  readonly offscreen?: boolean;
  /** The column's resource; without one, the column shows every resource's events. */
  readonly resource?: TimeGridColumnResource;
  readonly timeZone: string;
}

type Layout<TEvent> = TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>;

/**
 * One day's 24 hours, a cell of the grid's timed row. `data-date` marks the full-height column for
 * pointer hit-testing; spring forward hours are hatched and repeated fall-back hours tinted.
 */
export function TimeGridColumn<TEvent>(props: TimeGridColumnProps<TEvent>) {
  const column = () => props.day.column;
  const labelHere = createMemo<EventLabeler<TEvent>>(() => {
    const { labelEvent, resource } = props;
    return resource === undefined ? labelEvent : (event) => labelEvent(event, resource.title);
  });

  return (
    <div
      role="gridcell"
      aria-colindex={props.colIndex}
      aria-hidden={props.offscreen === true ? "true" : undefined}
      data-date={column().date.toString()}
      data-today={props.day.isToday ? "" : undefined}
      class={timeGridColumnClass}
    >
      <For each={column().gaps} keyed={(band) => band.top}>
        {(band) => (
          <div class={timeGridGapClass} style={bandBox(band())} title={clockChangeTitles.gap} />
        )}
      </For>
      <For each={column().folds} keyed={(band) => band.top}>
        {(band) => (
          <div class={timeGridFoldClass} style={bandBox(band())} title={clockChangeTitles.fold} />
        )}
      </For>
      {/* The inline-end margin keeps a strip free for creating an event beside busy blocks. */}
      <div class={timeGridEventsClass}>
        <For
          each={props.day.events}
          keyed={(layout: Layout<TEvent>) => eventKey(layout.fragment.event.id)}
        >
          {(layout) => (
            <TimeGridEvent
              color={props.getEventColor?.(layout().fragment.event.event)}
              icon={props.getEventIcon?.(layout().fragment.event.event)}
              isReadOnly={props.isReadOnly}
              labelEvent={labelHere()}
              layout={layout()}
              formats={props.formats}
              offscreen={props.offscreen}
              resourceId={props.resource?.id}
              timeZone={props.timeZone}
            />
          )}
        </For>
      </div>
      <Show when={props.nowTop !== null}>
        <div
          aria-hidden="true"
          data-slot="time-grid-now"
          class={timeGridNowClass}
          style={{ top: percent(props.nowTop!) }}
        />
      </Show>
    </div>
  );
}
