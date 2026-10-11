import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
  type InstantInterval,
  type PlainDateInterval,
  type PlainDateTimeInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEventInterval } from "../events";
import type { EventId, ResourceId } from "../ids";
import { ReadonlyMapView } from "../internal/readonly-map";
import type {
  EventSnapshot,
  EventSnapshotIssue,
  EventSnapshotQueryOptions,
  NormalizedAllDayCalendarEvent,
  NormalizedCalendarEvent,
  NormalizedFloatingCalendarEvent,
  NormalizedTimedCalendarEvent,
} from "../snapshots/types";
import type { CalendarEventPlacement, CalendarPendingPlacements } from "./types";

function pendingEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  current: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>,
  placement: CalendarEventPlacement<TResourceId>,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> {
  const base = {
    event: current.event,
    id: current.id,
    inputIndex: current.inputIndex,
    isPending: true,
    ...(current.isBusy === undefined ? {} : { isBusy: current.isBusy }),
    isReadOnly: current.isReadOnly,
    resourceIds: placement.resourceIds,
    revision: current.revision,
    title: current.title,
  };

  return placement.kind === "timed"
    ? Object.freeze({
        ...base,
        end: placement.end,
        kind: placement.kind,
        sourceTimeZone: placement.sourceTimeZone,
        start: placement.start,
      })
    : placement.kind === "all-day"
      ? Object.freeze({ ...base, end: placement.end, kind: placement.kind, start: placement.start })
      : Object.freeze({
          ...base,
          end: placement.end,
          kind: placement.kind,
          start: placement.start,
        });
}

function intersects(
  event: CalendarEventInterval,
  kind: CalendarEventInterval["kind"],
  range: InstantInterval | PlainDateInterval | PlainDateTimeInterval,
): boolean {
  if (event.kind !== kind) return false;
  switch (event.kind) {
    case "timed": {
      const { end, start } = range as InstantInterval;
      return compareInstants(event.start, end) < 0 && compareInstants(event.end, start) > 0;
    }
    case "all-day": {
      const { end, start } = range as PlainDateInterval;
      return comparePlainDates(event.start, end) < 0 && comparePlainDates(event.end, start) > 0;
    }
    case "floating": {
      const { end, start } = range as PlainDateTimeInterval;
      return (
        comparePlainDateTimes(event.start, end) < 0 && comparePlainDateTimes(event.end, start) > 0
      );
    }
  }
}

/**
 * Pending changes layered over a base snapshot. Queries delegate to the base indexes and patch
 * only the affected events, so an overlay never rebuilds an index.
 */
class OverlayEventSnapshot<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> implements EventSnapshot<TEvent, TEventId, TResourceId> {
  readonly #base: EventSnapshot<TEvent, TEventId, TResourceId>;
  /** Patched events by ID; `null` hides a pending deletion. */
  readonly #patched: ReadonlyMap<
    TEventId,
    NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | null
  >;
  #byId: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>> | undefined;
  #events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] | undefined;
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];
  readonly size: number;
  readonly version: number;

  constructor(
    base: EventSnapshot<TEvent, TEventId, TResourceId>,
    patched: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | null>,
  ) {
    let deleted = 0;
    for (const event of patched.values()) if (event === null) deleted += 1;

    this.#base = base;
    this.#patched = patched;
    this.issues = base.issues;
    this.size = base.size - deleted;
    // Pending changes are not new application data, so the data version is unchanged.
    this.version = base.version;
    Object.freeze(this);
  }

  get byId(): ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>> {
    this.#byId ??= new ReadonlyMapView(new Map(this.events.map((event) => [event.id, event])));
    return this.#byId;
  }

  get events(): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    this.#events ??= Object.freeze(
      this.#base.events.flatMap((event) => {
        const patched = this.#patched.get(event.id);
        return patched === undefined ? [event] : patched === null ? [] : [patched];
      }),
    );
    return this.#events;
  }

  eventsForResource(
    resourceId: TResourceId,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#merge(this.#base.eventsForResource(resourceId), (event) =>
      event.resourceIds.includes(resourceId),
    );
  }

  get(eventId: TEventId): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined {
    const patched = this.#patched.get(eventId);
    return patched === undefined ? this.#base.get(eventId) : (patched ?? undefined);
  }

  getQueryCacheStatistics() {
    return this.#base.getQueryCacheStatistics();
  }

  queryAllDay(
    range: PlainDateInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "all-day",
      range,
      this.#base.queryAllDay(range, options),
      options,
    ) as readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  queryFloating(
    range: PlainDateTimeInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "floating",
      range,
      this.#base.queryFloating(range, options),
      options,
    ) as readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  queryTimed(
    range: InstantInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "timed",
      range,
      this.#base.queryTimed(range, options),
      options,
    ) as readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  #query(
    kind: CalendarEventInterval["kind"],
    range: InstantInterval | PlainDateInterval | PlainDateTimeInterval,
    baseResult: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[],
    options: EventSnapshotQueryOptions<TResourceId> | undefined,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    const resourceIds = options?.resourceIds;
    return this.#merge(
      baseResult,
      (event) =>
        intersects(event, kind, range) &&
        (resourceIds === undefined ||
          event.resourceIds.some((resourceId) => resourceIds.includes(resourceId))),
    );
  }

  /** Replaces patched events in a base result while preserving input order. */
  #merge(
    baseResult: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[],
    matches: (event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>) => boolean,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    const kept = baseResult.filter((event) => !this.#patched.has(event.id));
    const added: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] = [];
    for (const event of this.#patched.values()) {
      if (event !== null && matches(event)) added.push(event);
    }
    if (added.length === 0 && kept.length === baseResult.length) return baseResult;
    return Object.freeze(
      [...kept, ...added].sort((left, right) => left.inputIndex - right.inputIndex),
    );
  }
}

/**
 * Applies pending placements to a snapshot. Returns the snapshot itself when nothing is pending
 * for an event it contains.
 */
export function applyEventOverlay<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  snapshot: EventSnapshot<TEvent, TEventId, TResourceId>,
  pending: CalendarPendingPlacements<TEventId, TResourceId>,
): EventSnapshot<TEvent, TEventId, TResourceId> {
  const patched = new Map<
    TEventId,
    NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | null
  >();
  for (const [eventId, placement] of pending) {
    const current = snapshot.get(eventId);
    if (current !== undefined) {
      patched.set(eventId, placement === null ? null : pendingEvent(current, placement));
    }
  }
  return patched.size === 0 ? snapshot : new OverlayEventSnapshot(snapshot, patched);
}
