"use client";

import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import type { XStyle } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  chevron: {
    flexShrink: 0,
    height: "0.75rem",
    opacity: 0.7,
    rotate: { default: null, ":dir(rtl)": "180deg" },
    width: "0.75rem",
  },
  chip: {
    borderRadius: "calc(var(--radius) * 0.6)",
    fontSize: { default: "0.75rem", "@media (max-width: 639.98px)": "0.625rem" },
    gap: "0.25rem",
    paddingBlock: 0,
    paddingInline: { default: "0.375rem", "@media (max-width: 639.98px)": "0.25rem" },
  },
  dot: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    display: { default: null, "@media (max-width: 639.98px)": "none" },
    flexShrink: 0,
    height: "0.5rem",
    width: "0.5rem",
  },
  endsAfter: {
    borderEndEndRadius: 0,
    borderStartEndRadius: 0,
  },
  icon: {
    "--calendar-event-icon-size": {
      default: "0.75rem",
      "@media (max-width: 639.98px)": "0.625rem",
    },
    height: { default: "0.75rem", "@media (max-width: 639.98px)": "0.625rem" },
    width: { default: "0.75rem", "@media (max-width: 639.98px)": "0.625rem" },
  },
  item: {
    backgroundColor: {
      default: "transparent",
      ":hover": calendarVars["--accent"],
      "@media (max-width: 639.98px)": {
        default: calendarVars["--calendar-event"],
        ":hover": calendarVars["--accent"],
      },
    },
    borderInlineStartWidth: 0,
    color: {
      default: calendarVars["--foreground"],
      "@media (max-width: 639.98px)": calendarVars["--calendar-event-foreground"],
    },
    fontWeight: 400,
    transitionProperty: "box-shadow",
  },
  startsBefore: {
    borderEndStartRadius: 0,
    borderInlineStartWidth: 0,
    borderStartStartRadius: 0,
    paddingInlineStart: { default: "0.125rem", "@media (max-width: 639.98px)": "0.25rem" },
  },
  time: {
    display: { default: null, "@media (max-width: 639.98px)": "none" },
    flexShrink: 0,
  },
  timeBar: {
    fontWeight: 400,
  },
  timeItem: {
    color: {
      default: calendarVars["--muted-foreground"],
      [stylex.when.ancestor(":hover", calendarMarker)]: calendarVars["--accent-foreground"],
    },
  },
  title: {
    flex: "1 1 0%",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: { default: "ellipsis", "@media (max-width: 639.98px)": "clip" },
    whiteSpace: "nowrap",
  },
  titleItem: {
    fontWeight: 500,
  },
});

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
  /** Styles the view adds, after the event's own. */
  readonly xstyle?: XStyle;
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
  xstyle,
}: MonthEventProps<TEvent>) {
  const chip = useEventChip(event, { date, days, focusTarget, labelEvent, offscreen });

  return (
    <EventChip
      color={color}
      {...chip}
      style={style}
      title={event.title}
      className={className}
      xstyle={[
        styles.chip,
        bar
          ? [startsBefore && styles.startsBefore, endsAfter && styles.endsAfter]
          : // Small screens show compact tinted blocks instead of dot, time, and title.
            [styles.item, calendarMarker],
        xstyle,
      ]}
    >
      {bar ? (
        startsBefore && <ChevronLeftIcon aria-hidden {...stylex.props(styles.chevron)} />
      ) : (
        <span aria-hidden {...stylex.props(styles.dot)} />
      )}
      {time !== undefined && (
        <span
          {...stylex.props(
            styles.time,
            // Muted on the hover fill falls short of 4.5:1.
            bar ? styles.timeBar : styles.timeItem,
          )}
        >
          {time}
        </span>
      )}
      <span
        data-slot="calendar-event-title"
        {...stylex.props(styles.title, !bar && styles.titleItem)}
      >
        <EventIcon xstyle={styles.icon}>{icon}</EventIcon>
        {event.title}
      </span>
      {bar && endsAfter && <ChevronRightIcon aria-hidden {...stylex.props(styles.chevron)} />}
    </EventChip>
  );
}
