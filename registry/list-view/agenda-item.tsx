"use client";

import type { EventId, ListItem, ResourceId } from "@moltenship/calendar";
import type { ReactNode } from "react";

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
  readonly icon?: ReactNode;
  readonly item: ListItem<TEvent, EventId, ResourceId>;
  readonly labelEvent: EventLabeler<TEvent>;
  /** Opens the item's day; Shift+Enter on the item does so. */
  readonly onOpenDay: (date: Temporal.PlainDate) => void;
  readonly timeFormat: Intl.DateTimeFormat;
}

/** One agenda row: time range or an "All day" badge, the title, and "Day k of n" for long events. */
export function AgendaItem<TEvent>({
  color,
  icon,
  item,
  labelEvent,
  onOpenDay,
  timeFormat,
}: AgendaItemProps<TEvent>) {
  const time = agendaTimeLabel(item, timeFormat);
  const chip = useEventChip(item.event, { date: item.date, labelEvent });

  return (
    <EventChip
      color={color}
      {...chip}
      onKeyDown={(event) => {
        // Shift+Enter opens the item's day, as clicking its date does.
        if (event.key === "Enter" && event.shiftKey) {
          event.preventDefault();
          onOpenDay(item.date);
        }
      }}
      className={agendaItemClass}
    >
      <span className={agendaTimeColumnClass}>
        <span aria-hidden className={agendaDotClass} />
        {time === undefined ? (
          <span className={agendaAllDayClass}>{allDayLabel}</span>
        ) : (
          <span className={agendaTimeClass}>{time}</span>
        )}
      </span>
      <span className={agendaTitleColumnClass}>
        <span data-slot="calendar-event-title" className={agendaTitleClass}>
          <EventIcon className={agendaEventIconClass}>{icon}</EventIcon>
          {item.event.title}
        </span>
        {item.dayCount > 1 && (
          <span className={agendaDayOfClass}>{dayOfLabel(item.dayIndex, item.dayCount)}</span>
        )}
      </span>
    </EventChip>
  );
}
