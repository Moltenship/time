"use client";

import type { ResourceId } from "@moltenship/calendar";
import type { ReactNode } from "react";

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
import { barBox, type PlacedBar } from "@registry/shared/resource-timeline-view/timeline-placement";

export interface ResourceTimelineEventProps<TEvent> {
  readonly bar: PlacedBar<TEvent>;
  readonly color?: CalendarEventColor;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
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
export function ResourceTimelineEvent<TEvent>({
  bar,
  color,
  icon,
  isReadOnly = false,
  labelEvent,
  resourceId,
}: ResourceTimelineEventProps<TEvent>) {
  const { date, days, endsAfter, event, lane, startsBefore, time, top } = bar;
  const chip = useEventChip(event, { date, days, labelEvent, resourceId });
  const resizable = !isReadOnly && !event.isReadOnly;

  return (
    <EventChip
      color={color}
      {...chip}
      title={event.title}
      className={timelineEventClass(top !== lane, startsBefore, endsAfter)}
      style={barBox(bar)}
    >
      <span data-slot="calendar-event-title" className={timelineEventTitleClass}>
        <EventIcon>{icon}</EventIcon>
        {event.title}
      </span>
      {time !== undefined && <span className={timelineEventTimeClass}>{time}</span>}
      {resizable && !startsBefore && (
        <span aria-hidden data-resize="start" className={timelineResizeStartClass} />
      )}
      {resizable && !endsAfter && (
        <span aria-hidden data-resize="end" className={timelineResizeEndClass} />
      )}
    </EventChip>
  );
}
