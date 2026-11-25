import type { JSX } from "@solidjs/web";
import { For, omit } from "solid-js";

import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import type { AgendaFormats } from "@registry/shared/list-view/agenda-labels";
import type { AgendaDay as AgendaDayData } from "@registry/shared/list-view/agenda-rows";
import {
  agendaDateClass,
  agendaDateColumnClass,
  agendaDayClass,
  agendaEventsClass,
  agendaWeekdayClass,
} from "@registry/shared/list-view/agenda.styles";
import { cn } from "cn";

import { AgendaItem } from "./agenda-item";

export type { AgendaFormats };

export interface AgendaDayProps<TEvent> extends Omit<
  JSX.LiHTMLAttributes<HTMLLIElement>,
  "children"
> {
  readonly day: AgendaDayData<TEvent>;
  readonly formats: AgendaFormats;
  readonly getEventColor?: (event: TEvent) => CalendarEventColor;
  /** An icon before an event's title, or nothing. */
  readonly getEventIcon?: (event: TEvent) => JSX.Element;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens a day: its date's button does, and Shift+Enter on one of its events. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
}

/** One day of the agenda: its date, which stays in view while its events scroll past, then them. */
export function AgendaDay<TEvent>(props: AgendaDayProps<TEvent>) {
  const rest = omit(
    props,
    "class",
    "day",
    "formats",
    "getEventColor",
    "getEventIcon",
    "labelEvent",
    "onOpenDay",
  );
  return (
    <li data-date={props.day.date.toString()} class={cn(agendaDayClass, props.class)} {...rest}>
      {/* Sticks to the top while the day's events scroll past. */}
      <div class={agendaDateColumnClass}>
        <span class={agendaWeekdayClass(props.day.isToday)}>
          {props.formats.weekday.format(props.day.date)}
        </span>
        <button
          type="button"
          aria-current={props.day.isToday ? "date" : undefined}
          aria-label={props.formats.date.format(props.day.date)}
          onClick={() => props.onOpenDay(props.day.date)}
          // The list keeps one tab stop; Shift+Enter on an event opens its day.
          tabindex={-1}
          class={agendaDateClass(props.day.isToday)}
        >
          {props.day.date.day}
        </button>
      </div>
      <ul class={agendaEventsClass}>
        {/* `typeof` keeps numeric 1 and string "1" apart; they are distinct event IDs. */}
        <For each={props.day.items} keyed={(item) => `${typeof item.event.id}:${item.event.id}`}>
          {(item) => (
            <li>
              <AgendaItem
                color={props.getEventColor?.(item().event.event)}
                icon={props.getEventIcon?.(item().event.event)}
                item={item()}
                labelEvent={props.labelEvent}
                onOpenDay={props.onOpenDay}
                timeFormat={props.formats.time}
              />
            </li>
          )}
        </For>
      </ul>
    </li>
  );
}
