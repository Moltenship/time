import {
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
  type InstantInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEventInterval } from "../events";
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

export interface BusyResourcesQuery<TEventId extends EventId, TResourceId extends ResourceId> {
  /** An event that doesn't count, such as the one being moved, so it never conflicts with itself. */
  readonly exclude?: TEventId;
  /** The resources to ask about; without them, every resource. */
  readonly resourceIds?: readonly TResourceId[];
  /** The wall clock all-day and floating events are on, as the views show them. */
  readonly timeZone: string;
}

interface Span<TEvent> {
  readonly end: Temporal.Instant;
  readonly event: TEvent;
  readonly start: Temporal.Instant;
}

/** How far ahead a busy status looks. */
const HORIZON = { hours: 31 * 24 } as const;

/**
 * Whether an event makes its resources busy: the adapter's `isBusy`, or by default every timed
 * and floating event and no all-day one, as a calendar's "show as" does.
 */
export function isBusyEvent(event: {
  readonly isBusy?: boolean | undefined;
  readonly kind: CalendarEventInterval["kind"];
}): boolean {
  return event.isBusy ?? event.kind !== "all-day";
}

const before = (left: Temporal.Instant, right: Temporal.Instant) =>
  Temporal.Instant.compare(left, right) < 0;

/** A placement or interval as instants, with all-day and floating ones read in `timeZone`. */
function instantsOf(
  interval: InstantInterval | CalendarEventInterval,
  timeZone: string,
): InstantInterval {
  if (!("kind" in interval) || interval.kind === "timed") {
    return instantInterval(interval.start, interval.end);
  }
  return instantInterval(
    interval.start.toZonedDateTime(timeZone).toInstant(),
    interval.end.toZonedDateTime(timeZone).toInstant(),
  );
}

/**
 * The busy events overlapping `range`, half-open, by start: one query of each of the snapshot's
 * interval indexes, narrowed to `resourceIds`, whatever their number.
 */
function busySpans<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  range: InstantInterval,
  timeZone: string,
  resourceIds?: readonly TResourceId[],
  exclude?: TEventId,
): Span<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>[] {
  const options = resourceIds === undefined ? undefined : { resourceIds };
  const wall = (instant: Temporal.Instant) => instant.toZonedDateTimeISO(timeZone);
  const { end, start } = range;
  return [
    ...events.queryTimed(range, options),
    ...events.queryFloating(
      plainDateTimeInterval(wall(start).toPlainDateTime(), wall(end).toPlainDateTime()),
      options,
    ),
    ...events.queryAllDay(
      plainDateInterval(wall(start).toPlainDate(), wall(end).toPlainDate().add({ days: 1 })),
      options,
    ),
  ]
    .filter((event) => isBusyEvent(event) && event.id !== exclude)
    .map((event) => ({ ...instantsOf(event, timeZone), event }))
    .filter((span) => before(span.start, end) && before(start, span.end))
    .sort((left, right) => Temporal.Instant.compare(left.start, right.start));
}

/**
 * Whether busy events occupy `at`, as `BusyStatus`: timed events by their instants, floating
 * ones by their wall times and all-day ones by their dates, both in `timeZone`. Which events are
 * busy is `isBusyEvent`'s call. Being busy is separate from working hours: see `availabilityAt`.
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
  const spans = busySpans(
    events,
    instantInterval(at, horizon),
    timeZone,
    resourceId === undefined ? undefined : [resourceId],
  );

  const current = spans.filter(({ start }) => !before(at, start));
  if (current.length === 0) {
    const nextEventAt = spans[0]?.start ?? null;
    return { changesAt: nextEventAt, status: Object.freeze({ busy: false, nextEventAt }) };
  }
  let freeAt = at;
  let changesAt: Temporal.Instant | null = null;
  for (const { end, start } of spans) {
    if (before(freeAt, start)) break;
    if (before(freeAt, end)) freeAt = end;
    // The events in progress change when one ends or another starts.
    const change = before(at, start) ? start : end;
    if (changesAt === null || before(change, changesAt)) changesAt = change;
  }
  return {
    changesAt,
    status: Object.freeze({
      busy: true,
      events: Object.freeze(current.map(({ event }) => event)),
      // Past the horizon, events not queried could still follow on.
      freeAt: before(freeAt, horizon) ? freeAt : null,
    }),
  };
}

/**
 * The resources busy during `range`, such as a meeting being placed, with the events that make
 * them busy, by start; free resources are absent. One query of each of the snapshot's interval
 * indexes, bucketed by each event's resources, so a busy person never marks the others. Ranges
 * are half-open instants, so back-to-back events don't conflict; `range` can be a placement,
 * read as `busyAt` reads events. Which events are busy is `isBusyEvent`'s call.
 */
export function busyResources<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  range: InstantInterval | CalendarEventInterval,
  { exclude, resourceIds, timeZone }: BusyResourcesQuery<TEventId, TResourceId>,
): ReadonlyMap<TResourceId, readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[]> {
  type Booking = NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  const interval = instantsOf(range, timeZone);
  const busy = new Map<TResourceId, Booking[]>();
  if (!before(interval.start, interval.end)) return busy;
  const asked = resourceIds === undefined ? undefined : new Set<ResourceId>(resourceIds);
  for (const { event } of busySpans(events, interval, timeZone, resourceIds, exclude)) {
    for (const resourceId of event.resourceIds) {
      if (asked !== undefined && !asked.has(resourceId)) continue;
      const list = busy.get(resourceId);
      if (list === undefined) busy.set(resourceId, [event]);
      else list.push(event);
    }
  }
  return busy;
}
