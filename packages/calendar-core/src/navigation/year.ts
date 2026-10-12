import { weekRange } from "@moltenship/calendar-temporal";

import type { CalendarDirection, IsoDayOfWeek } from "../environment";
import type { EventId, ResourceId } from "../ids";
import type { YearProjection } from "../views/year/year";
import { dayFocus } from "./day-events";
import type {
  CalendarNavigationCommand,
  CalendarSpatialNavigation,
  CalendarSpatialNavigationInput,
} from "./types";

type Projection = YearProjection<unknown, EventId, ResourceId>;

/** Today when the year shows it, else the year's first day; its last day for `"end"`. */
function entry(projection: Projection, command: CalendarNavigationCommand): Temporal.PlainDate {
  const { range } = projection;
  if (command === "end") return range.end.subtract({ days: 1 });
  for (const month of projection.months) {
    for (const week of month.weeks) {
      const today = week.days.find((day) => day?.isToday === true);
      if (today != null) return today.date;
    }
  }
  return range.start;
}

/**
 * Arrow keys move by a day or a week, Home and End to the ends of the week within its month, and
 * Page keys by a month.
 */
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
    case "home": {
      const start = weekRange(date, { weekStartsOn: firstDay }).start;
      return start.month === date.month ? start : date.with({ day: 1 });
    }
    case "end": {
      const last = weekRange(date, { weekStartsOn: firstDay }).end.subtract({ days: 1 });
      return last.month === date.month ? last : date.with({ day: date.daysInMonth });
    }
    case "page-up":
      return date.subtract({ months: 1 });
    case "page-down":
      return date.add({ months: 1 });
    default:
      return null;
  }
}

/**
 * Spatial navigation for a year from `projectYear`. Days move by a day or a week, across months
 * as a mini calendar does; Home and End go to the ends of the week's row in its month, and Page Up
 * and Page Down by a month, keeping the day where the month has it. Moving past December or
 * January navigates to the next or previous year. Days have no events to enter: a year view shows
 * them in its own way, such as in a popover.
 */
export function yearSpatialNavigation({
  command,
  environment,
  focus,
  projection,
}: CalendarSpatialNavigationInput<Projection, unknown>): CalendarSpatialNavigation | null {
  if (focus === null) return dayFocus(entry(projection, command));
  const next = moveDate(focus.date, command, environment.weekRules.firstDay, environment.direction);
  return next === null ? null : dayFocus(next);
}
