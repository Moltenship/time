import {
  comparePlainDates,
  iteratePlainDates,
  monthGrid,
  plainDateInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironmentBase } from "../../environment";
import type { EventId, ResourceId } from "../../ids";
import { layoutDayGridRow, type DayGridRow } from "../../layout/day-grid";
import { splitEventsByDay } from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import type { CalendarViewProjectionInput } from "../../views";

export interface MonthDay {
  readonly date: Temporal.PlainDate;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}

/** One week row: every event fragment of the week packed into lanes, plus per-day metadata. */
export interface MonthWeek<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> extends DayGridRow<TEvent, TEventId, TResourceId> {
  readonly days: readonly MonthDay[];
}

export interface MonthProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly range: PlainDateInterval;
  readonly weeks: readonly MonthWeek<TEvent, TEventId, TResourceId>[];
}

/** Whole weeks covering the anchor's month; four to six rows depending on the month. */
export function getMonthRange(
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironmentBase,
): PlainDateInterval {
  return monthGrid(anchor, { weekStartsOn: environment.weekRules.firstDay }).range;
}

export function navigateMonth(anchor: Temporal.PlainDate, delta: number): Temporal.PlainDate {
  return anchor.add({ months: delta });
}

/** The first day of the month a month range shows; it always falls in the range's first week. */
function monthOf(range: PlainDateInterval): Temporal.PlainDate {
  return range.start.add({ days: 6 }).with({ day: 1 });
}

export function getMonthTitle(
  range: PlainDateInterval,
  environment: CalendarEnvironmentBase,
): string {
  return new Intl.DateTimeFormat(environment.locale, { month: "long", year: "numeric" }).format(
    monthOf(range),
  );
}

/**
 * Projects a month range from `getMonthRange` into week rows. Each week packs all of its events
 * into lanes: spans (all-day and multi-day) take the top lanes, single-day timed events fill the
 * remaining lanes by start time. Apply `limitDayGridLanes` per week once the available cell
 * height is known.
 */
export function projectMonth<TEvent>(
  input: CalendarViewProjectionInput<unknown, TEvent>,
): MonthProjection<TEvent, EventId, ResourceId> {
  return projectMonthWeeks(input, input.range, monthOf(input.range));
}

/**
 * Week rows over `range`, which starts a week: each packs all of its events into lanes, and the
 * days of `month` are `inMonth`.
 */
export function projectMonthWeeks<TEvent>(
  {
    environment,
    snapshot,
    today,
  }: Pick<CalendarViewProjectionInput<unknown, TEvent>, "environment" | "snapshot" | "today">,
  range: PlainDateInterval,
  month: Temporal.PlainDate,
): MonthProjection<TEvent, EventId, ResourceId> {
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, range, environment.timeZone),
    range,
    environment.timeZone,
  );

  const weeks: MonthWeek<TEvent, EventId, ResourceId>[] = [];
  for (let start = range.start; comparePlainDates(start, range.end) < 0;) {
    const week = plainDateInterval(start, start.add({ weeks: 1 }));
    const days = Array.from(iteratePlainDates(week), (date) =>
      Object.freeze({
        date,
        inMonth: date.year === month.year && date.month === month.month,
        isToday: today?.equals(date) === true,
      }),
    );
    weeks.push(Object.freeze({ ...layoutDayGridRow(week, fragments), days: Object.freeze(days) }));
    start = week.end;
  }

  return Object.freeze({ range, weeks: Object.freeze(weeks) });
}
