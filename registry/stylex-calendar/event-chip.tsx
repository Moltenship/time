"use client";

import {
  eventIdAttributes,
  useCalendarInteraction,
  useRovingFocus,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { ComponentProps, ReactNode } from "react";

import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import { previewCheck, previewCheckAttributes } from "@registry/stylex-calendar/preview-check";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { eventColorStyles } from "@registry/stylex-calendar-theme/event-color-styles";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  chip: {
    alignItems: "center",
    appearance: "none",
    backgroundColor: {
      default: calendarVars["--calendar-event"],
      ":hover": `color-mix(in oklch, ${calendarVars["--calendar-event"]} 95%, light-dark(black, white))`,
    },
    borderBlockWidth: 0,
    borderInlineEndWidth: 0,
    borderInlineStartColor: calendarVars["--calendar-event-border"],
    borderInlineStartStyle: "solid",
    borderInlineStartWidth: 3,
    borderRadius: "calc(var(--radius) * 0.8)",
    boxShadow: {
      default: null,
      "[data-grabbed]": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      "[data-grabbed][data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      "[data-grabbed][data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}`,
      "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}`,
    },
    color: calendarVars["--calendar-event-foreground"],
    cursor: "pointer",
    display: "flex",
    fontFamily: "inherit",
    fontSize: "0.75rem",
    fontWeight: 500,
    gap: "0.375rem",
    lineHeight: 1.25,
    minWidth: 0,
    opacity: {
      default: null,
      "[data-dragging]": 0.4,
      "[data-pending]": 0.6,
    },
    outlineColor: { default: null, ":focus-visible": calendarVars["--ring"] },
    outlineOffset: { default: null, ":focus-visible": 1 },
    outlineStyle: { default: null, ":focus-visible": "solid" },
    outlineWidth: { default: null, ":focus-visible": 2 },
    overflow: "hidden",
    paddingBlock: "0.25rem",
    paddingInline: "0.5rem",
    textAlign: "start",
    transitionDuration: "150ms",
    transitionProperty: "background-color, box-shadow",
    zIndex: {
      default: null,
      ":focus-visible": 10,
      "[data-grabbed]": 20,
    },
  },
  icon: {
    alignItems: "center",
    display: "inline-flex",
    flexShrink: 0,
    height: "0.75rem",
    justifyContent: "center",
    marginInlineEnd: "0.25rem",
    verticalAlign: "-0.125em",
    width: "0.75rem",
  },
});

export interface EventChipProps extends ComponentProps<"button"> {
  /** Sets `data-color`; without it the chip uses the theme's default event tokens. */
  readonly color?: CalendarEventColor;
  /** A change to the event is still being saved: the chip is dimmed and marked busy. */
  readonly pending?: boolean;
  /** Styles the view or app adds, after the chip's own. */
  readonly xstyle?: XStyle;
}

/** Base event surface shared by every view: tinted fill, accent edge, readable text. */
export function EventChip({
  className,
  color,
  pending = false,
  style,
  type = "button",
  xstyle,
  ...props
}: EventChipProps) {
  return (
    <button
      aria-busy={pending || undefined}
      data-slot="calendar-event"
      data-color={color}
      data-pending={pending ? "" : undefined}
      type={type}
      {...props}
      // `data-dragging` marks the event a pointer drag is moving; its preview follows the pointer.
      // `data-grabbed` marks the event a keyboard gesture is moving; it moves with the keys.
      // `data-invalid` and `data-warning` mark a preview the policies would reject or flag.
      {...xprops(
        { className, style },
        styles.chip,
        color !== undefined && eventColorStyles[color],
        xstyle,
      )}
    />
  );
}

export interface EventIconProps {
  /** What a view's `getEventIcon` returned for the event; nothing renders without an icon. */
  readonly children?: ReactNode;
  readonly xstyle?: XStyle;
}

/**
 * The icon a view's `getEventIcon` gives an event, inline before its title, in the chip's text
 * colour; size it for the chip's text through `xstyle`. It's decorative and hidden from
 * assistive technology, as the event's accessible name says what it means.
 */
export function EventIcon({ children, xstyle }: EventIconProps) {
  if (children == null || typeof children === "boolean" || children === "") return null;
  return (
    <span aria-hidden="true" data-slot="calendar-event-icon" {...stylex.props(styles.icon, xstyle)}>
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
