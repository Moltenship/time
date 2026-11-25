"use client";

import type { EventDayFragment, EventId, ResourceId, YearDay } from "@moltenship/calendar";
import { useRef, type ReactNode, type RefObject } from "react";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { dayCellOf, eventKey, isBarFragment } from "@registry/shared/year-view/year-layout";
import {
  dayEventsLabel,
  eventTime,
  noEventsText,
  type YearFormats,
} from "@registry/shared/year-view/year-labels";
import {
  yearEventClass,
  yearEventDotClass,
  yearEventTimeClass,
  yearEventTitleClass,
  yearPopoverClass,
  yearPopoverDateClass,
  yearPopoverEmptyClass,
  yearPopoverHeaderClass,
  yearPopoverListClass,
  yearPopoverWeekdayClass,
} from "@registry/shared/year-view/year.styles";
import { Popover, PopoverContent } from "@registry/calendar-ui/popover";

import type { YearDayPopoverHandle } from "./year-month";

interface YearEventProps<TEvent> {
  readonly color?: CalendarEventColor;
  readonly formats: YearFormats;
  readonly fragment: EventDayFragment<TEvent, EventId, ResourceId>;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: ReactNode;
  readonly labelEvent: EventLabeler<TEvent>;
}

/**
 * One event in a day's list: all-day and multi-day events as filled bars, others as a coloured
 * dot, start time, and title. A `[data-event-id]` button, so the app's event details open from it
 * as from any view.
 */
function YearEvent<TEvent>({ color, formats, fragment, icon, labelEvent }: YearEventProps<TEvent>) {
  const { event } = fragment;
  const chip = useEventChip(event, { date: fragment.date, focusTarget: false, labelEvent });
  const bar = isBarFragment(fragment);
  const time = eventTime(fragment, formats);

  return (
    <EventChip color={color} {...chip} title={event.title} className={yearEventClass(bar)}>
      {!bar && <span aria-hidden className={yearEventDotClass} />}
      {time !== undefined && <span className={yearEventTimeClass(bar)}>{time}</span>}
      <span data-slot="calendar-event-title" className={yearEventTitleClass}>
        <EventIcon>{icon}</EventIcon>
        {event.title}
      </span>
    </EventChip>
  );
}

export interface YearDayPopoverProps<TEvent> {
  /** The year's days by ISO date, so the popover shows a day's events as they are now. */
  readonly days: ReadonlyMap<string, YearDay<TEvent, EventId, ResourceId>>;
  readonly formats: YearFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => ReactNode;
  readonly handle: YearDayPopoverHandle;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The view's element, where focus returns to the day the popover was open on. */
  readonly view: RefObject<HTMLElement | null>;
}

/**
 * One popover for every day of the year, through a handle every day shares, so the year never
 * mounts hundreds of roots. It lists the day's events and opens the day from its date. Closing it
 * returns focus to the day, unless a click outside focused something else.
 */
export function YearDayPopover<TEvent>({
  days,
  formats,
  getEventColor,
  getEventIcon,
  handle,
  labelEvent,
  onOpenDay,
  view,
}: YearDayPopoverProps<TEvent>) {
  const popup = useRef<HTMLDivElement>(null);

  return (
    <Popover handle={handle}>
      {({ payload: date }) => {
        if (date === undefined) return null;
        const fragments = days.get(date.toString())?.fragments ?? [];
        const name = formats.date.format(date);
        return (
          <PopoverContent
            ref={popup}
            aria-label={dayEventsLabel(formats, date)}
            className={yearPopoverClass}
            // The popup takes focus, from a pointer or a key alike; Tab then reaches its events.
            initialFocus={popup}
            // The day's cell, the view's tab stop; ui-sdk leaves focus alone after a click outside.
            finalFocus={() => dayCellOf(view.current, date)}
          >
            <div className={yearPopoverHeaderClass}>
              <span className={yearPopoverWeekdayClass}>{formats.weekdayShort.format(date)}</span>
              <button
                type="button"
                aria-label={name}
                onClick={() => onOpenDay(date)}
                className={yearPopoverDateClass}
              >
                {date.day}
              </button>
            </div>
            {fragments.length === 0 ? (
              <p className={yearPopoverEmptyClass}>{noEventsText}</p>
            ) : (
              <div className={yearPopoverListClass}>
                {fragments.map((fragment) => (
                  <YearEvent
                    key={eventKey(fragment)}
                    color={getEventColor?.(fragment.event.event)}
                    icon={getEventIcon?.(fragment.event.event)}
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
    </Popover>
  );
}
