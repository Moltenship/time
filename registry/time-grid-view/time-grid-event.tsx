import type {
  EventDayFragment,
  EventId,
  ResourceId,
  TimeGridEventLayout,
} from "@moltenship/calendar";

import { EventChip } from "@registry/calendar/event-chip";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "@registry/lib/utils";

type DayFragment = EventDayFragment<unknown, EventId, ResourceId>;

export interface TimeGridEventProps {
  readonly color?: CalendarEventColor;
  readonly layout: TimeGridEventLayout<DayFragment>;
  readonly timeFormat: Intl.DateTimeFormat;
  readonly timeZone: string;
}

/** Blocks shorter than this show title and start time on one line. */
const COMPACT_MINUTES = 45;

export function percent(fraction: number): string {
  return `${fraction * 100}%`;
}

/** The event's own start and end on the wall clock, even on the second day of an overnight event. */
function wallTimes({ event, end, start }: DayFragment, timeZone: string) {
  switch (event.kind) {
    case "timed":
      return [
        event.start.toZonedDateTimeISO(timeZone).toPlainTime(),
        event.end.toZonedDateTimeISO(timeZone).toPlainTime(),
      ] as const;
    case "floating":
      return [event.start.toPlainTime(), event.end.toPlainTime()] as const;
    case "all-day":
      return [start.toPlainTime(), end.toPlainTime()] as const;
  }
}

/**
 * A positioned event: title and time range, or one compact line when short. Resize handles mark
 * the edges that belong to this day; continued edges are squared off instead.
 */
export function TimeGridEvent({ color, layout, timeFormat, timeZone }: TimeGridEventProps) {
  const { fragment, height, left, top, width } = layout;
  const { event, endsAfterDay, startsBeforeDay } = fragment;
  const [start, end] = wallTimes(fragment, timeZone);
  const compact = height * 24 * 60 < COMPACT_MINUTES;
  const resizable = !event.isReadOnly;

  return (
    <EventChip
      color={color}
      data-event-id={String(event.id)}
      data-pending={event.isPending === true ? "" : undefined}
      className={cn(
        "group absolute flex-col items-stretch gap-0 px-1.5 shadow-[0_0_0_1px_var(--background)] data-pending:opacity-60",
        compact ? "flex-row items-center gap-1 py-0 text-[0.6875rem] leading-none" : "py-1",
        startsBeforeDay && "rounded-t-none",
        endsAfterDay && "rounded-b-none",
      )}
      style={{
        height: percent(height),
        left: percent(left),
        top: percent(top),
        width: percent(width),
      }}
    >
      {compact ? (
        <span className="truncate">
          {event.title}
          <span className="font-normal opacity-80">, {timeFormat.format(start)}</span>
        </span>
      ) : (
        <>
          <span className="line-clamp-2">{event.title}</span>
          <span className="truncate font-normal tabular-nums opacity-80">
            {timeFormat.formatRange(start, end)}
          </span>
        </>
      )}
      {resizable && !startsBeforeDay && (
        <span
          aria-hidden
          data-resize="start"
          className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize"
        />
      )}
      {resizable && !endsAfterDay && (
        <span
          aria-hidden
          data-resize="end"
          className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize justify-center after:mt-auto after:mb-0.5 after:h-0.5 after:w-4 after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover:after:opacity-40"
        />
      )}
    </EventChip>
  );
}
