import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { NormalizedCalendarEvent } from "../snapshots/types";

/** The part of one event that falls on one local date of the display time zone. */
export interface EventDayFragment<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly date: Temporal.PlainDate;
  /**
   * Display wall time where the event leaves this date: the next midnight when it continues.
   * Inside a repeated (fold) hour it can precede `start`; `event` keeps the absolute interval.
   */
  readonly end: Temporal.PlainDateTime;
  /** The event also touches a later local date. */
  readonly endsAfterDay: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  /** Display wall time where the event enters this date: midnight when it continues. */
  readonly start: Temporal.PlainDateTime;
  /** The event also touches an earlier local date. */
  readonly startsBeforeDay: boolean;
}

/** A stretch of wall time with a single UTC offset. */
interface WallRun {
  readonly end: Temporal.PlainDateTime;
  readonly start: Temporal.PlainDateTime;
}

/** Consecutive local dates, both ends included. */
export interface LocalDateRange {
  readonly first: Temporal.PlainDate;
  readonly last: Temporal.PlainDate;
}

interface DayPortion {
  readonly date: Temporal.PlainDate;
  end: Temporal.PlainDateTime;
  readonly start: Temporal.PlainDateTime;
}

function earlierDate(left: Temporal.PlainDate, right: Temporal.PlainDate): Temporal.PlainDate {
  return comparePlainDates(left, right) <= 0 ? left : right;
}

function laterDate(left: Temporal.PlainDate, right: Temporal.PlainDate): Temporal.PlainDate {
  return comparePlainDates(left, right) >= 0 ? left : right;
}

/**
 * Wall-time runs of an event in `timeZone`. All-day and floating events are one nominal run. A
 * timed event gets one run per UTC offset, so a skipped date or a jump back across midnight
 * changes the local dates it touches.
 */
function wallRuns(
  event: NormalizedCalendarEvent<unknown, EventId, ResourceId>,
  timeZone: string,
): readonly WallRun[] {
  if (event.kind === "all-day") {
    return [{ end: event.end.toPlainDateTime(), start: event.start.toPlainDateTime() }];
  }
  if (event.kind === "floating") return [{ end: event.end, start: event.start }];

  const runs: WallRun[] = [];
  let cursor = event.start.toZonedDateTimeISO(timeZone);
  for (;;) {
    const start = cursor.toPlainDateTime();
    const transition = cursor.getTimeZoneTransition("next");
    if (transition === null || compareInstants(transition.toInstant(), event.end) >= 0) {
      runs.push({ end: start.add(cursor.toInstant().until(event.end)), start });
      return runs;
    }
    runs.push({ end: start.add(cursor.toInstant().until(transition.toInstant())), start });
    cursor = transition;
  }
}

function runDates(run: WallRun): LocalDateRange {
  // The end is exclusive, so the last touched date is the one holding the final nanosecond.
  return {
    first: run.start.toPlainDate(),
    last: run.end.subtract({ nanoseconds: 1 }).toPlainDate(),
  };
}

/** The local dates an event touches in `timeZone`, as sorted, disjoint inclusive ranges. */
export function eventDateRanges(
  event: NormalizedCalendarEvent<unknown, EventId, ResourceId>,
  timeZone: string,
): readonly LocalDateRange[] {
  const ranges = wallRuns(event, timeZone)
    .map(runDates)
    .sort((left, right) => comparePlainDates(left.first, right.first));
  const merged: LocalDateRange[] = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (
      previous !== undefined &&
      comparePlainDates(range.first, previous.last.add({ days: 1 })) <= 0
    ) {
      merged[merged.length - 1] = {
        first: previous.first,
        last: laterDate(previous.last, range.last),
      };
    } else {
      merged.push(range);
    }
  }
  return merged;
}

/**
 * Splits events into one fragment per local date inside `range`. Timed events are projected into
 * `timeZone` (dates the zone skipped get no fragment), floating events keep their wall time, and
 * all-day events cover their dates with an exclusive end. Fragments are ordered by event, then
 * date.
 */
export function splitEventsByDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[],
  range: PlainDateInterval,
  timeZone: string,
): readonly EventDayFragment<TEvent, TEventId, TResourceId>[] {
  const lastVisibleDate = range.end.subtract({ days: 1 });
  const fragments: EventDayFragment<TEvent, TEventId, TResourceId>[] = [];

  for (const event of events) {
    // Indexed by days since `range.start`; runs arrive in time order, which is not always date order.
    const portions: (DayPortion | undefined)[] = [];
    let firstDate: Temporal.PlainDate | undefined;
    let lastDate: Temporal.PlainDate | undefined;

    for (const run of wallRuns(event, timeZone)) {
      const dates = runDates(run);
      firstDate = firstDate === undefined ? dates.first : earlierDate(firstDate, dates.first);
      lastDate = lastDate === undefined ? dates.last : laterDate(lastDate, dates.last);

      const lastRunDate = earlierDate(dates.last, lastVisibleDate);
      let date = laterDate(dates.first, range.start);
      for (
        let index = range.start.until(date).days;
        comparePlainDates(date, lastRunDate) <= 0;
        index += 1
      ) {
        const nextDate = date.add({ days: 1 });
        const midnight = date.toPlainDateTime();
        const nextMidnight = nextDate.toPlainDateTime();
        const end = comparePlainDateTimes(run.end, nextMidnight) < 0 ? run.end : nextMidnight;
        const portion = portions[index];
        if (portion === undefined) {
          const start = comparePlainDateTimes(run.start, midnight) > 0 ? run.start : midnight;
          portions[index] = { date, end, start };
        } else {
          portion.end = end;
        }
        date = nextDate;
      }
    }

    for (const portion of portions) {
      if (portion === undefined) continue;
      fragments.push(
        Object.freeze({
          date: portion.date,
          end: portion.end,
          endsAfterDay: comparePlainDates(portion.date, lastDate!) < 0,
          event,
          start: portion.start,
          startsBeforeDay: comparePlainDates(portion.date, firstDate!) > 0,
        }),
      );
    }
  }

  return Object.freeze(fragments);
}

/** Numbers before strings, each in natural order, so `1` and `"1"` sort apart. */
export function compareEventIds(left: EventId, right: EventId): number {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left === "number") return -1;
  if (typeof right === "number") return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Display order within one day: all-day first, then earlier start, longer fragment, and id. */
export function compareDayFragments(
  left: EventDayFragment<unknown, EventId, ResourceId>,
  right: EventDayFragment<unknown, EventId, ResourceId>,
): number {
  return (
    Number(right.event.kind === "all-day") - Number(left.event.kind === "all-day") ||
    comparePlainDateTimes(left.start, right.start) ||
    comparePlainDateTimes(right.end, left.end) ||
    compareEventIds(left.event.id, right.event.id)
  );
}
