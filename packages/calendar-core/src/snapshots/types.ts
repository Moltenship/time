import type {
  InstantInterval,
  PlainDateInterval,
  PlainDateTimeInterval,
} from "@moltenship/calendar-temporal";

import type {
  AllDayCalendarEventInterval,
  FloatingCalendarEventInterval,
  TimedCalendarEventInterval,
} from "../events.ts";
import type { EventId, ResourceId } from "../ids.ts";

export type InvalidCalendarEventPolicy = "report-and-skip" | "throw";

export type EventAdapterAccessor =
  | "getId"
  | "getInterval"
  | "getResourceIds"
  | "getRevision"
  | "getTitle"
  | "isReadOnly";

export interface EventSnapshotIssue<TEvent, TEventId extends EventId> {
  readonly accessor?: EventAdapterAccessor;
  readonly code:
    | "adapter-error"
    | "duplicate-event-id"
    | "invalid-event-id"
    | "invalid-event-interval"
    | "invalid-resource-id"
    | "invalid-revision"
    | "start-not-before-end";
  readonly event: TEvent;
  readonly eventId?: TEventId;
  readonly index: number;
  readonly message?: string;
  readonly resourceIndex?: number;
}

export interface EventSnapshotOptions {
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly queryCacheSize?: number;
}

interface NormalizedCalendarEventBase<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly event: TEvent;
  readonly id: TEventId;
  readonly inputIndex: number;
  readonly isReadOnly: boolean;
  readonly resourceIds: readonly TResourceId[];
  readonly revision?: string | number;
  readonly title: string;
}

export type NormalizedTimedCalendarEvent<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & TimedCalendarEventInterval;

export type NormalizedAllDayCalendarEvent<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & AllDayCalendarEventInterval;

export type NormalizedFloatingCalendarEvent<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & FloatingCalendarEventInterval;

export type NormalizedCalendarEvent<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>
  | NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>
  | NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>;

export interface EventSnapshotQueryOptions<TResourceId extends ResourceId> {
  readonly resourceIds?: readonly TResourceId[];
}

export interface EventSnapshotQueryCacheStatistics {
  readonly capacity: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}

export interface EventSnapshot<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly byId: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
  readonly events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];
  readonly size: number;
  readonly version: number;
  eventsForResource(
    resourceId: TResourceId,
  ): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
  get(eventId: TEventId): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined;
  getQueryCacheStatistics(): EventSnapshotQueryCacheStatistics;
  queryAllDay(
    range: PlainDateInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[];
  queryFloating(
    range: PlainDateTimeInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[];
  queryTimed(
    range: InstantInterval,
    options?: EventSnapshotQueryOptions<TResourceId>,
  ): readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[];
}

export interface EventSnapshotCache<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  getSnapshot(events: readonly TEvent[]): EventSnapshot<TEvent, TEventId, TResourceId>;
}

export interface CalendarEventSource<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  getServerSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  getSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  subscribe(listener: () => void): () => void;
}

export type CalendarEventInput<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | readonly TEvent[]
  | CalendarEventSource<TEvent, TEventId, TResourceId>;

export class InvalidCalendarEventSnapshotError<TEvent, TEventId extends EventId> extends TypeError {
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];

  constructor(issues: readonly EventSnapshotIssue<TEvent, TEventId>[]) {
    super("invalid-calendar-event-snapshot");
    this.name = "InvalidCalendarEventSnapshotError";
    this.issues = issues;
  }
}
