"use client";

import type { ResourceId } from "@moltenship/calendar";
import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/stylex-calendar/event-chip";
import type { EventLabeler } from "@registry/stylex-calendar/event-label";
import type { CalendarEventColor } from "@registry/stylex-calendar-theme/event-colors";
import {
  calendarConsts,
  calendarVars,
} from "@registry/stylex-calendar-theme/calendar-tokens.stylex";

import type { PlacedBar } from "./timeline-placement";

const styles = stylex.create({
  bar: {
    borderRadius: "calc(var(--radius) * 0.6)",
    gap: "0.25rem",
    lineHeight: "1.5rem",
    paddingBlock: 0,
    paddingInline: "0.375rem",
    position: "absolute",
    zIndex: {
      default: 1,
      ":hover": 2,
      ":focus-visible": 3,
      "[data-grabbed]": 4,
    },
  },
  barEndsAfter: {
    borderEndEndRadius: 0,
    borderStartEndRadius: 0,
  },
  // A stacked bar sits part-way down a lane, over the one before it: a ring sets it apart.
  barStacked: {
    boxShadow: {
      default: `0 0 0 1px ${calendarConsts.surface}`,
      "[data-grabbed]": "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      "[data-grabbed][data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      "[data-grabbed][data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}, 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`,
      "[data-invalid]": `0 0 0 2px ${calendarVars["--calendar-invalid"]}`,
      "[data-warning]": `0 0 0 2px ${calendarVars["--calendar-warning"]}`,
    },
  },
  barStartsBefore: {
    borderEndStartRadius: 0,
    borderInlineStartWidth: 0,
    borderStartStartRadius: 0,
  },
  resizeEnd: {
    insetInlineEnd: 0,
  },
  resizeHandle: {
    cursor: "ew-resize",
    insetBlock: 0,
    maxWidth: "calc(100% / 3)",
    position: "absolute",
    width: "0.375rem",
  },
  resizeStart: {
    insetInlineStart: 0,
  },
  time: {
    fontWeight: 400,
    minWidth: 0,
    opacity: 0.8,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  title: {
    flexShrink: 0,
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
});

/** A lane's height, the gap under it, and the space above the first lane, in pixels. */
export const LANE_HEIGHT = 24;
export const LANE_GAP = 2;
export const ROW_PADDING = 6;

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
  bar: { date, days, endsAfter, event, lane, offset, startsBefore, time, top, width },
  color,
  icon,
  isReadOnly = false,
  labelEvent,
  resourceId,
}: ResourceTimelineEventProps<TEvent>) {
  const chip = useEventChip(event, { date, days, labelEvent, resourceId });
  const resizable = !isReadOnly && !event.isReadOnly;

  return (
    <EventChip
      color={color}
      {...chip}
      title={event.title}
      style={{
        height: LANE_HEIGHT,
        insetInlineStart: offset,
        top: ROW_PADDING + top * (LANE_HEIGHT + LANE_GAP),
        width,
      }}
      xstyle={[
        styles.bar,
        top !== lane && styles.barStacked,
        startsBefore && styles.barStartsBefore,
        endsAfter && styles.barEndsAfter,
      ]}
    >
      {/* The title keeps the room it needs; the time takes what's left, or none. */}
      <span data-slot="calendar-event-title" {...stylex.props(styles.title)}>
        <EventIcon>{icon}</EventIcon>
        {event.title}
      </span>
      {time !== undefined && <span {...stylex.props(styles.time)}>{time}</span>}
      {resizable && !startsBefore && (
        <span
          aria-hidden
          data-resize="start"
          {...stylex.props(styles.resizeHandle, styles.resizeStart)}
        />
      )}
      {resizable && !endsAfter && (
        <span
          aria-hidden
          data-resize="end"
          {...stylex.props(styles.resizeHandle, styles.resizeEnd)}
        />
      )}
    </EventChip>
  );
}
