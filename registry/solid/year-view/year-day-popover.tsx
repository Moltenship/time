import type { EventDayFragment, EventId, ResourceId, YearDay } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { For, Show, untrack } from "solid-js";

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
  readonly icon?: JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
}

/**
 * One event in a day's list: all-day and multi-day events as filled bars, others as a coloured
 * dot, start time, and title. A `[data-event-id]` button, so the app's event details open from it
 * as from any view.
 */
function YearEvent<TEvent>(props: YearEventProps<TEvent>) {
  const chip = useEventChip(
    () => props.fragment.event,
    () => ({ date: props.fragment.date, focusTarget: false, labelEvent: props.labelEvent }),
  );
  const bar = () => isBarFragment(props.fragment);

  return (
    <EventChip
      color={props.color}
      {...chip}
      title={props.fragment.event.title}
      class={yearEventClass(bar())}
    >
      <Show when={!bar()}>
        <span aria-hidden="true" class={yearEventDotClass} />
      </Show>
      <Show when={eventTime(props.fragment, props.formats)}>
        {(time) => <span class={yearEventTimeClass(bar())}>{time()}</span>}
      </Show>
      <span data-slot="calendar-event-title" class={yearEventTitleClass}>
        <EventIcon>{props.icon}</EventIcon>
        {props.fragment.event.title}
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
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly handle: YearDayPopoverHandle;
  readonly labelEvent: EventLabeler<TEvent>;
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  /** The view's element, where focus returns to the day the popover was open on. */
  readonly view: () => HTMLElement | undefined;
}

/**
 * One popover for every day of the year, through a handle every day shares, so the year never
 * mounts hundreds of roots. It lists the day's events and opens the day from its date. Closing it
 * returns focus to the day, unless a click outside focused something else.
 */
export function YearDayPopover<TEvent>(props: YearDayPopoverProps<TEvent>) {
  let popup: HTMLDivElement | undefined;

  return (
    <Popover handle={props.handle}>
      {(state: { readonly payload: Temporal.PlainDate | undefined }) => (
        <Show when={state.payload}>
          {(date) => {
            const fragments = () => props.days.get(date().toString())?.fragments ?? [];
            return (
              <PopoverContent
                ref={(element) => {
                  popup = element;
                }}
                aria-label={dayEventsLabel(props.formats, date())}
                class={yearPopoverClass}
                // The popup takes focus, from a pointer or a key alike; Tab then reaches its events.
                initialFocus={() => popup}
                // The day's cell, the view's tab stop; ui-sdk leaves focus alone after a click
                // outside.
                finalFocus={() => untrack(() => dayCellOf(props.view(), date()))}
              >
                <div class={yearPopoverHeaderClass}>
                  <span class={yearPopoverWeekdayClass}>
                    {props.formats.weekdayShort.format(date())}
                  </span>
                  <button
                    type="button"
                    aria-label={props.formats.date.format(date())}
                    onClick={() => props.onOpenDay(date())}
                    class={yearPopoverDateClass}
                  >
                    {date().day}
                  </button>
                </div>
                <Show
                  when={fragments().length > 0}
                  fallback={<p class={yearPopoverEmptyClass}>{noEventsText}</p>}
                >
                  <div class={yearPopoverListClass}>
                    <For each={fragments()} keyed={eventKey}>
                      {(fragment) => (
                        <YearEvent
                          color={props.getEventColor?.(fragment().event.event)}
                          icon={props.getEventIcon?.(fragment().event.event)}
                          formats={props.formats}
                          fragment={fragment()}
                          labelEvent={props.labelEvent}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </PopoverContent>
            );
          }}
        </Show>
      )}
    </Popover>
  );
}
