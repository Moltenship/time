import type { EventId, NormalizedCalendarEvent, ResourceId } from "@moltenship/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

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
}: MonthEventProps<TEvent>) {
  const chip = useEventChip(event, { date, days, focusTarget, labelEvent, offscreen });

  return (
    <EventChip
      color={color}
      {...chip}
      style={style}
      title={event.title}
      className={cn(
        "gap-1 rounded-sm px-1.5 py-0 max-sm:px-1 max-sm:text-[0.625rem]",
        bar
          ? [startsBefore && "rounded-s-none border-s-0 ps-0.5", endsAfter && "rounded-e-none"]
          : // Small screens show compact tinted blocks instead of dot, time, and title.
            "border-s-0 bg-transparent font-normal text-foreground hover:bg-accent hover:brightness-100 max-sm:bg-calendar-event max-sm:text-calendar-event-foreground",
        className,
      )}
    >
      {bar ? (
        startsBefore && (
          <ChevronLeftIcon aria-hidden className="size-3 shrink-0 opacity-70 rtl:rotate-180" />
        )
      ) : (
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full bg-calendar-event-border max-sm:hidden"
        />
      )}
      {time !== undefined && (
        <span
          className={cn("shrink-0 max-sm:hidden", bar ? "font-normal" : "text-muted-foreground")}
        >
          {time}
        </span>
      )}
      <span className={cn("min-w-0 flex-1 truncate max-sm:text-clip", !bar && "font-medium")}>
        <EventIcon className="max-sm:size-2.5 max-sm:[&_svg]:size-2.5">{icon}</EventIcon>
        {event.title}
      </span>
      {bar && endsAfter && (
        <ChevronRightIcon aria-hidden className="size-3 shrink-0 opacity-70 rtl:rotate-180" />
      )}
    </EventChip>
  );
}
