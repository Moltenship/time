"use client";

import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import {
  monthEventChevronClass,
  monthEventClass,
  monthEventDotClass,
  monthEventIconClass,
  monthEventTimeClass,
  monthEventTitleClass,
} from "@registry/shared/month-view/month.styles";

export interface MonthEventProps<TEvent> {
  /** A filled bar (all-day and multi-day events) rather than a dot, time, and title. */
  readonly bar: boolean;
  readonly className?: string;
  readonly color?: CalendarEventColor;
  /** The first date the element shows the event on. */
  readonly date: Temporal.PlainDate;
  /** Dates the element covers from `date`. */
  readonly days?: number;
  /** The event continues after this element. */
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  /** Whether the element is one of the view's focus targets; a copy in a list is not. */
  readonly focusTarget?: boolean;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Rendered in a week beside the visible ones of a scrolling month: not a focus target. */
  readonly offscreen?: boolean;
  /** The event began before this element. */
  readonly startsBefore: boolean;
  readonly style?: CSSProperties;
  /** Formatted start time; omitted for all-day events and continuations. */
  readonly time?: string;
}

/**
 * One event in a month cell. Bars are filled and their clipped ends show where the event
 * continues; other events are a coloured dot, start time, and title.
 */
export function MonthEvent<TEvent>({
  bar,
  className,
  color,
  date,
  days,
  endsAfter,
  event,
  focusTarget,
  icon,
  labelEvent,
  offscreen,
  startsBefore,
  style,
  time,
}: MonthEventProps<TEvent>) {
  const chip = useEventChip(event, { date, days, focusTarget, labelEvent, offscreen });

  return (
    <EventChip
      color={color}
      {...chip}
      style={style}
      title={event.title}
      className={monthEventClass(bar, startsBefore, endsAfter, className)}
    >
      {bar ? (
        startsBefore && <ChevronLeftIcon aria-hidden className={monthEventChevronClass} />
      ) : (
        <span aria-hidden className={monthEventDotClass} />
      )}
      {time !== undefined && <span className={monthEventTimeClass(bar)}>{time}</span>}
      <span data-slot="calendar-event-title" className={monthEventTitleClass(bar)}>
        <EventIcon className={monthEventIconClass}>{icon}</EventIcon>
        {event.title}
      </span>
      {bar && endsAfter && <ChevronRightIcon aria-hidden className={monthEventChevronClass} />}
    </EventChip>
  );
}
