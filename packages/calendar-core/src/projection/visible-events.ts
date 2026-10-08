import {
  compareInstants,
  instantInterval,
  plainDateTimeInterval,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot, NormalizedCalendarEvent } from "../snapshots/types";

/**
 * Returns the instants covered by a half-open date range in `timeZone`. Each boundary is the
 * start of its local day, so a skipped midnight resolves to the first instant that exists.
 * Returns `null` when the zone skipped every date in the range (Pacific/Apia, 2011-12-30).
 */
export function visibleInstantRange(
  range: PlainDateInterval,
  timeZone: string,
): InstantInterval | null {
  const start = range.start.toZonedDateTime(timeZone).toInstant();
  const end = range.end.toZonedDateTime(timeZone).toInstant();
  return compareInstants(start, end) < 0 ? instantInterval(start, end) : null;
}

/**
 * Queries every event kind that intersects a date range: all-day events by date, timed events
 * by the range's instants in `timeZone`, and floating events by wall time.
 */
export function queryVisibleEvents<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  snapshot: EventSnapshot<TEvent, TEventId, TResourceId>,
  range: PlainDateInterval,
  timeZone: string,
): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
  const instants = visibleInstantRange(range, timeZone);
  const wallTimes = plainDateTimeInterval(
    range.start.toPlainDateTime(),
    range.end.toPlainDateTime(),
  );

  return [
    ...snapshot.queryAllDay(range),
    ...(instants === null ? [] : snapshot.queryTimed(instants)),
    ...snapshot.queryFloating(wallTimes),
  ];
}
