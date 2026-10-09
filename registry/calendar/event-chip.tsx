import {
  eventIdAttributes,
  useCalendarInteraction,
  useRovingFocus,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import type { ComponentProps } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

export interface EventChipProps extends ComponentProps<"button"> {
  /** Sets `data-color`; without it the chip uses the theme's default event tokens. */
  readonly color?: CalendarEventColor;
  /** A change to the event is still being saved: the chip is dimmed and marked busy. */
  readonly pending?: boolean;
}

/** Base event surface shared by every view: tinted fill, accent edge, readable text. */
export function EventChip({
  className,
  color,
  pending = false,
  type = "button",
  ...props
}: EventChipProps) {
  return (
    <button
      aria-busy={pending || undefined}
      data-slot="calendar-event"
      data-color={color}
      data-pending={pending ? "" : undefined}
      type={type}
      className={cn(
        // `data-dragging` marks the event a pointer drag is moving; its preview follows the pointer.
        // `data-grabbed` marks the event a keyboard gesture is moving; it moves with the keys.
        "flex min-w-0 items-center gap-1.5 overflow-hidden rounded-md border-s-3 border-calendar-event-border bg-calendar-event px-2 py-1 text-start text-xs leading-tight font-medium text-calendar-event-foreground transition-[filter,box-shadow] hover:brightness-[0.97] focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring data-dragging:opacity-40 data-grabbed:z-20 data-grabbed:shadow-lg data-pending:opacity-60 dark:hover:brightness-110",
        className,
      )}
      {...props}
    />
  );
}

export interface EventChipFocusOptions<TEvent> {
  /** The first date this element shows the event on. */
  readonly date: Temporal.PlainDate;
  /** Dates the element covers from `date`, such as a month bar's span. */
  readonly days?: number;
  /** Whether the element is one of the view's focus targets; a copy in a list is not. */
  readonly focusTarget?: boolean;
  readonly labelEvent: EventLabeler<TEvent>;
}

/**
 * Props that make an `EventChip` one of its view's focus targets: the event's ID attributes, its
 * roving tab stop, its accessible name, and whether a keyboard gesture has grabbed it or a change
 * is still saving.
 */
export function useEventChip<TEvent>(
  event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>,
  { date, days = 1, focusTarget = true, labelEvent }: EventChipFocusOptions<TEvent>,
) {
  const grabbed = useCalendarInteraction((session) => session?.eventId === event.id);
  // A grabbed event previews as pending, but nothing is saving until the gesture commits.
  const pending = event.isPending === true && !grabbed;
  const roving = useRovingFocus({ date, eventId: event.id, kind: "event" }, { days });

  return {
    ...eventIdAttributes(event.id),
    ...(focusTarget ? roving : undefined),
    "aria-label": labelEvent({ ...event, isPending: pending }),
    "data-grabbed": grabbed ? "" : undefined,
    pending,
  };
}
