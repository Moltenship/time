import type { ResourceId } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  timelineEventClass,
  timelineEventTimeClass,
  timelineEventTitleClass,
  timelineResizeEndClass,
  timelineResizeStartClass,
} from "@registry/shared/resource-timeline-view/resource-timeline.styles";
import {
  barBox,
  boxStyle,
  type PlacedBar,
} from "@registry/shared/resource-timeline-view/timeline-placement";

export interface ResourceTimelineEventProps<TEvent> {
  readonly bar: PlacedBar<TEvent>;
  readonly color?: CalendarEventColor;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: JSX.Element;
  /** The root takes no changes, so the bar has no resize handles. */
  readonly isReadOnly?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
  /** The row's resource; an event with several resources shows once in each of their rows. */
  readonly resourceId: ResourceId | null;
}

/**
 * An event's bar in its lane, across the time it covers. Ends cut off by the range are squared;
 * the others carry resize handles, unless the event or the root is read-only. In a stacked row,
 * render bars in the row's order, so each covers the ones before it; a covered bar rises while
 * hovered, and above that while focused, so its title shows.
 */
export function ResourceTimelineEvent<TEvent>(props: ResourceTimelineEventProps<TEvent>) {
  const chip = useEventChip(
    () => props.bar.event,
    () => ({
      date: props.bar.date,
      days: props.bar.days,
      labelEvent: props.labelEvent,
      resourceId: props.resourceId,
    }),
  );
  const resizable = () => props.isReadOnly !== true && props.bar.event.isReadOnly !== true;

  return (
    <EventChip
      color={props.color}
      {...chip}
      title={props.bar.event.title}
      class={timelineEventClass(
        props.bar.top !== props.bar.lane,
        props.bar.startsBefore,
        props.bar.endsAfter,
      )}
      style={boxStyle(barBox(props.bar))}
    >
      <span data-slot="calendar-event-title" class={timelineEventTitleClass}>
        <EventIcon>{props.icon}</EventIcon>
        {props.bar.event.title}
      </span>
      <Show when={props.bar.time}>
        {(time) => <span class={timelineEventTimeClass}>{time()}</span>}
      </Show>
      <Show when={resizable() && !props.bar.startsBefore}>
        <span aria-hidden="true" data-resize="start" class={timelineResizeStartClass} />
      </Show>
      <Show when={resizable() && !props.bar.endsAfter}>
        <span aria-hidden="true" data-resize="end" class={timelineResizeEndClass} />
      </Show>
    </EventChip>
  );
}
