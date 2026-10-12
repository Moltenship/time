import { memo, type ComponentProps, type ReactNode } from "react";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";

import { AgendaItem } from "./agenda-item";
import type { AgendaDay as AgendaDayData } from "./agenda-rows";

export interface AgendaFormats {
  readonly date: Intl.DateTimeFormat;
  readonly range: Intl.DateTimeFormat;
  readonly time: Intl.DateTimeFormat;
  readonly weekday: Intl.DateTimeFormat;
}

export interface AgendaDayProps<TEvent> extends Omit<ComponentProps<"li">, "children"> {
  readonly day: AgendaDayData<TEvent>;
  readonly formats: AgendaFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a day: its date's button does, and Shift+Enter on one of its events. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
}

type AgendaDayContentProps<TEvent> = Pick<
  AgendaDayProps<TEvent>,
  "day" | "formats" | "getEventColor" | "getEventIcon" | "labelEvent" | "onOpenDay"
>;

/** One day of the agenda: its date, which stays in view while its events scroll past, then them. */
export function AgendaDay<TEvent>({
  className,
  day,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  onOpenDay,
  ...props
}: AgendaDayProps<TEvent>) {
  return (
    <li
      data-date={day.date.toString()}
      className={cn("flex gap-3 px-3 py-2 sm:gap-6 sm:px-6", className)}
      {...props}
    >
      <AgendaDayContent
        day={day}
        formats={formats}
        getEventColor={getEventColor}
        getEventIcon={getEventIcon}
        labelEvent={labelEvent}
        onOpenDay={onOpenDay}
      />
    </li>
  );
}

function AgendaDayContentBase<TEvent>({
  day,
  formats,
  getEventColor,
  getEventIcon,
  labelEvent,
  onOpenDay,
}: AgendaDayContentProps<TEvent>) {
  return (
    <>
      {/* Sticks to the top while the day's events scroll past. */}
      <div className="sticky top-0 flex w-12 shrink-0 flex-col items-center gap-0.5 self-start pt-1">
        <span
          className={cn(
            "text-[0.6875rem] font-medium uppercase",
            day.isToday ? "text-calendar-today" : "text-muted-foreground",
          )}
        >
          {formats.weekday.format(day.date)}
        </span>
        <button
          type="button"
          aria-current={day.isToday ? "date" : undefined}
          aria-label={formats.date.format(day.date)}
          onClick={() => onOpenDay(day.date)}
          // The list keeps one tab stop; Shift+Enter on an event opens its day.
          tabIndex={-1}
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-lg tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
            day.isToday &&
              "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
          )}
        >
          {day.date.day}
        </button>
      </div>
      <ul className="flex min-w-0 flex-1 flex-col gap-0.5 py-1">
        {day.items.map((item) => (
          // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
          <li key={`${typeof item.event.id}:${item.event.id}`}>
            <AgendaItem
              color={getEventColor?.(item.event.event)}
              icon={getEventIcon?.(item.event.event)}
              item={item}
              labelEvent={labelEvent}
              onOpenDay={onOpenDay}
              timeFormat={formats.time}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * A day's date and events. The virtualizer renders the list again whenever it scrolls or measures
 * a row, which only moves the day: its events, and the dates and times they format, render again
 * only when their props change.
 */
const AgendaDayContent = memo(AgendaDayContentBase) as typeof AgendaDayContentBase;
