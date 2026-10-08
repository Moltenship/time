import {
  comparePlainDates,
  plainDateInterval,
  weekRange,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEnvironment } from "../../environment";
import type { EventId, ResourceId } from "../../ids";
import {
  compareDayFragments,
  eventDateRanges,
  splitEventsByDay,
  type EventDayFragment,
} from "../../projection/day-fragments";
import { todayIn } from "../../projection/today";
import { queryVisibleEvents } from "../../projection/visible-events";
import type { EventSnapshot } from "../../snapshots/types";

const DEFAULT_LIST_WEEKS = 4;

export interface ListViewOptions {
  /** Number of whole weeks shown, starting with the anchor's week. Defaults to 4. */
  readonly weeks?: number;
}

export interface ListProjectionInput<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly anchor: Temporal.PlainDate;
  readonly environment: CalendarEnvironment;
  readonly snapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
}

export interface ListItem<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> extends EventDayFragment<TEvent, TEventId, TResourceId> {
  /** Number of local dates the event touches; greater than 1 for multi-day events. */
  readonly dayCount: number;
  /** One-based position of `date` among those dates ("day k of n"). */
  readonly dayIndex: number;
}

export interface ListDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly date: Temporal.PlainDate;
  readonly isToday: boolean;
  readonly items: readonly ListItem<TEvent, TEventId, TResourceId>[];
}

export interface ListProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** Only dates with at least one event, in date order. */
  readonly days: readonly ListDay<TEvent, TEventId, TResourceId>[];
  readonly range: PlainDateInterval;
}

function listWeeks(options: ListViewOptions): number {
  const weeks = options.weeks ?? DEFAULT_LIST_WEEKS;
  if (!Number.isSafeInteger(weeks) || weeks < 1) {
    throw new RangeError("invalid-list-weeks");
  }
  return weeks;
}

export function getListRange(
  anchor: Temporal.PlainDate,
  environment: CalendarEnvironment,
  options: ListViewOptions = {},
): PlainDateInterval {
  const start = weekRange(anchor, { weekStartsOn: environment.weekRules.firstDay }).start;
  return plainDateInterval(start, start.add({ weeks: listWeeks(options) }));
}

export function navigateList(
  anchor: Temporal.PlainDate,
  delta: number,
  options: ListViewOptions = {},
): Temporal.PlainDate {
  return anchor.add({ weeks: delta * listWeeks(options) });
}

export function getListTitle(range: PlainDateInterval, environment: CalendarEnvironment): string {
  return new Intl.DateTimeFormat(environment.locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(range.start, range.end.subtract({ days: 1 }));
}

function toListItem<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  fragment: EventDayFragment<TEvent, TEventId, TResourceId>,
  timeZone: string,
): ListItem<TEvent, TEventId, TResourceId> {
  if (!fragment.startsBeforeDay && !fragment.endsAfterDay) {
    return Object.freeze({ ...fragment, dayCount: 1, dayIndex: 1 });
  }
  let dayCount = 0;
  let dayIndex = 0;
  for (const { first, last } of eventDateRanges(fragment.event, timeZone)) {
    if (
      comparePlainDates(first, fragment.date) <= 0 &&
      comparePlainDates(fragment.date, last) <= 0
    ) {
      dayIndex = dayCount + first.until(fragment.date).days + 1;
    }
    dayCount += first.until(last).days + 1;
  }
  return Object.freeze({ ...fragment, dayCount, dayIndex });
}

/**
 * Projects an agenda: the dates in range that have events, each listing its fragments with
 * all-day events first, then by start time.
 */
export function projectList<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  input: ListProjectionInput<TEvent, TEventId, TResourceId>,
  options: ListViewOptions = {},
): ListProjection<TEvent, TEventId, TResourceId> {
  const { anchor, environment, snapshot } = input;
  const { timeZone } = environment;
  const range = getListRange(anchor, environment, options);
  const today = todayIn(environment);
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, range, timeZone),
    range,
    timeZone,
  );

  const byDate = new Map<string, EventDayFragment<TEvent, TEventId, TResourceId>[]>();
  for (const fragment of fragments) {
    const key = fragment.date.toString();
    const dayFragments = byDate.get(key);
    if (dayFragments === undefined) byDate.set(key, [fragment]);
    else dayFragments.push(fragment);
  }

  const days = [...byDate.values()]
    .map((dayFragments) => {
      const date = dayFragments[0]!.date;
      const items = dayFragments
        .sort(compareDayFragments)
        .map((fragment) => toListItem(fragment, timeZone));
      return Object.freeze({
        date,
        isToday: today !== undefined && date.equals(today),
        items: Object.freeze(items),
      });
    })
    .sort((left, right) => comparePlainDates(left.date, right.date));

  return Object.freeze({ days: Object.freeze(days), range });
}
