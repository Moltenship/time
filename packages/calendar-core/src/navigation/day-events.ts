import { plainDateIntervalContains } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { DayGridRow } from "../layout/day-grid";
import type { CalendarDayFocus, CalendarEventFocus } from "./focus";
import type { CalendarNavigationCommand, CalendarSpatialNavigation } from "./types";

export function dayFocus(date: Temporal.PlainDate): CalendarSpatialNavigation {
  return { focus: { date, kind: "day" } };
}

export function eventFocus(date: Temporal.PlainDate, eventId: EventId): CalendarSpatialNavigation {
  return { focus: { date, eventId, kind: "event" } };
}

/** The events day-grid rows show on a date, top to bottom. */
export function eventsOnDate(
  rows: readonly DayGridRow<unknown, EventId, ResourceId>[],
  date: Temporal.PlainDate,
): readonly EventId[] {
  const row = rows.find(({ range }) => plainDateIntervalContains(range, date));
  if (row === undefined) return [];
  const column = row.range.start.until(date).days;
  return row.segments
    .filter((segment) => segment.column <= column && column < segment.column + segment.span)
    .toSorted((left, right) => left.lane - right.lane)
    .map((segment) => segment.event.id);
}

/**
 * Moves among the events a day cell shows: `"enter"` reaches the first, up and down walk them,
 * up from the first returns to the day, and down from the last goes `below`. `undefined` leaves
 * the key to the view, as for an event the day no longer shows.
 */
export function dayEventNavigation(
  events: readonly EventId[],
  focus: CalendarDayFocus | CalendarEventFocus,
  command: CalendarNavigationCommand,
  below: CalendarSpatialNavigation | null,
): CalendarSpatialNavigation | null | undefined {
  const { date } = focus;
  if (focus.kind === "day") {
    if (command !== "enter") return undefined;
    return events.length === 0 ? null : eventFocus(date, events[0]!);
  }
  if (command === "exit") return dayFocus(date);
  const index = events.indexOf(focus.eventId);
  if (index === -1) return undefined;
  if (command === "up") return index > 0 ? eventFocus(date, events[index - 1]!) : dayFocus(date);
  if (command === "down") {
    return index < events.length - 1 ? eventFocus(date, events[index + 1]!) : below;
  }
  return undefined;
}
