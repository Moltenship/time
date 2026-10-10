import type { DayGridSegment, EventId, ResourceId } from "@moltenship/calendar";

import { EventChip, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

/** A lane's height, the gap under it, and the space above the first lane, in pixels. */
export const LANE_HEIGHT = 24;
export const LANE_GAP = 2;
export const ROW_PADDING = 6;

export interface ResourceTimelineEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  /** The segment's first date. */
  readonly date: Temporal.PlainDate;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Where the bar starts relative to its cell, and its width, in pixels. */
  readonly offset: number;
  readonly segment: DayGridSegment<TEvent, EventId, ResourceId>;
  /** The start time, for a timed event that fits in one day. */
  readonly time?: string;
  readonly width: number;
}

/**
 * An event's bar in its lane, across the days it covers. Ends cut off by the range are squared;
 * the others carry resize handles that move them by whole days.
 */
export function ResourceTimelineEvent<TEvent>({
  color,
  date,
  labelEvent,
  offset,
  segment: { endsAfter, event, lane, span, startsBefore },
  time,
  width,
}: ResourceTimelineEventProps<TEvent>) {
  // Until the timeline has arrow-key navigation, every bar in view is its own tab stop.
  const chip = useEventChip(event, { date, days: span, focusTarget: false, labelEvent });
  const resizable = !event.isReadOnly;

  return (
    <EventChip
      color={color}
      {...chip}
      title={event.title}
      className={cn(
        "group absolute z-1 gap-1 rounded-sm px-1.5 py-0 leading-6 focus-visible:z-2 data-grabbed:z-3",
        startsBefore && "rounded-s-none border-s-0",
        endsAfter && "rounded-e-none",
      )}
      style={{
        height: LANE_HEIGHT,
        insetInlineStart: offset,
        top: ROW_PADDING + lane * (LANE_HEIGHT + LANE_GAP),
        width,
      }}
    >
      {/* The title keeps the room it needs; the time takes what's left, or none. */}
      <span className="max-w-full shrink-0 truncate">{event.title}</span>
      {time !== undefined && (
        <span className="min-w-0 truncate font-normal opacity-80">{time}</span>
      )}
      {resizable && !startsBefore && (
        <span
          aria-hidden
          data-resize="start"
          className="absolute inset-y-0 start-0 w-1.5 cursor-ew-resize"
        />
      )}
      {resizable && !endsAfter && (
        <span
          aria-hidden
          data-resize="end"
          className="absolute inset-y-0 end-0 w-1.5 cursor-ew-resize"
        />
      )}
    </EventChip>
  );
}
