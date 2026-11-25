"use client";

import {
  eventIdAttributes,
  useCalendarInteraction,
  useRovingFocus,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import type { ComponentProps, ReactNode } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import { previewCheck, previewCheckAttributes } from "@registry/calendar/preview-check";
import { eventChipClass, eventIconClass } from "@registry/shared/calendar/event-chip.styles";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
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
      className={cn(eventChipClass, className)}
      {...props}
    />
  );
}

export interface EventIconProps {
  /** What a view's `getEventIcon` returned for the event; nothing renders without an icon. */
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * The icon a view's `getEventIcon` gives an event, inline before its title, in the chip's text
 * colour; size it for the chip's text through `className`. It's decorative and hidden from
 * assistive technology, as the event's accessible name says what it means.
 */
export function EventIcon({ children, className }: EventIconProps) {
  if (children == null || typeof children === "boolean" || children === "") return null;
  return (
    <span
      aria-hidden="true"
      data-slot="calendar-event-icon"
      className={cn(eventIconClass, className)}
    >
      {children}
    </span>
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
  /**
   * Rendered beside the visible dates of a scrolling view, ready to scroll into view: neither a
   * focus target nor in the tab order, so the visible dates keep the view's tab stop.
   */
  readonly offscreen?: boolean;
  /** The resource this copy shows in, in a view with a copy per resource. */
  readonly resourceId?: ResourceId | null;
}

/**
 * Props that make an `EventChip` one of its view's focus targets: the event's ID attributes, its
 * roving tab stop, its accessible name, whether a keyboard gesture has grabbed it, and whether the
 * policies would reject or flag where it is going, or a change is still saving.
 */
export function useEventChip<TEvent>(
  event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>,
  {
    date,
    days = 1,
    focusTarget = true,
    labelEvent,
    offscreen = false,
    resourceId,
  }: EventChipFocusOptions<TEvent>,
) {
  const grabbed = useCalendarInteraction((session) => session?.eventId === event.id);
  const check = useCalendarInteraction((session, answer) =>
    session?.eventId === event.id ? previewCheck(answer) : undefined,
  );
  // A grabbed event previews as pending, but nothing is saving until the gesture commits.
  const pending = event.isPending === true && !grabbed;
  const roving = useRovingFocus({ date, eventId: event.id, kind: "event", resourceId }, { days });

  return {
    ...eventIdAttributes(event.id),
    ...(offscreen ? { tabIndex: -1 } : focusTarget ? roving : undefined),
    "aria-label": labelEvent({ ...event, isPending: pending }),
    "data-grabbed": grabbed ? "" : undefined,
    ...previewCheckAttributes(check),
    pending,
  };
}
