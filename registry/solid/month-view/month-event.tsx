import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

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
import { ChevronLeftIcon, ChevronRightIcon } from "@registry/calendar-ui/icons";

export interface MonthEventProps<TEvent> {
  /** A filled bar (all-day and multi-day events) rather than a dot, time, and title. */
  readonly bar: boolean;
  readonly class?: string;
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
  readonly icon?: JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Rendered in a week beside the visible ones of a scrolling month: not a focus target. */
  readonly offscreen?: boolean;
  /** The event began before this element. */
  readonly startsBefore: boolean;
  readonly style?: JSX.CSSProperties;
  /** Formatted start time; omitted for all-day events and continuations. */
  readonly time?: string;
}

/**
 * One event in a month cell. Bars are filled and their clipped ends show where the event
 * continues; other events are a coloured dot, start time, and title.
 */
export function MonthEvent<TEvent>(props: MonthEventProps<TEvent>) {
  const chip = useEventChip(
    () => props.event,
    () => ({
      date: props.date,
      days: props.days,
      focusTarget: props.focusTarget,
      labelEvent: props.labelEvent,
      offscreen: props.offscreen,
    }),
  );

  return (
    <EventChip
      color={props.color}
      {...chip}
      style={props.style}
      title={props.event.title}
      class={monthEventClass(props.bar, props.startsBefore, props.endsAfter, props.class)}
    >
      <Show when={props.bar} fallback={<span aria-hidden="true" class={monthEventDotClass} />}>
        <Show when={props.startsBefore}>
          <ChevronLeftIcon aria-hidden="true" class={monthEventChevronClass} />
        </Show>
      </Show>
      <Show when={props.time}>
        {(time) => <span class={monthEventTimeClass(props.bar)}>{time()}</span>}
      </Show>
      <span data-slot="calendar-event-title" class={monthEventTitleClass(props.bar)}>
        <EventIcon class={monthEventIconClass}>{props.icon}</EventIcon>
        {props.event.title}
      </span>
      <Show when={props.bar && props.endsAfter}>
        <ChevronRightIcon aria-hidden="true" class={monthEventChevronClass} />
      </Show>
    </EventChip>
  );
}
