import {
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
} from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot, NormalizedCalendarEvent } from "../snapshots/types";

/**
 * Whether events occupy an instant, and when that changes: the events in progress and when the
 * last of a run of overlapping or back-to-back ones ends, or the next event's start. Either is
 * `null` past a month ahead.
 */
export type BusyStatus<TEvent> =
  | {
      readonly busy: true;
      /** The events in progress, by start. */
      readonly events: readonly TEvent[];
      readonly freeAt: Temporal.Instant | null;
    }
  | { readonly busy: false; readonly nextEventAt: Temporal.Instant | null };

export interface BusyQuery<TResourceId extends ResourceId> {
  /** Only events with this resource; without it, every event. */
  readonly resourceId?: TResourceId;
  /** The wall clock all-day and floating events are on, as the views show them. */
  readonly timeZone: string;
}

/** How far ahead a busy status looks. */
const HORIZON = { hours: 31 * 24 } as const;

/**
 * Whether events occupy `at`, as `BusyStatus`. Timed events count by their instants, floating
 * ones by their wall times and all-day ones by their dates, both in `timeZone`. Being busy is
 * separate from working hours: see `availabilityAt` for those.
 */
export function busyAt<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  at: Temporal.Instant,
  query: BusyQuery<TResourceId>,
): BusyStatus<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>> {
  return occupancy(events, at, query).status;
}

/** `busyAt`, with the first instant it can change at: an event's start or end. */
export function occupancy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  at: Temporal.Instant,
  { resourceId, timeZone }: BusyQuery<TResourceId>,
): {
  readonly changesAt: Temporal.Instant | null;
  readonly status: BusyStatus<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
} {
  const horizon = at.add(HORIZON);
  const options = resourceId === undefined ? undefined : { resourceIds: [resourceId] };
  const wall = (instant: Temporal.Instant) => instant.toZonedDateTimeISO(timeZone);
  const instant = (point: Temporal.PlainDate | Temporal.PlainDateTime) =>
    point.toZonedDateTime(timeZone).toInstant();
  const spans = [
    ...events.queryTimed(instantInterval(at, horizon), options),
    ...events.queryFloating(
      plainDateTimeInterval(wall(at).toPlainDateTime(), wall(horizon).toPlainDateTime()),
      options,
    ),
    ...events.queryAllDay(
      plainDateInterval(wall(at).toPlainDate(), wall(horizon).toPlainDate().add({ days: 1 })),
      options,
    ),
  ]
    .map((event) =>
      event.kind === "timed"
        ? { end: event.end, event, start: event.start }
        : { end: instant(event.end), event, start: instant(event.start) },
    )
    .filter(({ end }) => Temporal.Instant.compare(end, at) > 0)
    .sort((left, right) => Temporal.Instant.compare(left.start, right.start));

  const current = spans.filter(({ start }) => Temporal.Instant.compare(start, at) <= 0);
  if (current.length === 0) {
    const nextEventAt = spans[0]?.start ?? null;
    return { changesAt: nextEventAt, status: Object.freeze({ busy: false, nextEventAt }) };
  }
  let free = at;
  let changesAt: Temporal.Instant | null = null;
  for (const { end, start } of spans) {
    if (Temporal.Instant.compare(start, free) > 0) break;
    if (Temporal.Instant.compare(end, free) > 0) free = end;
    // The events in progress change when one ends or another starts.
    const change = Temporal.Instant.compare(start, at) > 0 ? start : end;
    if (changesAt === null || Temporal.Instant.compare(change, changesAt) < 0) changesAt = change;
  }
  return {
    changesAt,
    status: Object.freeze({
      busy: true,
      events: Object.freeze(current.map(({ event }) => event)),
      // Past the horizon, events not queried could still follow on.
      freeAt: Temporal.Instant.compare(free, horizon) < 0 ? free : null,
    }),
  };
}
