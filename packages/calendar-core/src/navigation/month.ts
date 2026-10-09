import { plainDateIntervalContains, weekRange } from "@moltenship/calendar-temporal";

import type { CalendarDirection, IsoDayOfWeek } from "../environment";
import type { EventId, ResourceId } from "../ids";
import type { MonthProjection } from "../views/month/month";
import type {
  CalendarNavigationCommand,
  CalendarSpatialNavigation,
  CalendarSpatialNavigationInput,
} from "./types";

type Projection = MonthProjection<unknown, EventId, ResourceId>;

/** The events shown on a date, top to bottom. */
function eventsOn(projection: Projection, date: Temporal.PlainDate): readonly EventId[] {
  const week = projection.weeks.find(({ range }) => plainDateIntervalContains(range, date));
  if (week === undefined) return [];
  const column = week.range.start.until(date).days;
  return week.segments
    .filter((segment) => segment.column <= column && column < segment.column + segment.span)
    .toSorted((left, right) => left.lane - right.lane)
    .map((segment) => segment.event.id);
}

function entry(projection: Projection, command: CalendarNavigationCommand): Temporal.PlainDate {
  const days = projection.weeks.flatMap((week) => week.days);
  const month = days.filter((day) => day.inMonth);
  if (command === "end") return month.at(-1)!.date;
  return (days.find((day) => day.isToday) ?? month[0]!).date;
}

/** Arrow keys move by a day or a week, Home and End to the week's ends, Page keys by a month. */
function moveDate(
  date: Temporal.PlainDate,
  command: CalendarNavigationCommand,
  firstDay: IsoDayOfWeek,
  direction: CalendarDirection,
): Temporal.PlainDate | null {
  const forward = direction === "rtl" ? -1 : 1;
  switch (command) {
    case "left":
      return date.subtract({ days: forward });
    case "right":
      return date.add({ days: forward });
    case "up":
      return date.subtract({ weeks: 1 });
    case "down":
      return date.add({ weeks: 1 });
    case "home":
      return weekRange(date, { weekStartsOn: firstDay }).start;
    case "end":
      return weekRange(date, { weekStartsOn: firstDay }).end.subtract({ days: 1 });
    case "page-up":
      return date.subtract({ months: 1 });
    case "page-down":
      return date.add({ months: 1 });
    default:
      return null;
  }
}

function day(date: Temporal.PlainDate): CalendarSpatialNavigation {
  return { focus: { date, kind: "day" } };
}

function event(date: Temporal.PlainDate, eventId: EventId): CalendarSpatialNavigation {
  return { focus: { date, eventId, kind: "event" } };
}

/**
 * Spatial navigation for a month grid from `projectMonth`. Day cells move by a day or a week,
 * Home and End go to the week's ends, and Page Up and Page Down by a month, keeping the day where
 * the month has it. `"enter"` moves into a day's events; up and down then walk them top to bottom
 * and leave above the first to the day itself or below the last to the next week. Other keys
 * leave an event as they would leave its day.
 */
export function monthSpatialNavigation({
  command,
  environment,
  focus,
  projection,
}: CalendarSpatialNavigationInput<Projection, unknown>): CalendarSpatialNavigation | null {
  if (focus === null) return day(entry(projection, command));

  const { date } = focus;
  const events = eventsOn(projection, date);
  if (focus.kind === "event") {
    const index = events.indexOf(focus.eventId);
    if (command === "exit") return day(date);
    if (command === "up" && index !== -1) {
      return index > 0 ? event(date, events[index - 1]!) : day(date);
    }
    if (command === "down" && index !== -1) {
      return index < events.length - 1
        ? event(date, events[index + 1]!)
        : day(date.add({ weeks: 1 }));
    }
  } else if (command === "enter") {
    return events.length === 0 ? null : event(date, events[0]!);
  }

  const next = moveDate(date, command, environment.weekRules.firstDay, environment.direction);
  return next === null ? null : day(next);
}
