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

const MAXIMUM_WEEKS = 12;

function assertWeekCount(weeks: number): void {
  if (!Number.isSafeInteger(weeks) || weeks < 1 || weeks > MAXIMUM_WEEKS) {
    throw new RangeError("invalid-scrolling-month-week-count");
  }
}

/** The row the anchor's week sits in, counted from the top: the third of six. */
function focusRow(weeks: number): number {
  return Math.floor((weeks - 1) / 2);
}

/**
 * The first day of the month a scrolling month is on: the month that holds most of its focus
 * week, the row the anchor's week sits in.
 */
export function scrollingMonthOf(range: PlainDateInterval, weeks: number): Temporal.PlainDate {
  return monthFrom(range.start, weeks);
}

/**
 * The anchor that puts `firstWeek` at the top of a scrolling month of `weeks` rows, as a view
 * moves the calendar after the user scrolls.
 */
export function scrollingMonthAnchor(
  firstWeek: Temporal.PlainDate,
  weeks: number,
): Temporal.PlainDate {
  return firstWeek.add({ weeks: focusRow(weeks) });
}

/** The month of the focus week's middle day, below the first visible week. */
function monthFrom(firstWeek: Temporal.PlainDate, weeks: number): Temporal.PlainDate {
  return firstWeek.add({ days: 3, weeks: focusRow(weeks) }).with({ day: 1 });
}

function firstWeek(
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironmentBase,
  weeks: number,
): Temporal.PlainDate {
  const { start } = weekRange(anchor, { weekStartsOn: environment.weekRules.firstDay });
  return start.subtract({ weeks: focusRow(weeks) });
}

/**
 * A month that scrolls through weeks instead of paging: `weeks` rows with the anchor's week as
 * the focus row (the third of six), which names the month. A page of weeks above and below is
 * projected too (`getLoadRange`), so a swipe shows their events at once. Previous and Next go to
 * the middle of the neighbouring month, so the whole of it shows; the days of the named month are
 * `inMonth`. Keyboard navigation moves through the visible weeks as in a month grid.
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
      const start = firstWeek(anchor, environment, weeks);
      return plainDateInterval(start.subtract({ weeks }), start.add({ weeks: 2 * weeks }));
    },
    getRange: (anchor, environment) => {
      const start = firstWeek(anchor, environment, weeks);
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
        scrollingMonthOf(range, weeks),
      ),
    navigate: (anchor, delta, _options, environment) => {
      // The month the anchor's week mostly falls in; the anchor's own without week rules.
      const month =
        environment === undefined
          ? anchor.with({ day: 1 })
          : monthFrom(firstWeek(anchor, environment, weeks), weeks);
      return month.with({ day: 15 }).add({ months: delta });
    },
    project: (input) =>
      projectMonthWeeks(input, input.loadRange, scrollingMonthOf(input.range, weeks)),
  };
  return Object.freeze(strategy);
}
