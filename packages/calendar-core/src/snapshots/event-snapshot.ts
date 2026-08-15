import {
  type InstantInterval,
  type PlainDateInterval,
  type PlainDateTimeInterval,
} from "@moltenship/calendar-temporal";

import { type CalendarEventInterval, type EventAdapter } from "../events.ts";
import type { EventId, ResourceId } from "../ids.ts";
import {
  createIntervalIndex,
  type IntervalIndex,
  type IntervalIndexEntry,
} from "../internal/interval-index.ts";
import { BoundedLruCache } from "../internal/lru-cache.ts";
import { ReadonlyMapView } from "../internal/readonly-map.ts";
import {
  instantIndexKey,
  plainDateIndexKey,
  plainDateTimeIndexKey,
} from "../internal/temporal-index-keys.ts";
import {
  InvalidCalendarEventSnapshotError,
  type EventSnapshot,
  type EventSnapshotCache,
  type EventSnapshotIssue,
  type EventSnapshotOptions,
  type EventSnapshotQueryOptions,
  type NormalizedAllDayCalendarEvent,
  type NormalizedCalendarEvent,
  type NormalizedFloatingCalendarEvent,
  type NormalizedTimedCalendarEvent,
} from "./types.ts";

const DEFAULT_QUERY_CACHE_SIZE = 128;

interface EventStructureBase<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly endKey: bigint;
  readonly id: TEventId;
  readonly isReadOnly: boolean;
  readonly resourceIds: readonly TResourceId[];
  readonly revision?: string | number;
  readonly startKey: bigint;
  readonly title: string;
}

type EventStructure<TEventId extends EventId, TResourceId extends ResourceId> = EventStructureBase<
  TEventId,
  TResourceId
> &
  CalendarEventInterval;

interface PreviousEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly event: TEvent;
  readonly structure: EventStructure<TEventId, TResourceId>;
}

interface IndexedEventData<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly allDay: IntervalIndex<TEventId>;
  readonly floating: IntervalIndex<TEventId>;
  readonly resources: ReadonlyMap<TResourceId, readonly TEventId[]>;
  readonly structures: readonly EventStructure<TEventId, TResourceId>[];
  readonly timed: IntervalIndex<TEventId>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRevision(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

function calendarEventIntervalKind(value: unknown): CalendarEventInterval["kind"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const kind = (value as { readonly kind?: unknown }).kind;
  return kind === "timed" || kind === "all-day" || kind === "floating" ? kind : undefined;
}

function materializeEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  event: TEvent,
  inputIndex: number,
  structure: EventStructure<TEventId, TResourceId>,
): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> {
  const base = {
    event,
    id: structure.id,
    inputIndex,
    isReadOnly: structure.isReadOnly,
    resourceIds: structure.resourceIds,
    revision: structure.revision,
    title: structure.title,
  };

  return structure.kind === "timed"
    ? Object.freeze({
        ...base,
        end: structure.end,
        kind: structure.kind,
        sourceTimeZone: structure.sourceTimeZone,
        start: structure.start,
      })
    : structure.kind === "all-day"
      ? Object.freeze({
          ...base,
          end: structure.end,
          kind: structure.kind,
          start: structure.start,
        })
      : Object.freeze({
          ...base,
          end: structure.end,
          kind: structure.kind,
          start: structure.start,
        });
}

function structuresMatch<TEventId extends EventId, TResourceId extends ResourceId>(
  left: readonly EventStructure<TEventId, TResourceId>[],
  right: readonly EventStructure<TEventId, TResourceId>[],
): boolean {
  return (
    left.length === right.length && left.every((structure, index) => structure === right[index])
  );
}

function buildIndexedData<TEventId extends EventId, TResourceId extends ResourceId>(
  structures: readonly EventStructure<TEventId, TResourceId>[],
): IndexedEventData<TEventId, TResourceId> {
  const timed: IntervalIndexEntry<TEventId>[] = [];
  const allDay: IntervalIndexEntry<TEventId>[] = [];
  const floating: IntervalIndexEntry<TEventId>[] = [];
  const resourceIds = new Map<TResourceId, TEventId[]>();

  structures.forEach((structure, order) => {
    const entry = {
      end: structure.endKey,
      order,
      start: structure.startKey,
      value: structure.id,
    };
    if (structure.kind === "timed") timed.push(entry);
    else if (structure.kind === "all-day") allDay.push(entry);
    else floating.push(entry);

    for (const resourceId of structure.resourceIds) {
      const ids = resourceIds.get(resourceId);
      if (ids === undefined) resourceIds.set(resourceId, [structure.id]);
      else ids.push(structure.id);
    }
  });

  const frozenResources = new Map<TResourceId, readonly TEventId[]>();
  for (const [resourceId, ids] of resourceIds) {
    frozenResources.set(resourceId, Object.freeze(ids));
  }

  return Object.freeze({
    allDay: createIntervalIndex(allDay),
    floating: createIntervalIndex(floating),
    resources: new ReadonlyMapView(frozenResources),
    structures: Object.freeze(structures),
    timed: createIntervalIndex(timed),
  });
}

function resourceIdKey(resourceId: ResourceId): string {
  return typeof resourceId === "number"
    ? `number:${Object.is(resourceId, -0) ? "0" : String(resourceId)}`
    : `string:${JSON.stringify(resourceId)}`;
}

function resourceFilter<TResourceId extends ResourceId>(
  options: EventSnapshotQueryOptions<TResourceId> | undefined,
): { readonly key: string; readonly values?: ReadonlySet<TResourceId> } {
  if (options?.resourceIds === undefined) return { key: "*" };

  const values = new Set(options.resourceIds);
  const key = JSON.stringify([...values].map(resourceIdKey).sort());
  return { key, values };
}

class ImmutableEventSnapshot<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> implements EventSnapshot<TEvent, TEventId, TResourceId> {
  readonly #indexed: IndexedEventData<TEventId, TResourceId>;
  readonly #queryCache: BoundedLruCache<
    readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[]
  >;
  readonly byId: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
  readonly events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];
  readonly version: number;

  constructor(
    version: number,
    events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[],
    issues: readonly EventSnapshotIssue<TEvent, TEventId>[],
    indexed: IndexedEventData<TEventId, TResourceId>,
    byId: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>,
    queryCacheSize: number,
  ) {
    this.#indexed = indexed;
    this.#queryCache = new BoundedLruCache(queryCacheSize);
    this.byId = new ReadonlyMapView(byId);
    this.events = events;
    this.issues = issues;
    this.version = version;
    Object.freeze(this);
  }

  get size(): number {
    return this.events.length;
  }

  eventsForResource(
    resourceId: TResourceId,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    const key = `resource:${resourceIdKey(resourceId)}`;
    const cached = this.#queryCache.get(key);
    if (cached !== undefined) return cached;

    const result = Object.freeze(
      (this.#indexed.resources.get(resourceId) ?? []).flatMap((eventId) => {
        const event = this.byId.get(eventId);
        return event === undefined ? [] : [event];
      }),
    );
    this.#queryCache.set(key, result);
    return result;
  }

  get(eventId: TEventId): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined {
    return this.byId.get(eventId);
  }

  getQueryCacheStatistics() {
    return this.#queryCache.statistics();
  }

  queryAllDay(
    range: PlainDateInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "all-day",
      this.#indexed.allDay,
      plainDateIndexKey(range.start),
      plainDateIndexKey(range.end),
      options,
    ) as readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  queryFloating(
    range: PlainDateTimeInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "floating",
      this.#indexed.floating,
      plainDateTimeIndexKey(range.start),
      plainDateTimeIndexKey(range.end),
      options,
    ) as readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  queryTimed(
    range: InstantInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    return this.#query(
      "timed",
      this.#indexed.timed,
      instantIndexKey(range.start),
      instantIndexKey(range.end),
      options,
    ) as readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[];
  }

  #query(
    kind: CalendarEventInterval["kind"],
    index: IntervalIndex<TEventId>,
    start: bigint,
    end: bigint,
    options: EventSnapshotQueryOptions<TResourceId> | undefined,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] {
    const resources = resourceFilter(options);
    const key = `${kind}:${start}:${end}:${resources.key}`;
    const cached = this.#queryCache.get(key);
    if (cached !== undefined) return cached;

    const result = Object.freeze(
      index.query(start, end).flatMap((eventId) => {
        const event = this.byId.get(eventId);
        if (
          event === undefined ||
          (resources.values !== undefined &&
            !event.resourceIds.some((resourceId) => resources.values?.has(resourceId)))
        ) {
          return [];
        }
        return [event];
      }),
    );
    this.#queryCache.set(key, result);
    return result;
  }
}

function normalizeEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  event: TEvent,
  index: number,
  adapter: EventAdapter<TEvent, TEventId, TResourceId>,
  previous: ReadonlyMap<TEventId, PreviousEvent<TEvent, TEventId, TResourceId>>,
  normalizedById: Pick<ReadonlyMap<TEventId, unknown>, "has">,
): EventSnapshotIssue<TEvent, TEventId> | EventStructure<TEventId, TResourceId> {
  let eventId: TEventId;
  try {
    eventId = adapter.getId(event);
  } catch (error) {
    return Object.freeze({
      accessor: "getId",
      code: "adapter-error",
      event,
      index,
      message: errorMessage(error),
    });
  }

  if (
    (typeof eventId === "string" && eventId.length === 0) ||
    (typeof eventId === "number" && !Number.isFinite(eventId)) ||
    (typeof eventId !== "string" && typeof eventId !== "number")
  ) {
    return Object.freeze({ code: "invalid-event-id", event, index });
  }
  if (normalizedById.has(eventId)) {
    return Object.freeze({ code: "duplicate-event-id", event, eventId, index });
  }

  let revision: string | number | undefined;
  if (adapter.getRevision !== undefined) {
    try {
      revision = adapter.getRevision(event);
    } catch (error) {
      return Object.freeze({
        accessor: "getRevision",
        code: "adapter-error",
        event,
        eventId,
        index,
        message: errorMessage(error),
      });
    }
    if (!isRevision(revision)) {
      return Object.freeze({ code: "invalid-revision", event, eventId, index });
    }
  }

  const prior = previous.get(eventId);
  if (
    prior !== undefined &&
    (adapter.getRevision === undefined
      ? prior.event === event
      : prior.structure.revision === revision)
  ) {
    return prior.structure;
  }

  let intervalValue: unknown;
  try {
    intervalValue = adapter.getInterval(event);
  } catch (error) {
    return Object.freeze({
      accessor: "getInterval",
      code: "adapter-error",
      event,
      eventId,
      index,
      message: errorMessage(error),
    });
  }

  let interval: CalendarEventInterval;
  let keys: { readonly endKey: bigint; readonly startKey: bigint };
  try {
    const kind = calendarEventIntervalKind(intervalValue);
    if (kind === undefined) {
      return Object.freeze({
        accessor: "getInterval",
        code: "invalid-event-interval",
        event,
        eventId,
        index,
      });
    }

    const returned = intervalValue as {
      readonly end?: unknown;
      readonly sourceTimeZone?: unknown;
      readonly start?: unknown;
    };
    if (kind === "timed") {
      const start = returned.start;
      const end = returned.end;
      if (!(start instanceof Temporal.Instant) || !(end instanceof Temporal.Instant)) {
        return Object.freeze({
          accessor: "getInterval",
          code: "invalid-event-interval",
          event,
          eventId,
          index,
          message: "interval-endpoints-must-match-kind",
        });
      }
      const sourceTimeZone = returned.sourceTimeZone;
      if (sourceTimeZone !== undefined && typeof sourceTimeZone !== "string") {
        return Object.freeze({
          accessor: "getInterval",
          code: "invalid-event-interval",
          event,
          eventId,
          index,
          message: "source-time-zone-must-be-a-string",
        });
      }
      interval = { end, kind, sourceTimeZone, start };
    } else if (kind === "all-day") {
      const start = returned.start;
      const end = returned.end;
      if (!(start instanceof Temporal.PlainDate) || !(end instanceof Temporal.PlainDate)) {
        return Object.freeze({
          accessor: "getInterval",
          code: "invalid-event-interval",
          event,
          eventId,
          index,
          message: "interval-endpoints-must-match-kind",
        });
      }
      interval = { end, kind, start };
    } else {
      const start = returned.start;
      const end = returned.end;
      if (!(start instanceof Temporal.PlainDateTime) || !(end instanceof Temporal.PlainDateTime)) {
        return Object.freeze({
          accessor: "getInterval",
          code: "invalid-event-interval",
          event,
          eventId,
          index,
          message: "interval-endpoints-must-match-kind",
        });
      }
      interval = { end, kind, start };
    }

    keys =
      interval.kind === "timed"
        ? { endKey: instantIndexKey(interval.end), startKey: instantIndexKey(interval.start) }
        : interval.kind === "all-day"
          ? { endKey: plainDateIndexKey(interval.end), startKey: plainDateIndexKey(interval.start) }
          : {
              endKey: plainDateTimeIndexKey(interval.end),
              startKey: plainDateTimeIndexKey(interval.start),
            };
    if (keys.startKey >= keys.endKey) {
      return Object.freeze({
        code: "start-not-before-end",
        event,
        eventId,
        index,
      });
    }
  } catch (error) {
    return Object.freeze({
      accessor: "getInterval",
      code: "invalid-event-interval",
      event,
      eventId,
      index,
      message: errorMessage(error),
    });
  }

  let resourceIds: readonly TResourceId[];
  try {
    const value: unknown = adapter.getResourceIds(event);
    if (!Array.isArray(value)) throw new TypeError("resource-ids-must-be-an-array");
    const unique: TResourceId[] = [];
    for (const [resourceIndex, resourceId] of value.entries()) {
      if (
        (typeof resourceId === "string" && resourceId.length === 0) ||
        (typeof resourceId === "number" && !Number.isFinite(resourceId)) ||
        (typeof resourceId !== "string" && typeof resourceId !== "number")
      ) {
        return Object.freeze({
          code: "invalid-resource-id",
          event,
          eventId,
          index,
          resourceIndex,
        });
      }
      if (!unique.includes(resourceId as TResourceId)) unique.push(resourceId as TResourceId);
    }
    resourceIds = Object.freeze(unique);
  } catch (error) {
    return Object.freeze({
      accessor: "getResourceIds",
      code: "adapter-error",
      event,
      eventId,
      index,
      message: errorMessage(error),
    });
  }

  let title: string;
  try {
    const value: unknown = adapter.getTitle(event);
    if (typeof value !== "string") throw new TypeError("event-title-must-be-a-string");
    title = value;
  } catch (error) {
    return Object.freeze({
      accessor: "getTitle",
      code: "adapter-error",
      event,
      eventId,
      index,
      message: errorMessage(error),
    });
  }

  let isReadOnly = false;
  if (adapter.isReadOnly !== undefined) {
    try {
      const value: unknown = adapter.isReadOnly(event);
      if (typeof value !== "boolean") throw new TypeError("event-read-only-must-be-a-boolean");
      isReadOnly = value;
    } catch (error) {
      return Object.freeze({
        accessor: "isReadOnly",
        code: "adapter-error",
        event,
        eventId,
        index,
        message: errorMessage(error),
      });
    }
  }

  const base = {
    ...keys,
    id: eventId,
    isReadOnly,
    resourceIds,
    revision,
    title,
  };
  const structure: EventStructure<TEventId, TResourceId> =
    interval.kind === "timed"
      ? {
          ...base,
          end: interval.end,
          kind: interval.kind,
          sourceTimeZone: interval.sourceTimeZone,
          start: interval.start,
        }
      : interval.kind === "all-day"
        ? { ...base, end: interval.end, kind: interval.kind, start: interval.start }
        : { ...base, end: interval.end, kind: interval.kind, start: interval.start };

  return structure;
}

function createEventSnapshotCacheInternal<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  adapter: EventAdapter<TEvent, TEventId, TResourceId>,
  options: EventSnapshotOptions,
  retainPreviousState: boolean,
): EventSnapshotCache<TEvent, TEventId, TResourceId> {
  const invalidEventPolicy = options.invalidEventPolicy ?? "report-and-skip";
  if (invalidEventPolicy !== "report-and-skip" && invalidEventPolicy !== "throw") {
    throw new RangeError("invalid-event-policy");
  }
  const queryCacheSize = options.queryCacheSize ?? DEFAULT_QUERY_CACHE_SIZE;
  // Validate eagerly rather than deferring a configuration error until the first snapshot.
  new BoundedLruCache(queryCacheSize);

  let version = 0;
  let previousById = new Map<TEventId, PreviousEvent<TEvent, TEventId, TResourceId>>();
  let indexed: IndexedEventData<TEventId, TResourceId> | undefined;
  let lastEvents: readonly TEvent[] | undefined;
  let lastSnapshot: EventSnapshot<TEvent, TEventId, TResourceId> | undefined;

  return Object.freeze({
    getSnapshot(events: readonly TEvent[]) {
      if (events === lastEvents && lastSnapshot !== undefined) return lastSnapshot;

      const nextPreviousById = retainPreviousState
        ? new Map<TEventId, PreviousEvent<TEvent, TEventId, TResourceId>>()
        : undefined;
      const normalizedById = new Map<
        TEventId,
        NormalizedCalendarEvent<TEvent, TEventId, TResourceId>
      >();
      const structures: EventStructure<TEventId, TResourceId>[] = [];
      const normalized: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[] = [];
      const issues: EventSnapshotIssue<TEvent, TEventId>[] = [];

      events.forEach((event, index) => {
        const result = normalizeEvent(event, index, adapter, previousById, normalizedById);
        if ("code" in result) {
          issues.push(result);
          return;
        }

        const normalizedEvent = materializeEvent(event, index, result);
        structures.push(result);
        normalized.push(normalizedEvent);
        normalizedById.set(result.id, normalizedEvent);
        nextPreviousById?.set(result.id, { event, structure: result });
      });

      const frozenIssues = Object.freeze(issues);
      if (invalidEventPolicy === "throw" && frozenIssues.length > 0) {
        throw new InvalidCalendarEventSnapshotError(frozenIssues);
      }

      const nextIndexed =
        indexed !== undefined && structuresMatch(indexed.structures, structures)
          ? indexed
          : buildIndexedData(structures);
      version += 1;
      const snapshot = new ImmutableEventSnapshot(
        version,
        Object.freeze(normalized),
        frozenIssues,
        nextIndexed,
        normalizedById,
        queryCacheSize,
      );

      indexed = nextIndexed;
      lastEvents = events;
      lastSnapshot = snapshot;
      if (nextPreviousById !== undefined) previousById = nextPreviousById;
      return snapshot;
    },
  });
}

export function createEventSnapshotCache<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  adapter: EventAdapter<TEvent, TEventId, TResourceId>,
  options: EventSnapshotOptions = {},
): EventSnapshotCache<TEvent, TEventId, TResourceId> {
  return createEventSnapshotCacheInternal(adapter, options, true);
}

export function createEventSnapshot<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  events: readonly TEvent[],
  adapter: EventAdapter<TEvent, TEventId, TResourceId>,
  options: EventSnapshotOptions = {},
): EventSnapshot<TEvent, TEventId, TResourceId> {
  return createEventSnapshotCacheInternal(adapter, options, false).getSnapshot(events);
}
