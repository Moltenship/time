import { comparePlainDates } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { ListProjection } from "../views/list/list";
import { eventFocus } from "./day-events";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./types";

interface Item {
  readonly date: Temporal.PlainDate;
  readonly day: number;
  readonly eventId: EventId;
}

function itemsOf(projection: ListProjection<unknown, EventId, ResourceId>): readonly Item[] {
  return projection.days.flatMap(({ date, items }, day) =>
    items.map(({ event }) => ({ date, day, eventId: event.id })),
  );
}

function focusOn(item: Item | undefined): CalendarSpatialNavigation | null {
  return item === undefined ? null : eventFocus(item.date, item.eventId);
}

/**
 * Spatial navigation for an agenda from `projectList`, whose items are events on their dates.
 * Up and down move to the previous and next item, Page Up and Page Down to the first item of the
 * previous and next day, and Home and End to the first and last item. Moving past either end
 * pages the view and enters it from the near end. Focus on a date the agenda does not list, such
 * as a day carried over from another view, moves from where that date would be.
 */
export function listSpatialNavigation({
  command,
  focus,
  projection,
}: CalendarSpatialNavigationInput<
  ListProjection<unknown, EventId, ResourceId>,
  unknown
>): CalendarSpatialNavigation | null {
  const items = itemsOf(projection);
  if (focus === null) return focusOn(command === "end" ? items.at(-1) : items[0]);

  const index = items.findIndex(
    (item) =>
      focus.kind === "event" && item.eventId === focus.eventId && item.date.equals(focus.date),
  );
  // Without an item, focus sits just before the first item on or after its date.
  const after = items.findIndex((item) => comparePlainDates(item.date, focus.date) >= 0);
  const next = index === -1 ? (after === -1 ? items.length : after) : index + 1;
  const previous = index === -1 ? next - 1 : index - 1;
  const firstOfDay = (day: number) => items.find((item) => item.day === day);
  const days = projection.days.length;

  switch (command) {
    case "up":
      return previous < 0 ? { page: -1 } : focusOn(items[previous]);
    case "down":
      return next >= items.length ? { page: 1 } : focusOn(items[next]);
    case "page-up": {
      const day = index === -1 ? (items[previous]?.day ?? -1) : items[index]!.day - 1;
      return day < 0 ? { page: -1 } : focusOn(firstOfDay(day));
    }
    case "page-down": {
      const day = index === -1 ? (items[next]?.day ?? days) : items[index]!.day + 1;
      return day >= days ? { page: 1 } : focusOn(firstOfDay(day));
    }
    case "home":
      return focusOn(items[0]);
    case "end":
      return focusOn(items.at(-1));
    default:
      return null;
  }
}
