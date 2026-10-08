import {
  iteratePlainDates,
  monthGrid,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironment } from "../../environment";
import type { EventId, ResourceId } from "../../ids";
import { layoutDayGridRow, type DayGridRow } from "../../layout/day-grid";
import { splitEventsByDay } from "../../projection/day-fragments";
import { todayIn } from "../../projection/today";
import { queryVisibleEvents } from "../../projection/visible-events";
import type { EventSnapshot } from "../../snapshots/types";

export interface MonthProjectionInput<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly anchor: Temporal.PlainDate;
  readonly environment: CalendarEnvironment;
  readonly snapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
}

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

function monthGridFor(anchor: Temporal.PlainDate, environment: CalendarEnvironment) {
  return monthGrid(anchor, { weekStartsOn: environment.weekRules.firstDay });
}

/** Whole weeks covering the anchor's month; four to six rows depending on the month. */
export function getMonthRange(
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironment,
): PlainDateInterval {
  return monthGridFor(anchor, environment).range;
}

export function navigateMonth(anchor: Temporal.PlainDate, delta: number): Temporal.PlainDate {
  return anchor.add({ months: delta });
}

export function getMonthTitle(range: PlainDateInterval, environment: CalendarEnvironment): string {
  // The month's first day always falls in the grid's first week.
  const month = range.start.add({ days: 6 }).with({ day: 1 });
  return new Intl.DateTimeFormat(environment.locale, { month: "long", year: "numeric" }).format(
    month,
  );
}

/**
 * Projects the month grid around `anchor`. Each week packs all of its events into lanes: spans
 * (all-day and multi-day) come first, single-day timed events fill the remaining lanes by start
 * time. Apply `limitDayGridLanes` per week once the available cell height is known.
 */
export function projectMonth<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  input: MonthProjectionInput<TEvent, TEventId, TResourceId>,
): MonthProjection<TEvent, TEventId, TResourceId> {
  const { anchor, environment, snapshot } = input;
  const grid = monthGridFor(anchor, environment);
  const today = todayIn(environment);
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, grid.range, environment.timeZone),
    grid.range,
    environment.timeZone,
  );

  const weeks = grid.weeks.map((week) => {
    const days = Array.from(iteratePlainDates(week), (date) =>
      Object.freeze({
        date,
        inMonth: date.year === grid.month.year && date.month === grid.month.month,
        isToday: today !== undefined && date.equals(today),
      }),
    );
    return Object.freeze({ ...layoutDayGridRow(week, fragments), days: Object.freeze(days) });
  });

  return Object.freeze({ range: grid.range, weeks: Object.freeze(weeks) });
}
