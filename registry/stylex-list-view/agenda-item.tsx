"use client";

import {
  withAsciiSpaces,
  type EventId,
  type ListItem,
  type ResourceId,
} from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import {
  calendarMarker,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";

const styles = stylex.create({
  allDay: {
    backgroundColor: calendarVars["--calendar-event"],
    borderRadius: "9999px",
    color: calendarVars["--calendar-event-foreground"],
    fontSize: "0.75rem",
    fontWeight: 500,
    lineHeight: "1rem",
    paddingBlock: "0.125rem",
    paddingInline: "0.5rem",
  },
  days: {
    color: {
      default: calendarVars["--muted-foreground"],
      [stylex.when.ancestor(":hover", calendarMarker)]: calendarVars["--accent-foreground"],
    },
    flexShrink: 0,
    fontSize: "0.75rem",
    lineHeight: "1rem",
  },
  details: {
    alignItems: "baseline",
    display: "flex",
    flex: "1 1 0%",
    gap: "0.5rem",
    minWidth: 0,
    paddingLeft: { default: null, "@media (max-width: 639.98px)": "1.125rem" },
    width: { default: null, "@media (max-width: 639.98px)": "100%" },
  },
  dot: {
    backgroundColor: calendarVars["--calendar-event-border"],
    borderRadius: "9999px",
    flexShrink: 0,
    height: "0.625rem",
    width: "0.625rem",
  },
  icon: {
    "--calendar-event-icon-size": "0.875rem",
    height: "0.875rem",
    width: "0.875rem",
  },
  item: {
    alignItems: { default: "center", "@media (max-width: 639.98px)": "flex-start" },
    backgroundColor: { default: "transparent", ":hover": calendarVars["--accent"] },
    borderInlineStartWidth: 0,
    color: calendarVars["--foreground"],
    columnGap: "0.75rem",
    flexDirection: { default: null, "@media (max-width: 639.98px)": "column" },
    fontSize: "0.875rem",
    fontWeight: 400,
    lineHeight: "1.25rem",
    paddingBlock: "0.375rem",
    rowGap: "0.125rem",
    transitionProperty: "box-shadow",
    width: "100%",
  },
  time: {
    color: {
      default: calendarVars["--muted-foreground"],
      [stylex.when.ancestor(":hover", calendarMarker)]: calendarVars["--accent-foreground"],
    },
    fontSize: { default: null, "@media (max-width: 639.98px)": "0.75rem" },
    fontVariantNumeric: "tabular-nums",
    lineHeight: { default: null, "@media (max-width: 639.98px)": "1rem" },
  },
  timeColumn: {
    alignItems: "center",
    display: "flex",
    flexShrink: 0,
    gap: "0.5rem",
    width: { default: null, "@media (min-width: 640px)": "11rem" },
  },
  title: {
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

export interface AgendaItemProps<TEvent> {
  readonly color?: CalendarEventColor;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
  readonly item: ListItem<TEvent, EventId, ResourceId>;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens the item's day; Shift+Enter on the item does so. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly timeFormat: Intl.DateTimeFormat;
}

function timeLabel(
  { end, event, start, endsAfterDay, startsBeforeDay }: ListItem<unknown, EventId, ResourceId>,
  format: Intl.DateTimeFormat,
) {
  if (event.kind === "all-day" || (startsBeforeDay && endsAfterDay)) return undefined;
  if (startsBeforeDay) return `Until ${format.format(end.toPlainTime())}`;
  if (endsAfterDay) return `From ${format.format(start.toPlainTime())}`;
  return withAsciiSpaces(format.formatRange(start.toPlainTime(), end.toPlainTime()));
}

/** One agenda row: time range or an "All day" badge, the title, and "Day k of n" for long events. */
export function AgendaItem<TEvent>({
  color,
  icon,
  item,
  labelEvent,
  onOpenDay,
  timeFormat,
}: AgendaItemProps<TEvent>) {
  const time = timeLabel(item, timeFormat);
  const chip = useEventChip(item.event, { date: item.date, labelEvent });

  return (
    <EventChip
      color={color}
      {...chip}
      onKeyDown={(event) => {
        // Shift+Enter opens the item's day, as clicking its date does.
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenDay(item.date);
        }
      }}
      // Muted text turns accent-foreground on the hover fill: muted on accent falls short of 4.5:1.
      xstyle={[styles.item, calendarMarker]}
    >
      <span {...stylex.props(styles.timeColumn)}>
        <span aria-hidden {...stylex.props(styles.dot)} />
        {time === undefined ? (
          <span {...stylex.props(styles.allDay)}>All day</span>
        ) : (
          <span {...stylex.props(styles.time)}>{time}</span>
        )}
      </span>
      <span {...stylex.props(styles.details)}>
        <span data-slot="calendar-event-title" {...stylex.props(styles.title)}>
          {/* Sized for the row's larger text. */}
          <EventIcon xstyle={styles.icon}>{icon}</EventIcon>
          {item.event.title}
        </span>
        {item.dayCount > 1 && (
          <span {...stylex.props(styles.days)}>
            Day {item.dayIndex} of {item.dayCount}
          </span>
        )}
      </span>
    </EventChip>
  );
}
