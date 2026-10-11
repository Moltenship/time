import {
  plainDateInterval,
  plainDateIntervalContains,
  weekRange,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "../../environment";
import type { EventId, ResourceId } from "../../ids";
import { monthSpatialNavigation } from "../../navigation/month";
import type { CalendarViewStrategy } from "../../views";
import { projectMonthWeeks, type MonthProjection } from "./month";

/** Rows every month fits in: fewer leave a long month's last days on no page at all. */
const MINIMUM_WEEKS = 6;
const MAXIMUM_WEEKS = 12;

function assertWeekCount(weeks: number): void {
  if (!Number.isSafeInteger(weeks) || weeks < MINIMUM_WEEKS || weeks > MAXIMUM_WEEKS) {
    throw new RangeError("invalid-scrolling-month-week-count");
  }
}

/**
 * The first day of the month a scrolling month shows: the month its first week ends in, since
 * that week holds the month's first day.
 */
export function scrollingMonthOf(range: PlainDateInterval): Temporal.PlainDate {
  return range.start.add({ days: 6 }).with({ day: 1 });
}

/**
 * The anchor of the scrolling month whose first row is `firstWeek`, as a view moves the calendar
 * after the user swipes to it: the first day of that month.
 */
export function scrollingMonthAnchor(firstWeek: Temporal.PlainDate): Temporal.PlainDate {
  return firstWeek.add({ days: 6 }).with({ day: 1 });
}

/** The week that holds the first day of the anchor's month. */
function firstWeek(
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironmentBase,
): Temporal.PlainDate {
  return weekRange(anchor.with({ day: 1 }), { weekStartsOn: environment.weekRules.firstDay }).start;
}

/**
 * A month that scrolls up and down, swiping a month at a time: `weeks` rows from the week that
 * holds the anchor's month's first day, six to twelve, so every month fits; six by default. A
 * page of weeks above and below is projected too (`getLoadRange`), so a swipe shows their events at once; the
 * days of the month are `inMonth`. Previous and Next move a month. Keyboard navigation moves
 * through the visible weeks as in a month grid.
 */
export function scrollingMonthStrategy<TOptions = undefined, TEvent = unknown>(
  weeks = 6,
): CalendarViewStrategy<MonthProjection<TEvent, EventId, ResourceId>, TOptions, TEvent> {
  assertWeekCount(weeks);

  const strategy: CalendarViewStrategy<
    MonthProjection<TEvent, EventId, ResourceId>,
    TOptions,
    TEvent
  > = {
    getLoadRange: (anchor, environment) => {
      const start = firstWeek(anchor, environment);
      return plainDateInterval(start.subtract({ weeks }), start.add({ weeks: 2 * weeks }));
    },
    getRange: (anchor, environment) => {
      const start = firstWeek(anchor, environment);
      return plainDateInterval(start, start.add({ weeks }));
    },
    getSpatialNavigation: (input) => {
      const { projection, range } = input;
      // Only the visible weeks take part, so focus enters and leaves where the view shows it.
      const visible = projection.weeks.filter((week) =>
        plainDateIntervalContains(range, week.range.start),
      );
      return monthSpatialNavigation({ ...input, projection: { ...projection, weeks: visible } });
    },
    getTitle: (range, environment) =>
      new Intl.DateTimeFormat(environment.locale, { month: "long", year: "numeric" }).format(
        scrollingMonthOf(range),
      ),
    navigate: (anchor, delta) => anchor.with({ day: 1 }).add({ months: delta }),
    project: (input) =>
      projectMonthWeeks(input, input.loadRange ?? input.range, scrollingMonthOf(input.range)),
  };
  return Object.freeze(strategy);
}
