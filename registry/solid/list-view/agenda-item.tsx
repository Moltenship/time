import type { EventId, ListItem, ResourceId } from "@moltenship/calendar-solid";
import type { JSX } from "@solidjs/web";
import { Show } from "solid-js";

import { EventChip, EventIcon, useEventChip } from "@registry/calendar/event-chip";
import type { EventLabeler } from "@registry/calendar/event-label";
import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";
import { agendaTimeLabel, allDayLabel, dayOfLabel } from "@registry/shared/list-view/agenda-labels";
import {
  agendaAllDayClass,
  agendaDayOfClass,
  agendaDotClass,
  agendaEventIconClass,
  agendaItemClass,
  agendaTimeClass,
  agendaTimeColumnClass,
  agendaTitleClass,
  agendaTitleColumnClass,
} from "@registry/shared/list-view/agenda.styles";

export interface AgendaItemProps<TEvent> {
  readonly color?: CalendarEventColor;
  /** Shown before the title, from the view's `getEventIcon`. */
  readonly icon?: JSX.Element;
  readonly item: ListItem<TEvent, EventId, ResourceId>;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens the item's day; Shift+Enter on the item does so. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly timeFormat: Intl.DateTimeFormat;
}

/** One agenda row: time range or an "All day" badge, the title, and "Day k of n" for long events. */
export function AgendaItem<TEvent>(props: AgendaItemProps<TEvent>) {
  const time = () => agendaTimeLabel(props.item, props.timeFormat);
  const chip = useEventChip(
    () => props.item.event,
    () => ({ date: props.item.date, labelEvent: props.labelEvent }),
  );
  // Native, so it runs before the view's keyboard, which listens on the list.
  const openDayKey = (element: HTMLElement) => {
    element.addEventListener("keydown", (event) => {
      // Shift+Enter opens the item's day, as clicking its date does.
      if (event.key === "Enter" && event.shiftKey) {
        event.preventDefault();
        props.onOpenDay(props.item.date);
      }
    });
  };

  return (
    <EventChip color={props.color} {...chip} ref={[chip.ref, openDayKey]} class={agendaItemClass}>
      <span class={agendaTimeColumnClass}>
        <span aria-hidden="true" class={agendaDotClass} />
        <Show when={time()} fallback={<span class={agendaAllDayClass}>{allDayLabel}</span>}>
          {(label) => <span class={agendaTimeClass}>{label()}</span>}
        </Show>
      </span>
      <span class={agendaTitleColumnClass}>
        <span data-slot="calendar-event-title" class={agendaTitleClass}>
          <EventIcon class={agendaEventIconClass}>{props.icon}</EventIcon>
          {props.item.event.title}
        </span>
        <Show when={props.item.dayCount > 1}>
          <span class={agendaDayOfClass}>
            {dayOfLabel(props.item.dayIndex, props.item.dayCount)}
          </span>
        </Show>
      </span>
    </EventChip>
  );
}
