import type { ResourceId } from "@moltenship/calendar";

import { EventChip, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import type { PlacedBar } from "./timeline-placement";

/** A lane's height, the gap under it, and the space above the first lane, in pixels. */
export const LANE_HEIGHT = 24;
export const LANE_GAP = 2;
export const ROW_PADDING = 6;

export interface ResourceTimelineEventProps<TEvent> {
  readonly bar: PlacedBar<TEvent>;
  readonly color?: CalendarEventColor;
  readonly labelEvent: EventLabeler<TEvent>;
  /** The row's resource; an event with several resources shows once in each of their rows. */
  readonly resourceId: ResourceId | null;
}

/**
 * An event's bar in its lane, across the time it covers. Ends cut off by the range are squared;
 * the others carry resize handles.
 */
export function ResourceTimelineEvent<TEvent>({
  bar: { date, days, endsAfter, event, lane, offset, startsBefore, time, width },
  color,
  labelEvent,
  resourceId,
}: ResourceTimelineEventProps<TEvent>) {
  const chip = useEventChip(event, { date, days, labelEvent, resourceId });
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
          className="absolute inset-y-0 start-0 w-1.5 max-w-1/3 cursor-ew-resize"
        />
      )}
      {resizable && !endsAfter && (
        <span
          aria-hidden
          data-resize="end"
          className="absolute inset-y-0 end-0 w-1.5 max-w-1/3 cursor-ew-resize"
        />
      )}
    </EventChip>
  );
}
