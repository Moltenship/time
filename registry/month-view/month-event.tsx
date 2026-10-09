import {
  eventIdAttributes,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import type { CSSProperties } from "react";

import { EventChip } from "@registry/calendar/event-chip";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

export interface MonthEventProps {
  /** A filled bar (all-day and multi-day events) rather than a dot, time, and title. */
  readonly bar: boolean;
  readonly className?: string;
  readonly color?: CalendarEventColor;
  /** The event continues after this element. */
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId>;
  /** Accessible name: title, when, and other details the visible text leaves out. */
  readonly label: string;
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
export function MonthEvent({
  bar,
  className,
  color,
  endsAfter,
  event,
  label,
  startsBefore,
  style,
  time,
}: MonthEventProps) {
  return (
    <EventChip
      aria-label={label}
      color={color}
      {...eventIdAttributes(event.id)}
      pending={event.isPending === true}
      style={style}
      title={event.title}
      className={cn(
        "gap-1 rounded-sm px-1.5 py-0 max-sm:px-1 max-sm:text-[0.625rem]",
        bar
          ? [startsBefore && "rounded-l-none border-l-0 pl-0.5", endsAfter && "rounded-r-none"]
          : // Small screens show compact tinted blocks instead of dot, time, and title.
            "border-l-0 bg-transparent font-normal text-foreground hover:bg-accent hover:brightness-100 max-sm:bg-calendar-event max-sm:text-calendar-event-foreground",
        className,
      )}
    >
      {bar ? (
        startsBefore && <ChevronLeftIcon aria-hidden className="size-3 shrink-0 opacity-70" />
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
        {event.title}
      </span>
      {bar && endsAfter && <ChevronRightIcon aria-hidden className="size-3 shrink-0 opacity-70" />}
    </EventChip>
  );
}
