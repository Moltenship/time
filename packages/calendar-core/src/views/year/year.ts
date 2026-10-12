import {
  comparePlainDates,
  monthGrid,
  plainDateInterval,
  plainDateIntervalContains,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "../../environment";
import type { EventId, ResourceId } from "../../ids";
import {
  fragmentsByDate,
  splitEventsByDay,
  type EventDayFragment,
} from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import type { CalendarViewProjectionInput } from "../../views";

export interface YearDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly date: Temporal.PlainDate;
  /** The parts of events that fall on the date: all-day events first, then by start time. */
  readonly fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[];
  readonly isToday: boolean;
}

/** One week row of a month. */
export interface YearWeek<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /**
   * Seven cells from the week's first day: the month's dates, and `null` where the week reaches
   * into the month before or after, so each date shows once in the year.
   */
  readonly days: readonly (YearDay<TEvent, TEventId, TResourceId> | null)[];
  /** The whole week, which can start in the month before or end in the month after. */
  readonly range: PlainDateInterval;
}

export interface YearMonth<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** The month's dates, from its first day. */
  readonly range: PlainDateInterval;
  /** Four to six week rows. */
  readonly weeks: readonly YearWeek<TEvent, TEventId, TResourceId>[];
}

export interface YearProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** January to December, for a range from `getYearRange`. */
  readonly months: readonly YearMonth<TEvent, TEventId, TResourceId>[];
  readonly range: PlainDateInterval;
}

const noFragments: readonly EventDayFragment<never, EventId, ResourceId>[] = Object.freeze([]);

/** The anchor's calendar year, from January 1 to the next January 1. */
export function getYearRange(anchor: Temporal.PlainDate): PlainDateInterval {
  const start = anchor.with({ day: 1, month: 1 });
  return plainDateInterval(start, start.add({ years: 1 }));
}

export function navigateYear(anchor: Temporal.PlainDate, delta: number): Temporal.PlainDate {
  return anchor.add({ years: delta });
}

export function getYearTitle(
  range: PlainDateInterval,
  environment: CalendarEnvironmentBase,
): string {
  return new Intl.DateTimeFormat(environment.locale, { year: "numeric" }).format(range.start);
}

/**
 * Projects a year range from `getYearRange` into month grids whose weeks start on
 * `weekRules.firstDay`. Each day of the range lists the event fragments on it, for a count, dots
 * in event colours, or a list of the day's events. Dates outside the range are `null`.
 */
export function projectYear<TEvent>(
  input: CalendarViewProjectionInput<unknown, TEvent>,
): YearProjection<TEvent, EventId, ResourceId> {
  const { environment, range, snapshot, today } = input;
  const { timeZone } = environment;
  const byDate = fragmentsByDate(
    splitEventsByDay(queryVisibleEvents(snapshot, range, timeZone), range, timeZone),
  );

  const months: YearMonth<TEvent, EventId, ResourceId>[] = [];
  for (let first = range.start.with({ day: 1 }); comparePlainDates(first, range.end) < 0;) {
    const grid = monthGrid(first, { weekStartsOn: environment.weekRules.firstDay });
    const month = plainDateInterval(first, first.add({ months: 1 }));
    const weeks = grid.weeks.map((week) => {
      const days = Array.from({ length: 7 }, (_, index) => {
        const date = week.start.add({ days: index });
        if (!plainDateIntervalContains(month, date) || !plainDateIntervalContains(range, date)) {
          return null;
        }
        return Object.freeze({
          date,
          fragments: Object.freeze(byDate.get(date.toString()) ?? noFragments),
          isToday: today?.equals(date) === true,
        });
      });
      return Object.freeze({ days: Object.freeze(days), range: week });
    });
    months.push(Object.freeze({ range: month, weeks: Object.freeze(weeks) }));
    first = month.end;
  }

  return Object.freeze({ months: Object.freeze(months), range });
}
