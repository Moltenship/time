import {
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
   * Display wall time where the fragment ends: the next midnight when the event continues.
   * Inside a repeated (fold) hour it can precede `start`; `event` keeps the absolute interval.
   */
  readonly end: Temporal.PlainDateTime;
  readonly endsAfterDay: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  /** Display wall time where the fragment starts: midnight when the event began earlier. */
  readonly start: Temporal.PlainDateTime;
  readonly startsBeforeDay: boolean;
}

interface LocalEventSpan {
  readonly end: Temporal.PlainDateTime;
  readonly firstDate: Temporal.PlainDate;
  readonly lastDate: Temporal.PlainDate;
  readonly start: Temporal.PlainDateTime;
}

/** Wall-clock extent of an event in `timeZone`, with the first and last local dates it touches. */
export function localEventSpan(
  event: NormalizedCalendarEvent<unknown, EventId, ResourceId>,
  timeZone: string,
): LocalEventSpan {
  if (event.kind === "all-day") {
    return {
      end: event.end.toPlainDateTime(),
      firstDate: event.start,
      lastDate: event.end.subtract({ days: 1 }),
      start: event.start.toPlainDateTime(),
    };
  }
  if (event.kind === "floating") {
    return {
      end: event.end,
      firstDate: event.start.toPlainDate(),
      lastDate: event.end.subtract({ nanoseconds: 1 }).toPlainDate(),
      start: event.start,
    };
  }

  const start = event.start.toZonedDateTimeISO(timeZone).toPlainDateTime();
  return {
    end: event.end.toZonedDateTimeISO(timeZone).toPlainDateTime(),
    firstDate: start.toPlainDate(),
    // The end is exclusive, so the last touched date is the one holding its final nanosecond.
    lastDate: event.end.subtract({ nanoseconds: 1 }).toZonedDateTimeISO(timeZone).toPlainDate(),
    start,
  };
}

/**
 * Splits events into one fragment per local date inside `range`. Timed events are projected into
 * `timeZone`, floating events keep their wall time, and all-day events cover their dates with an
 * exclusive end. Fragments are ordered by event, then date.
 */
export function splitEventsByDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[],
  range: PlainDateInterval,
  timeZone: string,
): readonly EventDayFragment<TEvent, TEventId, TResourceId>[] {
  const lastVisibleDate = range.end.subtract({ days: 1 });
  const fragments: EventDayFragment<TEvent, TEventId, TResourceId>[] = [];

  for (const event of events) {
    const span = localEventSpan(event, timeZone);
    const lastDate =
      comparePlainDates(span.lastDate, lastVisibleDate) < 0 ? span.lastDate : lastVisibleDate;
    let date = comparePlainDates(span.firstDate, range.start) > 0 ? span.firstDate : range.start;

    while (comparePlainDates(date, lastDate) <= 0) {
      const nextDate = date.add({ days: 1 });
      const nextMidnight = nextDate.toPlainDateTime();
      const startsBeforeDay = comparePlainDates(date, span.firstDate) > 0;
      const endsAfterDay = comparePlainDates(date, span.lastDate) < 0;
      fragments.push(
        Object.freeze({
          date,
          end:
            endsAfterDay || comparePlainDateTimes(span.end, nextMidnight) > 0
              ? nextMidnight
              : span.end,
          endsAfterDay,
          event,
          start: startsBeforeDay ? date.toPlainDateTime() : span.start,
          startsBeforeDay,
        }),
      );
      date = nextDate;
    }
  }

  return Object.freeze(fragments);
}

function compareEventIds(left: EventId, right: EventId): number {
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
