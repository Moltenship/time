import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import type { EventDayFragment, EventId, ResourceId, YearDay } from "@moltenship/calendar";
import { useRef, type RefObject } from "react";

import { EventChip, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { cn } from "cn";
import { PopoverContent } from "@registry/ui/popover";

import type { YearDayPopoverHandle, YearFormats } from "./year-month";

interface YearEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly formats: YearFormats;
  readonly fragment: EventDayFragment<TEvent, EventId, ResourceId>;
  readonly labelEvent: EventLabeler<TEvent>;
}

/**
 * One event in a day's list: all-day and multi-day events as filled bars, others as a coloured
 * dot, start time, and title. A `[data-event-id]` button, so the app's event details open from it
 * as from any view.
 */
function YearEvent<TEvent>({ color, formats, fragment, labelEvent }: YearEventProps<TEvent>) {
  const { event } = fragment;
  const chip = useEventChip(event, { date: fragment.date, focusTarget: false, labelEvent });
  const bar = event.kind === "all-day" || fragment.startsBeforeDay || fragment.endsAfterDay;
  const time =
    event.kind === "all-day" || fragment.startsBeforeDay
      ? undefined
      : formats.time(fragment.start.toPlainTime());

  return (
    <EventChip
      color={color}
      {...chip}
      title={event.title}
      className={cn(
        "h-6 shrink-0 gap-1 rounded-sm px-1.5 py-0",
        !bar &&
          "border-s-0 bg-transparent font-normal text-foreground hover:bg-accent hover:brightness-100",
      )}
    >
      {!bar && (
        <span aria-hidden className="size-2 shrink-0 rounded-full bg-calendar-event-border" />
      )}
      {time !== undefined && (
        <span className={cn("shrink-0", bar ? "font-normal" : "text-muted-foreground")}>
          {time}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
    </EventChip>
  );
}

export interface YearDayPopoverProps<TEvent> {
  /** The year's days by ISO date, so the popover shows a day's events as they are now. */
  readonly days: ReadonlyMap<string, YearDay<TEvent, EventId, ResourceId>>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  readonly handle: YearDayPopoverHandle;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The view's element, where focus returns to the day the popover was open on. */
  readonly view: RefObject<HTMLElement | null>;
}

/**
 * One popover for every day of the year, through Base UI's detached triggers, so the year never
 * mounts hundreds of roots. It lists the day's events and opens the day from its date. Closing it
 * returns focus to the day, unless a click outside focused something else.
 */
export function YearDayPopover<TEvent>({
  days,
  formats,
  getEventColor,
  handle,
  labelEvent,
  onOpenDay,
  view,
}: YearDayPopoverProps<TEvent>) {
  const popup = useRef<HTMLDivElement>(null);

  return (
    <PopoverPrimitive.Root handle={handle}>
      {({ payload: date }) => {
        if (date === undefined) return null;
        const fragments = days.get(date.toString())?.fragments ?? [];
        const name = formats.date.format(date);
        return (
          <PopoverContent
            ref={popup}
            aria-label={`Events on ${name}`}
            className="max-h-(--available-height) w-64 gap-0 p-2"
            // The popup takes focus, from a pointer or a key alike; Tab then reaches its events.
            initialFocus={popup}
            finalFocus={() => {
              // An outside click that focused something else keeps that focus.
              const active = document.activeElement;
              if (active !== null && active !== document.body && !popup.current?.contains(active)) {
                return false;
              }
              return (
                view.current?.querySelector<HTMLElement>(
                  `[role="gridcell"][data-date="${date.toString()}"]`,
                ) ?? false
              );
            }}
          >
            <div className="flex flex-col items-center gap-0.5 pb-2">
              <span className="text-[0.6875rem] font-medium text-muted-foreground uppercase">
                {formats.weekdayShort.format(date)}
              </span>
              <button
                type="button"
                aria-label={name}
                onClick={() => onOpenDay(date)}
                className="flex size-10 items-center justify-center rounded-full text-xl tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                {date.day}
              </button>
            </div>
            {fragments.length === 0 ? (
              <p className="pb-2 text-center text-xs text-muted-foreground">No events</p>
            ) : (
              <div className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-1">
                {fragments.map((fragment) => (
                  <YearEvent
                    // `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs.
                    key={`${typeof fragment.event.id}:${fragment.event.id}`}
                    color={getEventColor?.(fragment.event.event)}
                    formats={formats}
                    fragment={fragment}
                    labelEvent={labelEvent}
                  />
                ))}
              </div>
            )}
          </PopoverContent>
        );
      }}
    </PopoverPrimitive.Root>
  );
}
