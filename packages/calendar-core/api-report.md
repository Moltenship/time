# @moltenship/calendar-core API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-core`

```ts
import {
  CalendarClock,
  HalfOpenIntervalComparator,
  InstantInterval,
  PlainDateInterval,
  PlainDateTimeInterval,
  TemporalDisambiguation,
  WallTimeSnapOptions,
  ZonedDayRange,
} from "@moltenship/calendar-temporal";

type AllDayCalendarEvent<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string> = CalendarEventBase<TData, TEventId, TResourceId> & AllDayCalendarEventInterval;
interface AllDayCalendarEventInterval {
  readonly end: Temporal.PlainDate;
  readonly kind: "all-day";
  readonly start: Temporal.PlainDate;
}
type AnnotationId = CalendarEntityId;
interface AnnotationSnapshot<TData = unknown, TResourceId extends ResourceId = ResourceId> {
  readonly annotations: readonly CalendarAnnotation<TData, TResourceId>[];
  readonly issues: readonly AnnotationSnapshotIssue[];
  get(id: AnnotationId): CalendarAnnotation<TData, TResourceId> | undefined;
  query(start: Temporal.Instant, end: Temporal.Instant): readonly CalendarAnnotation<TData, TResourceId>[];
}
interface AnnotationSnapshotIssue {
  readonly annotation: unknown;
  readonly code: "duplicate-annotation-id" | "invalid-annotation" | "invalid-annotation-id" | "start-not-before-end";
  readonly index: number;
}
interface AnnotationSourceSummary<TSource extends CalendarAnnotationSource = CalendarAnnotationSource> {
  readonly source: TSource;
  readonly count: number;
  readonly duration: Temporal.Duration;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly startsBeforeDay: boolean;
  readonly endsAfterDay: boolean;
}
interface AvailabilityBand extends TimeGridBand, ClosedTime {}
interface AvailabilityException {
  readonly date: Temporal.PlainDate;
  readonly hours?: readonly AvailabilityHours[];
  readonly label?: string;
}
interface AvailabilityExtent extends TimelineExtent, ClosedTime {}
interface AvailabilityHours {
  readonly start: Temporal.PlainTime;
  readonly end: Temporal.PlainTime;
}
interface AvailabilityIssue {
  readonly code: "duplicate-exception-date" | "invalid-availability-exception" | "invalid-availability-rule" | "invalid-time-zone";
  readonly resourceId?: ResourceId;
  readonly value: unknown;
}
interface AvailabilityPolicyOptions {
  readonly mode?: "block" | "warn";
}
interface AvailabilityRule extends AvailabilityHours {
  readonly days: readonly IsoDayOfWeek[];
}
interface AvailabilitySchedule {
  readonly timeZone: string;
  available(range: InstantInterval): readonly InstantInterval[];
  unavailable(range: InstantInterval): readonly InstantInterval[];
  isAvailable(range: InstantInterval): boolean;
  exceptionOn(date: Temporal.PlainDate): AvailabilityException | undefined;
}
interface AvailabilitySnapshot {
  readonly calendar: AvailabilitySchedule | null;
  readonly issues: readonly AvailabilityIssue[];
  readonly timeZone: string;
  forResource(resourceId: ResourceId | null): AvailabilitySchedule | null;
}
interface AvailabilitySnapshotInput {
  readonly availability?: CalendarAvailability;
  readonly resources?: readonly Pick<CalendarResource<unknown, ResourceId>, "availability" | "id" | "timeZone">[];
  readonly timeZone: string;
}
type AvailabilityStatus = {
  readonly available: true;
  readonly closesAt: Temporal.Instant | null;
} | {
  readonly available: false;
  readonly reason: UnavailableReason;
  readonly label?: string;
  readonly opensAt: Temporal.Instant | null;
};
interface BusyQuery<TResourceId extends ResourceId> {
  readonly resourceId?: TResourceId;
  readonly timeZone: string;
}
interface BusyResourcesQuery<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly exclude?: TEventId;
  readonly resourceIds?: readonly TResourceId[];
  readonly timeZone: string;
}
type BusyStatus<TEvent> = {
  readonly busy: true;
  readonly events: readonly TEvent[];
  readonly freeAt: Temporal.Instant | null;
} | {
  readonly busy: false;
  readonly nextEventAt: Temporal.Instant | null;
};
interface CalendarAnnotation<TData = unknown, TResourceId extends ResourceId = never> {
  readonly id: AnnotationId;
  readonly sourceId: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly title: string;
  readonly resourceIds?: readonly TResourceId[];
  readonly data?: TData;
}
interface CalendarAnnotationSource {
  readonly id: string;
  readonly label: string;
  readonly mergeGap?: Temporal.Duration;
}
type CalendarAnnouncementBuilder<TPhase extends CalendarInteractionPhase> = (update: Extract<CalendarInteractionUpdate, {
  readonly phase: TPhase;
}>, context: CalendarAnnouncementContext) => string | null;
interface CalendarAnnouncementContext {
  readonly formatRange: (placement: CalendarEventInterval) => string;
  readonly locale: Intl.Locale | string;
  readonly resourceTitle: (resourceId: ResourceId) => string | undefined;
  readonly timeZone: string;
}
type CalendarAnnouncementMessages = { readonly [TPhase in CalendarInteractionPhase]: CalendarAnnouncementBuilder<TPhase>; } & {
  readonly formatRange?: (placement: CalendarEventInterval, options: Pick<CalendarAnnouncementContext, "locale" | "timeZone">) => string;
};
interface CalendarAnnouncer {
  readonly announce: (update: CalendarInteractionUpdate) => void;
  readonly formatRange: (placement: CalendarEventInterval) => string;
}
interface CalendarAvailability extends ResourceAvailability {
  readonly timeZone?: string;
}
type CalendarCellFocus = CalendarDayFocus | CalendarSlotFocus;
type CalendarChangeCause = "create" | "move" | "resize-start" | "resize-end" | "update" | "delete";
interface CalendarDayFocus extends CalendarResourceFocus {
  readonly date: Temporal.PlainDate;
  readonly kind: "day";
}
type CalendarDirection = "ltr" | "rtl";
interface CalendarDraft<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventId: TEventId | null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
}
type CalendarEntityId = string | number;
type CalendarEnvironment = CalendarEnvironmentBase & CalendarNowSource;
interface CalendarEnvironmentBase {
  readonly direction: CalendarDirection;
  readonly disambiguation: TemporalDisambiguation;
  readonly locale: Intl.Locale | string;
  readonly secondaryTimeZones?: readonly CalendarSecondaryTimeZone[];
  readonly timeZone: string;
  readonly weekRules: CalendarWeekRules;
}
type CalendarEvent<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string> = TimedCalendarEvent<TData, TEventId, TResourceId> | AllDayCalendarEvent<TData, TEventId, TResourceId> | FloatingCalendarEvent<TData, TEventId, TResourceId>;
interface CalendarEventBase<TData, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly data: TData;
  readonly id: TEventId;
  readonly resourceIds?: readonly TResourceId[];
  readonly title: string;
}
type CalendarEventChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = CalendarEventCreateChange<TResourceId> | CalendarEventUpdateChange<TEvent, TEventId, TResourceId> | CalendarEventDeleteChange<TEvent, TEventId, TResourceId>;
type CalendarEventChangeHandler<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = (change: CalendarEventChange<TEvent, TEventId, TResourceId>) => void | Promise<void>;
type CalendarEventContractValidation<TValue> = {
  readonly valid: true;
  readonly value: TValue;
} | {
  readonly issues: readonly CalendarEventValidationIssue[];
  readonly valid: false;
};
interface CalendarEventCreateChange<TResourceId extends ResourceId> {
  readonly cause: "create";
  readonly event: null;
  readonly eventId: null;
  readonly id: string;
  readonly original: null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
  readonly warnings?: readonly string[];
}
interface CalendarEventDeleteChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly cause: "delete";
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly id: string;
  readonly original: CalendarEventPlacement<TResourceId>;
  readonly proposed: null;
  readonly warnings?: readonly string[];
}
interface CalendarEventFocus<TEventId extends EventId = EventId> extends CalendarResourceFocus {
  readonly date: Temporal.PlainDate;
  readonly eventId: TEventId;
  readonly kind: "event";
}
type CalendarEventInput<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = readonly TEvent[] | CalendarEventSource<TEvent, TEventId, TResourceId>;
type CalendarEventInterval = TimedCalendarEventInterval | AllDayCalendarEventInterval | FloatingCalendarEventInterval;
interface CalendarEventIntervalComparators<TInstant, TPlainDate, TPlainDateTime> {
  readonly instant: HalfOpenIntervalComparator<TInstant>;
  readonly plainDate: HalfOpenIntervalComparator<TPlainDate>;
  readonly plainDateTime: HalfOpenIntervalComparator<TPlainDateTime>;
}
type CalendarEventIntervalOf<TInstant, TPlainDate, TPlainDateTime> = {
  readonly end: TInstant;
  readonly kind: "timed";
  readonly sourceTimeZone?: string;
  readonly start: TInstant;
} | {
  readonly end: TPlainDate;
  readonly kind: "all-day";
  readonly start: TPlainDate;
} | {
  readonly end: TPlainDateTime;
  readonly kind: "floating";
  readonly start: TPlainDateTime;
};
type CalendarEventPlacement<TResourceId extends ResourceId = ResourceId> = CalendarEventInterval & {
  readonly resourceIds: readonly TResourceId[];
};
type CalendarEventPlacementInput<TResourceId extends ResourceId = ResourceId> = CalendarEventInterval & {
  readonly resourceIds?: readonly TResourceId[];
};
type CalendarEventProposal<TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly cause: "create";
  readonly proposed: CalendarEventPlacementInput<TResourceId>;
} | {
  readonly cause: "move" | "resize-start" | "resize-end" | "update";
  readonly eventId: TEventId;
  readonly proposed: CalendarEventPlacementInput<TResourceId>;
} | {
  readonly cause: "delete";
  readonly eventId: TEventId;
};
interface CalendarEventSource<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getServerSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  getSnapshot(): EventSnapshot<TEvent, TEventId, TResourceId>;
  subscribe(listener: () => void): () => void;
}
interface CalendarEventUpdateChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly cause: "move" | "resize-start" | "resize-end" | "update";
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly id: string;
  readonly original: CalendarEventPlacement<TResourceId>;
  readonly proposed: CalendarEventPlacement<TResourceId>;
  readonly warnings?: readonly string[];
}
interface CalendarEventValidationIssue {
  readonly code: "invalid-event-id" | "invalid-resource-id" | "start-not-before-end";
  readonly index?: number;
  readonly kind?: CalendarEventInterval["kind"];
}
type CalendarFocus<TEventId extends EventId = EventId> = CalendarCellFocus | CalendarEventFocus<TEventId>;
type CalendarInteractionCause = "create" | "move" | "resize-end" | "resize-start";
type CalendarInteractionCheck = CalendarPolicyResult<unknown, EventId, ResourceId> | null;
interface CalendarInteractionOptions {
  readonly snap: WallTimeSnapOptions;
  readonly timeZone: string;
}
type CalendarInteractionPhase = CalendarInteractionUpdate["phase"];
type CalendarInteractionTarget = ({
  readonly at: Temporal.ZonedDateTime;
  readonly kind: "time";
} | {
  readonly date: Temporal.PlainDate;
  readonly kind: "day";
}) & {
  readonly resourceId?: ResourceId | null;
};
type CalendarInteractionUpdate = CalendarInteractionUpdateBase & ({
  readonly phase: "cancel";
} | {
  readonly check?: CalendarInteractionCheck;
  readonly phase: "start";
} | {
  readonly check?: CalendarInteractionCheck;
  readonly phase: "step";
} | {
  readonly phase: "commit";
  readonly proposed: CalendarEventPlacement;
  readonly warnings?: readonly string[];
} | {
  readonly phase: "reject";
  readonly error?: unknown;
  readonly reason: string;
});
interface CalendarInteractionUpdateBase {
  readonly cause: CalendarInteractionCause;
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId> | null;
  readonly input: "keyboard" | "pointer";
  readonly original: CalendarEventPlacement | null;
  readonly proposed: CalendarEventPlacement | null;
}
interface CalendarKeyboardSession<TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly cause: CalendarInteractionCause;
  readonly cursor: CalendarCellFocus;
  readonly eventId: TEventId | null;
  readonly grab: CalendarCellFocus;
  readonly original: CalendarEventPlacement<TResourceId> | null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
}
type CalendarKeyboardSessionStart<TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly cause: "create";
  readonly cell: CalendarCellFocus;
} | {
  readonly cause: Exclude<CalendarInteractionCause, "create">;
  readonly cell: CalendarCellFocus;
  readonly event: NormalizedCalendarEvent<unknown, TEventId, TResourceId>;
};
type CalendarNavigationCommand = "down" | "end" | "enter" | "exit" | "home" | "left" | "page-down" | "page-up" | "right" | "up";
type CalendarNowSource = {
  readonly clock: CalendarClock;
  readonly now?: never;
} | {
  readonly clock?: never;
  readonly now: Temporal.Instant;
} | {
  readonly clock?: undefined;
  readonly now?: undefined;
};
type CalendarPendingPlacements<TEventId extends EventId, TResourceId extends ResourceId> = ReadonlyMap<TEventId, CalendarEventPlacement<TResourceId> | null>;
type CalendarPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = (change: CalendarEventChange<TEvent, TEventId, TResourceId>, context: CalendarPolicyContext<TEvent, TEventId, TResourceId>) => CalendarPolicyDecision<TResourceId> | Promise<CalendarPolicyDecision<TResourceId>>;
interface CalendarPolicyContext<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly availability?: AvailabilitySnapshot;
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly timeZone: string;
}
type CalendarPolicyDecision<TResourceId extends ResourceId> = {
  readonly type: "accept";
} | {
  readonly proposed: CalendarEventPlacement<TResourceId>;
  readonly type: "adjust";
} | {
  readonly reason: string;
  readonly type: "reject";
} | {
  readonly reason: string;
  readonly type: "warn";
};
type CalendarPolicyResult<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly status: "accepted";
} | {
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly reason: string;
  readonly status: "rejected";
};
interface CalendarResource<TData = unknown, TResourceId extends ResourceId = string> {
  readonly availability?: ResourceAvailability;
  readonly data: TData;
  readonly id: TResourceId;
  readonly parentId?: TResourceId;
  readonly timeZone?: string;
  readonly title: string;
}
interface CalendarResourceFocus {
  readonly resourceId?: ResourceId | null;
}
interface CalendarSecondaryTimeZone {
  readonly timeZone: string;
  readonly label?: string;
}
type CalendarSelection<TEventId extends EventId = EventId> = CalendarCellFocus | {
  readonly eventId: TEventId;
  readonly kind: "event";
};
interface CalendarSlotFocus extends CalendarResourceFocus {
  readonly date: Temporal.PlainDate;
  readonly kind: "slot";
  readonly time: Temporal.PlainTime;
}
type CalendarSpatialNavigation = {
  readonly focus: CalendarFocus;
} | {
  readonly page: -1 | 1;
};
interface CalendarSpatialNavigationInput<TProjection, TOptions> {
  readonly command: CalendarNavigationCommand;
  readonly environment: CalendarEnvironmentBase;
  readonly focus: CalendarFocus | null;
  readonly options: TOptions;
  readonly projection: TProjection;
  readonly range: PlainDateInterval;
  readonly snap: WallTimeSnapOptions;
}
interface CalendarTransactionContext<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly availability?: AvailabilitySnapshot;
  readonly onEventChange: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly snapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly timeZone: string;
}
type CalendarTransactionResult<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly status: "committed";
} | {
  readonly change?: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly error?: unknown;
  readonly reason: string;
  readonly status: "rejected";
};
interface CalendarViewProjectionInput<TOptions, TEvent = unknown> {
  readonly environment: CalendarEnvironmentBase;
  readonly expandedResourceIds: readonly ResourceId[];
  readonly instantRange: InstantInterval;
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly range: PlainDateInterval;
  readonly resources: ResourceTree;
  readonly snapshot: EventSnapshot<TEvent, EventId, ResourceId>;
  readonly today: Temporal.PlainDate | null;
}
interface CalendarViewStrategy<TProjection, TOptions = undefined, TEvent = unknown> {
  getLoadRange?(anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase, options: TOptions): PlainDateInterval;
  getRange(anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase, options: TOptions): PlainDateInterval;
  getSpatialNavigation?(input: CalendarSpatialNavigationInput<TProjection, TOptions>): CalendarSpatialNavigation | null;
  getTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase, options: TOptions): string;
  navigate(anchor: Temporal.PlainDate, delta: number, options: TOptions): Temporal.PlainDate;
  project(input: CalendarViewProjectionInput<TOptions, TEvent>): TProjection;
}
interface CalendarWallClockDelta {
  readonly days?: number;
  readonly hours?: number;
  readonly microseconds?: number;
  readonly milliseconds?: number;
  readonly minutes?: number;
  readonly months?: number;
  readonly nanoseconds?: number;
  readonly seconds?: number;
  readonly weeks?: number;
  readonly years?: number;
}
interface CalendarWeekRules {
  readonly firstDay: IsoDayOfWeek;
  readonly minimalDays: IsoDayOfWeek;
  readonly weekend: readonly IsoDayOfWeek[];
}
interface ClosedDate {
  readonly date: Temporal.PlainDate;
  readonly label?: string;
  readonly reason: "closed-day" | "exception";
}
interface ClosedTime {
  readonly reason: UnavailableReason;
  readonly label?: string;
  readonly opensBefore: boolean;
  readonly opensAfter: boolean;
}
interface ConflictPolicyOptions {
  readonly mode?: "block" | "warn";
}
type DayFragment = EventDayFragment<unknown, EventId, ResourceId>;
interface DayGridOverflow<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly hiddenCounts: readonly number[];
  readonly segments: readonly DayGridSegment<TEvent, TEventId, TResourceId>[];
}
interface DayGridRow<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly laneCount: number;
  readonly range: PlainDateInterval;
  readonly segments: readonly DayGridSegment<TEvent, TEventId, TResourceId>[];
}
interface DayGridSegment<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly column: number;
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  readonly fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[];
  readonly lane: number;
  readonly span: number;
  readonly startsBefore: boolean;
}
type DurationInput = Temporal.Duration | Temporal.DurationLike;
interface EventAdapter<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getId(event: TEvent): TEventId;
  getInterval(event: TEvent): CalendarEventInterval;
  getResourceIds(event: TEvent): readonly TResourceId[];
  getRevision?(event: TEvent): string | number;
  getTitle(event: TEvent): string;
  isReadOnly?(event: TEvent): boolean;
  isBusy?(event: TEvent): boolean;
}
type EventAdapterAccessor = "getId" | "getInterval" | "getResourceIds" | "getRevision" | "getTitle" | "isBusy" | "isReadOnly";
interface EventDayFragment<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly date: Temporal.PlainDate;
  readonly end: Temporal.PlainDateTime;
  readonly endsAfterDay: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
  readonly start: Temporal.PlainDateTime;
  readonly startsBeforeDay: boolean;
}
type EventId = CalendarEntityId;
interface EventSnapshot<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly byId: ReadonlyMap<TEventId, NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
  readonly events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];
  readonly size: number;
  readonly version: number;
  eventsForResource(resourceId: TResourceId): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
  get(eventId: TEventId): NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined;
  getQueryCacheStatistics(): EventSnapshotQueryCacheStatistics;
  queryAllDay(range: PlainDateInterval, options?: EventSnapshotQueryOptions<TResourceId>): readonly NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId>[];
  queryFloating(range: PlainDateTimeInterval, options?: EventSnapshotQueryOptions<TResourceId>): readonly NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>[];
  queryTimed(range: InstantInterval, options?: EventSnapshotQueryOptions<TResourceId>): readonly NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId>[];
}
interface EventSnapshotCache<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getSnapshot(events: readonly TEvent[]): EventSnapshot<TEvent, TEventId, TResourceId>;
}
interface EventSnapshotIssue<TEvent, TEventId extends EventId> {
  readonly accessor?: EventAdapterAccessor;
  readonly code: "adapter-error" | "duplicate-event-id" | "invalid-event-id" | "invalid-event-interval" | "invalid-resource-id" | "invalid-revision" | "start-not-before-end";
  readonly event: TEvent;
  readonly eventId?: TEventId;
  readonly index: number;
  readonly message?: string;
  readonly resourceIndex?: number;
}
interface EventSnapshotOptions {
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly queryCacheSize?: number;
}
interface EventSnapshotQueryCacheStatistics {
  readonly capacity: number;
  readonly evictions: number;
  readonly hits: number;
  readonly misses: number;
  readonly size: number;
}
interface EventSnapshotQueryOptions<TResourceId extends ResourceId> {
  readonly resourceIds?: readonly TResourceId[];
}
interface EventTransactions<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly getPending: () => CalendarPendingPlacements<TEventId, TResourceId>;
  readonly propose: (proposal: CalendarEventProposal<TEventId, TResourceId>, context: CalendarTransactionContext<TEvent, TEventId, TResourceId>) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  readonly check: (proposal: CalendarEventProposal<TEventId, TResourceId>, context: Omit<CalendarTransactionContext<TEvent, TEventId, TResourceId>, "onEventChange">) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  readonly reconcile: (snapshot: EventSnapshot<TEvent, TEventId, TResourceId>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}
type FloatingCalendarEvent<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string> = CalendarEventBase<TData, TEventId, TResourceId> & FloatingCalendarEventInterval;
interface FloatingCalendarEventInterval {
  readonly end: Temporal.PlainDateTime;
  readonly kind: "floating";
  readonly start: Temporal.PlainDateTime;
}
type Input = CalendarSpatialNavigationInput<ResourceTimelineProjection<unknown>, unknown>;
type InvalidCalendarEventPolicy = "report-and-skip" | "throw";
export declare class InvalidCalendarEventSnapshotError<TEvent, TEventId extends EventId> extends TypeError {
  readonly issues: readonly EventSnapshotIssue<TEvent, TEventId>[];
  constructor(issues: readonly EventSnapshotIssue<TEvent, TEventId>[]);
}
type IsoDayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;
interface ListDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly date: Temporal.PlainDate;
  readonly isToday: boolean;
  readonly items: readonly ListItem<TEvent, TEventId, TResourceId>[];
}
interface ListItem<TEvent, TEventId extends EventId, TResourceId extends ResourceId> extends EventDayFragment<TEvent, TEventId, TResourceId> {
  readonly dayCount: number;
  readonly dayIndex: number;
}
interface ListProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly days: readonly ListDay<TEvent, TEventId, TResourceId>[];
  readonly range: PlainDateInterval;
}
interface ListViewOptions {
  readonly weeks?: number;
}
interface LocalDateRange {
  readonly first: Temporal.PlainDate;
  readonly last: Temporal.PlainDate;
}
interface MonthDay {
  readonly date: Temporal.PlainDate;
  readonly inMonth: boolean;
  readonly isToday: boolean;
}
interface MonthProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly range: PlainDateInterval;
  readonly weeks: readonly MonthWeek<TEvent, TEventId, TResourceId>[];
}
interface MonthWeek<TEvent, TEventId extends EventId, TResourceId extends ResourceId> extends DayGridRow<TEvent, TEventId, TResourceId> {
  readonly days: readonly MonthDay[];
}
type NormalizedAllDayCalendarEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & AllDayCalendarEventInterval;
type NormalizedCalendarEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = NormalizedTimedCalendarEvent<TEvent, TEventId, TResourceId> | NormalizedAllDayCalendarEvent<TEvent, TEventId, TResourceId> | NormalizedFloatingCalendarEvent<TEvent, TEventId, TResourceId>;
interface NormalizedCalendarEventBase<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly event: TEvent;
  readonly id: TEventId;
  readonly inputIndex: number;
  readonly isPending?: boolean;
  readonly isBusy?: boolean;
  readonly isReadOnly: boolean;
  readonly resourceIds: readonly TResourceId[];
  readonly revision?: string | number;
  readonly title: string;
}
type NormalizedFloatingCalendarEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & FloatingCalendarEventInterval;
type NormalizedTimedCalendarEvent<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = NormalizedCalendarEventBase<TEvent, TEventId, TResourceId> & TimedCalendarEventInterval;
type OverlapLayout = "columns" | "equal" | "stack";
interface OverlapLayoutOptions {
  readonly overlapLayout?: OverlapLayout;
  readonly stackIndent?: number;
}
type Projection = YearProjection<unknown, EventId, ResourceId>;
type Projection$1 = MonthProjection<unknown, EventId, ResourceId>;
interface ResolvedSecondaryTimeZones {
  readonly issues: readonly SecondaryTimeZoneIssue[];
  readonly zones: readonly CalendarSecondaryTimeZone[];
}
interface ResourceAvailability {
  readonly weekly?: readonly AvailabilityRule[];
  readonly exceptions?: readonly AvailabilityException[];
}
interface ResourceColumn<TEvent> extends TimeGridProjection<TEvent> {
  readonly resource: VisibleResource;
}
interface ResourceColumnsProjection<TEvent> {
  readonly columns: readonly TimeGridColumn[];
  readonly resources: readonly ResourceColumn<TEvent>[];
}
type ResourceColumnsProjectionInput<TEvent> = Pick<CalendarViewProjectionInput<unknown, TEvent>, "environment" | "expandedResourceIds" | "range" | "resources" | "snapshot" | "today"> & OverlapLayoutOptions & ResourceVisibilityOptions;
type ResourceId = CalendarEntityId;
interface ResourceStatus<TEvent> {
  readonly availability: AvailabilityStatus;
  readonly busy: BusyStatus<TEvent>;
  readonly changesAt: Temporal.Instant | null;
}
interface ResourceTimelineBar<TEvent> extends TimelineExtent {
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  readonly lane: number;
  readonly startsBefore: boolean;
}
interface ResourceTimelineDayRow<TEvent> {
  readonly laneCount: number;
  readonly resource: VisibleResource;
  readonly segments: readonly DayGridSegment<TEvent, EventId, ResourceId>[];
}
interface ResourceTimelineHourRow<TEvent> {
  readonly bars: readonly ResourceTimelineBar<TEvent>[];
  readonly laneCount: number;
  readonly resource: VisibleResource;
}
interface ResourceTimelineOptions extends ResourceVisibilityOptions {
  readonly slotUnit?: "day" | "hour";
}
type ResourceTimelineProjection<TEvent> = {
  readonly columns: readonly TimeGridColumn[];
  readonly today: Temporal.PlainDate | null;
} & ({
  readonly rows: readonly ResourceTimelineDayRow<TEvent>[];
  readonly unit: "day";
} | {
  readonly rows: readonly ResourceTimelineHourRow<TEvent>[];
  readonly unit: "hour";
});
type ResourceTimelineProjectionInput<TEvent> = Pick<CalendarViewProjectionInput<unknown, TEvent>, "environment" | "expandedResourceIds" | "instantRange" | "range" | "resources" | "snapshot" | "today"> & ResourceTimelineOptions;
type ResourceTimelineSpan = TimeGridSpan | {
  readonly kind: "month";
};
interface ResourceTree<TResource = CalendarResource<unknown, ResourceId>> {
  readonly byId: ReadonlyMap<ResourceId, ResourceTreeNode<TResource>>;
  readonly roots: readonly ResourceTreeNode<TResource>[];
}
type ResourceTreeInput = Pick<CalendarResource<unknown, ResourceId>, "id" | "parentId">;
interface ResourceTreeNode<TResource> {
  readonly children: readonly ResourceTreeNode<TResource>[];
  readonly depth: number;
  readonly id: ResourceId;
  readonly parentId: ResourceId | null;
  readonly resource: TResource;
}
interface ResourceVisibilityOptions {
  readonly unassigned?: "bucket" | "hide";
}
interface SecondaryTimeZoneIssue {
  readonly code: "invalid-secondary-time-zone";
  readonly index?: number;
  readonly value: unknown;
}
interface TimeGridAnnotationGeometry {
  readonly minHeight?: number;
  readonly minGap?: number;
  readonly layout?: "pack" | "per-source";
  readonly maxLanes?: number;
}
interface TimeGridAnnotationMark<TSource extends CalendarAnnotationSource = CalendarAnnotationSource, TData = unknown> {
  readonly annotations: readonly CalendarAnnotation<TData, ResourceId>[];
  readonly key: string;
  readonly source: TSource;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly duration: Temporal.Duration;
  readonly startsBeforeDay: boolean;
  readonly endsAfterDay: boolean;
  readonly top: number;
  readonly height: number;
  readonly kind: "bar" | "dot";
  readonly lane: number;
  readonly lanes: number;
}
interface TimeGridBand {
  readonly height: number;
  readonly top: number;
}
interface TimeGridColumn {
  readonly date: Temporal.PlainDate;
  readonly day: ZonedDayRange;
  readonly folds: readonly TimeGridBand[];
  readonly gaps: readonly TimeGridBand[];
  readonly key: string;
}
interface TimeGridDay<TEvent> {
  readonly column: TimeGridColumn;
  readonly events: readonly TimeGridEventLayout<EventDayFragment<TEvent, EventId, ResourceId>>[];
  readonly isToday: boolean;
}
interface TimeGridEventLayout<TFragment> extends TimeGridBand {
  readonly fragment: TFragment;
  readonly left: number;
  readonly width: number;
}
interface TimeGridPointOptions {
  readonly fold?: "earlier" | "later";
  readonly snap?: WallTimeSnapOptions;
}
interface TimeGridPosition {
  readonly column: number;
  readonly top: number;
}
interface TimeGridProjection<TEvent> {
  readonly allDay: DayGridRow<TEvent, EventId, ResourceId>;
  readonly days: readonly TimeGridDay<TEvent>[];
}
type TimeGridProjectionInput<TEvent> = Pick<CalendarViewProjectionInput<unknown, TEvent>, "environment" | "range" | "snapshot" | "today"> & OverlapLayoutOptions;
type TimeGridSpan = {
  readonly kind: "week";
} | {
  readonly count: number;
  readonly kind: "days";
};
interface TimeGridZoneAxis {
  readonly date: Temporal.PlainDate;
  readonly rows: readonly TimeGridZoneRow[];
  readonly shifts: readonly TimeGridZoneShift[];
  readonly timeZone: string;
}
interface TimeGridZoneAxisOptions {
  readonly step?: number;
  readonly visible?: PlainDateInterval;
}
interface TimeGridZoneRow {
  readonly times: readonly TimeGridZoneTime[];
  readonly top: number;
  readonly wallTime: Temporal.PlainTime;
}
interface TimeGridZoneShift {
  readonly date: Temporal.PlainDate;
  readonly from: Temporal.PlainTime;
  readonly minutes: number;
  readonly until: Temporal.PlainTime | null;
}
interface TimeGridZoneTime {
  readonly dateTime: Temporal.PlainDateTime;
  readonly dayOffset: number;
  readonly instant: Temporal.Instant;
  readonly offset: string;
}
type TimedCalendarEvent<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string> = CalendarEventBase<TData, TEventId, TResourceId> & TimedCalendarEventInterval;
interface TimedCalendarEventInterval {
  readonly end: Temporal.Instant;
  readonly kind: "timed";
  readonly sourceTimeZone?: string;
  readonly start: Temporal.Instant;
}
interface TimedOverlapOptions extends OverlapLayoutOptions {
  readonly minHeight?: number;
}
interface TimelineExtent {
  readonly end: number;
  readonly start: number;
}
type UnavailableReason = "closed-day" | "exception" | "outside-hours";
type ValidatedCalendarEvent<TEvent extends CalendarEvent<unknown, EventId, ResourceId>> = TEvent & {
  readonly [validatedCalendarEvent]: true;
};
type ValidatedCalendarEventInterval<TInterval> = TInterval & {
  readonly [validatedCalendarEventInterval]: true;
};
interface VisibleResource<TResource = CalendarResource<unknown, ResourceId>> {
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly id: ResourceId | null;
  readonly key: string;
  readonly parentId: ResourceId | null;
  readonly resource: TResource | null;
}
interface YearDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly date: Temporal.PlainDate;
  readonly fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[];
  readonly isToday: boolean;
}
interface YearMonth<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly range: PlainDateInterval;
  readonly weeks: readonly YearWeek<TEvent, TEventId, TResourceId>[];
}
interface YearProjection<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly months: readonly YearMonth<TEvent, TEventId, TResourceId>[];
  readonly range: PlainDateInterval;
}
interface YearWeek<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly days: readonly (YearDay<TEvent, TEventId, TResourceId> | null)[];
  readonly range: PlainDateInterval;
}
export declare function anchorShowingDate<TOptions>(strategy: Pick<CalendarViewStrategy<unknown, TOptions>, "getRange" | "navigate">, anchor: Temporal.PlainDate, date: Temporal.PlainDate, environment: CalendarEnvironmentBase, options: TOptions): Temporal.PlainDate;
export declare function applyEventOverlay<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(snapshot: EventSnapshot<TEvent, TEventId, TResourceId>, pending: CalendarPendingPlacements<TEventId, TResourceId>): EventSnapshot<TEvent, TEventId, TResourceId>;
export declare function availabilityAt(availability: AvailabilitySnapshot, at: Temporal.Instant, resourceId?: ResourceId | null): AvailabilityStatus;
export declare function availabilityPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({ mode }?: AvailabilityPolicyOptions): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function belongsInTimeGridAllDayRow(interval: CalendarEventInterval): boolean;
export declare function boundsPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(bounds: {
  readonly end?: Temporal.Instant;
  readonly start?: Temporal.Instant;
}): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function busyAt<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(events: EventSnapshot<TEvent, TEventId, TResourceId>, at: Temporal.Instant, query: BusyQuery<TResourceId>): BusyStatus<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
export declare function busyResources<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(events: EventSnapshot<TEvent, TEventId, TResourceId>, range: InstantInterval | CalendarEventInterval, { exclude, resourceIds, timeZone }: BusyResourcesQuery<TEventId, TResourceId>): ReadonlyMap<TResourceId, readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[]>;
export declare function closedDates(range: PlainDateInterval, schedule: AvailabilitySchedule | null, timeZone: string): ReadonlyMap<string, ClosedDate>;
export declare function conflictPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({ mode }?: ConflictPolicyOptions): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function createAnnotationSnapshot<TData = unknown, TResourceId extends ResourceId = ResourceId>(input: readonly CalendarAnnotation<TData, TResourceId>[]): AnnotationSnapshot<TData, TResourceId>;
export declare function createAvailabilitySnapshot({ availability, resources, timeZone }: AvailabilitySnapshotInput): AvailabilitySnapshot;
export declare function createCanonicalEventAdapter<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string>(): EventAdapter<CalendarEvent<TData, TEventId, TResourceId>, TEventId, TResourceId>;
export declare function createEventPlacement<TResourceId extends ResourceId>(anchor: CalendarEventInterval, focus: CalendarEventInterval, resourceIds?: readonly TResourceId[]): CalendarEventPlacement<TResourceId>;
export declare function createEventSnapshot<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(events: readonly TEvent[], adapter: EventAdapter<TEvent, TEventId, TResourceId>, options?: EventSnapshotOptions): EventSnapshot<TEvent, TEventId, TResourceId>;
export declare function createEventSnapshotCache<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(adapter: EventAdapter<TEvent, TEventId, TResourceId>, options?: EventSnapshotOptions): EventSnapshotCache<TEvent, TEventId, TResourceId>;
export declare function createEventTransactions<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(): EventTransactions<TEvent, TEventId, TResourceId>;
export declare function createPlacementBetween<TResourceId extends ResourceId>(anchor: CalendarInteractionTarget, target: CalendarInteractionTarget, { snap }: Pick<CalendarInteractionOptions, "snap">): CalendarEventPlacement<TResourceId> | null;
export declare function createResourceTree<TResource extends ResourceTreeInput>(resources: readonly TResource[]): ResourceTree<TResource>;
export declare function defineEventAdapter<TEvent>(): <TEventId extends EventId, TResourceId extends ResourceId>(adapter: EventAdapter<TEvent, TEventId, TResourceId>) => EventAdapter<TEvent, TEventId, TResourceId>;
export declare function eventDateRanges(event: NormalizedCalendarEvent<unknown, EventId, ResourceId>, timeZone: string): readonly LocalDateRange[];
export declare function eventPlacement<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>): CalendarEventPlacement<TResourceId>;
export declare function fitsAvailability(placement: CalendarEventPlacement<ResourceId>, schedule: AvailabilitySchedule | null, timeZone: string): boolean;
export declare function formatPlacementRange(placement: CalendarEventInterval, { locale, timeZone }: {
  readonly locale?: Intl.Locale | string;
  readonly timeZone: string;
}): string;
export declare function getListRange(anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase, options?: ListViewOptions): PlainDateInterval;
export declare function getListTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase): string;
export declare function getMonthRange(anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase): PlainDateInterval;
export declare function getMonthTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase): string;
export declare function getYearRange(anchor: Temporal.PlainDate): PlainDateInterval;
export declare function getYearTitle(range: PlainDateInterval, environment: CalendarEnvironmentBase): string;
export declare function groupByResource<TItem extends {
  readonly event: {
    readonly resourceIds: readonly ResourceId[];
  };
}>(items: readonly TItem[], resources: readonly VisibleResource<unknown>[]): readonly (readonly TItem[])[];
export declare function isAnnotationId(value: unknown): value is AnnotationId;
export declare function isBusyEvent(event: {
  readonly isBusy?: boolean | undefined;
  readonly kind: CalendarEventInterval["kind"];
}): boolean;
export declare function isEventId(value: unknown): value is EventId;
export declare function isResourceId(value: unknown): value is ResourceId;
export declare function keyboardSessionProposal<TEventId extends EventId, TResourceId extends ResourceId>(session: CalendarKeyboardSession<TEventId, TResourceId>): CalendarEventProposal<TEventId, TResourceId> | null;
export declare function layoutDayGridRow<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(range: PlainDateInterval, fragments: readonly EventDayFragment<TEvent, TEventId, TResourceId>[]): DayGridRow<TEvent, TEventId, TResourceId>;
export declare function layoutTimeGrid<TFragment extends DayFragment>(columns: readonly TimeGridColumn[], fragments: readonly TFragment[], options?: TimedOverlapOptions): readonly (readonly TimeGridEventLayout<TFragment>[])[];
export declare function limitDayGridLanes<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(row: DayGridRow<TEvent, TEventId, TResourceId>, maxLanes: number): DayGridOverflow<TEvent, TEventId, TResourceId>;
export declare function listSpatialNavigation({ command, focus, projection }: CalendarSpatialNavigationInput<ListProjection<unknown, EventId, ResourceId>, unknown>): CalendarSpatialNavigation | null;
export declare function minimumDurationPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(minimum: DurationInput): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function monthSpatialNavigation({ command, environment, focus, projection }: CalendarSpatialNavigationInput<Projection$1, unknown>): CalendarSpatialNavigation | null;
export declare function moveEventPlacement<TResourceId extends ResourceId>(placement: CalendarEventPlacement<TResourceId>, delta: CalendarWallClockDelta, options: {
  readonly timeZone: string;
}): CalendarEventPlacement<TResourceId>;
export declare function moveKeyboardCursor<TEventId extends EventId, TResourceId extends ResourceId>(session: CalendarKeyboardSession<TEventId, TResourceId>, cursor: CalendarCellFocus, options: CalendarInteractionOptions): CalendarKeyboardSession<TEventId, TResourceId>;
export declare function movePlacementToTarget<TResourceId extends ResourceId>(original: CalendarEventPlacement<TResourceId>, grab: CalendarInteractionTarget, target: CalendarInteractionTarget, options: Pick<CalendarInteractionOptions, "timeZone">): CalendarEventPlacement<TResourceId>;
export declare function navigateList(anchor: Temporal.PlainDate, delta: number, options?: ListViewOptions): Temporal.PlainDate;
export declare function navigateMonth(anchor: Temporal.PlainDate, delta: number): Temporal.PlainDate;
export declare function navigateResourceTimeline(anchor: Temporal.PlainDate, delta: number, span: ResourceTimelineSpan): Temporal.PlainDate;
export declare function navigateTimeGrid(anchor: Temporal.PlainDate, delta: number, span: TimeGridSpan): Temporal.PlainDate;
export declare function navigateYear(anchor: Temporal.PlainDate, delta: number): Temporal.PlainDate;
export declare function projectList<TEvent>(input: CalendarViewProjectionInput<unknown, TEvent>): ListProjection<TEvent, EventId, ResourceId>;
export declare function projectMonth<TEvent>(input: CalendarViewProjectionInput<unknown, TEvent>): MonthProjection<TEvent, EventId, ResourceId>;
export declare function projectMonthWeeks<TEvent>({ environment, snapshot, today }: Pick<CalendarViewProjectionInput<unknown, TEvent>, "environment" | "snapshot" | "today">, range: PlainDateInterval, month: Temporal.PlainDate): MonthProjection<TEvent, EventId, ResourceId>;
export declare function projectResourceColumns<TEvent>({ environment, expandedResourceIds, overlapLayout, range, resources, snapshot, stackIndent, today, unassigned }: ResourceColumnsProjectionInput<TEvent>): ResourceColumnsProjection<TEvent>;
export declare function projectResourceTimeline<TEvent>({ environment, expandedResourceIds, instantRange, range, resources, snapshot, slotUnit, today, unassigned }: ResourceTimelineProjectionInput<TEvent>): ResourceTimelineProjection<TEvent>;
export declare function projectTimeGrid<TEvent>({ environment, overlapLayout, range, snapshot, stackIndent, today }: TimeGridProjectionInput<TEvent>): TimeGridProjection<TEvent>;
export declare function projectTimeGridAnnotations<TSource extends CalendarAnnotationSource, TData>(columns: readonly TimeGridColumn[], snapshot: AnnotationSnapshot<TData>, sources: readonly TSource[], geometry?: TimeGridAnnotationGeometry): readonly (readonly TimeGridAnnotationMark<TSource, TData>[])[];
export declare function projectTimeGridAvailability(columns: readonly TimeGridColumn[], schedule: AvailabilitySchedule | null): readonly (readonly AvailabilityBand[])[];
export declare function projectTimelineAvailability(columns: readonly TimeGridColumn[], schedule: AvailabilitySchedule | null): readonly AvailabilityExtent[];
export declare function projectYear<TEvent>(input: CalendarViewProjectionInput<unknown, TEvent>): YearProjection<TEvent, EventId, ResourceId>;
export declare function queryVisibleEvents<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(snapshot: EventSnapshot<TEvent, TEventId, TResourceId>, range: PlainDateInterval, timeZone: string): readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[];
export declare function readOnlyPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function readOnlyResourcesPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(isReadOnly: (resourceId: TResourceId) => boolean): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function resizeEventPlacement<TResourceId extends ResourceId>(placement: CalendarEventPlacement<TResourceId>, edge: "start" | "end", delta: CalendarWallClockDelta, options: {
  readonly minimumDuration?: DurationInput;
  readonly timeZone: string;
}): CalendarEventPlacement<TResourceId>;
export declare function resizePlacementToTarget<TResourceId extends ResourceId>(original: CalendarEventPlacement<TResourceId>, edge: "start" | "end", grab: CalendarInteractionTarget, target: CalendarInteractionTarget, { snap, timeZone }: CalendarInteractionOptions): CalendarEventPlacement<TResourceId> | null;
export declare function resolveSecondaryTimeZones(input: unknown): ResolvedSecondaryTimeZones;
export declare function resolveViewInstantRange(range: PlainDateInterval, timeZone: string): InstantInterval;
export declare function resolveViewLoadRange<TOptions>(strategy: Pick<CalendarViewStrategy<unknown, TOptions>, "getLoadRange">, anchor: Temporal.PlainDate, environment: CalendarEnvironmentBase, options: TOptions, range: PlainDateInterval): PlainDateInterval;
export declare function resourceColumnsSpatialNavigation(input: CalendarSpatialNavigationInput<ResourceColumnsProjection<unknown>, unknown>): CalendarSpatialNavigation | null;
export declare function resourceColumnsStrategy<TOptions extends ResourceVisibilityOptions = ResourceVisibilityOptions, TEvent = unknown>(span: TimeGridSpan): CalendarViewStrategy<ResourceColumnsProjection<TEvent>, TOptions, TEvent>;
export declare function resourceStatusAt<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(availability: AvailabilitySnapshot, events: EventSnapshot<TEvent, TEventId, TResourceId>, at: Temporal.Instant, query: BusyQuery<TResourceId>): ResourceStatus<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>>;
export declare function resourceTimelineRange(anchor: Temporal.PlainDate, span: ResourceTimelineSpan, weekRules: CalendarWeekRules): PlainDateInterval;
export declare function resourceTimelineSpatialNavigation(input: Input): CalendarSpatialNavigation | null;
export declare function resourceTimelineStrategy<TOptions extends ResourceTimelineOptions = ResourceTimelineOptions, TEvent = unknown>(span: ResourceTimelineSpan): CalendarViewStrategy<ResourceTimelineProjection<TEvent>, TOptions, TEvent>;
export declare function resourceTimelineTitle(range: PlainDateInterval, span: ResourceTimelineSpan, locale: Intl.Locale | string): string;
export declare function sameFocus(left: CalendarFocus | null, right: CalendarFocus | null): boolean;
export declare function scrollingListStrategy<TOptions extends ListViewOptions | undefined = ListViewOptions, TEvent = unknown>(): CalendarViewStrategy<ListProjection<TEvent, EventId, ResourceId>, TOptions, TEvent>;
export declare function scrollingMonthAnchor(firstWeek: Temporal.PlainDate): Temporal.PlainDate;
export declare function scrollingMonthOf(range: PlainDateInterval): Temporal.PlainDate;
export declare function scrollingMonthStrategy<TOptions = undefined, TEvent = unknown>(weeks?: number): CalendarViewStrategy<MonthProjection<TEvent, EventId, ResourceId>, TOptions, TEvent>;
export declare function scrollingTimeGridStrategy<TOptions = undefined, TEvent = unknown>(span: TimeGridSpan): CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent>;
export declare function showsInResource(resourceIds: readonly ResourceId[], resourceId: ResourceId | null): boolean;
export declare function slotDuration({ increment, smallestUnit }: WallTimeSnapOptions): Temporal.Duration;
export declare function snapPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(increment: DurationInput): CalendarPolicy<TEvent, TEventId, TResourceId>;
export declare function splitEventsByDay<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(events: readonly NormalizedCalendarEvent<TEvent, TEventId, TResourceId>[], range: PlainDateInterval, timeZone: string): readonly EventDayFragment<TEvent, TEventId, TResourceId>[];
export declare function startKeyboardSession<TEventId extends EventId, TResourceId extends ResourceId>(start: CalendarKeyboardSessionStart<TEventId, TResourceId>, options: CalendarInteractionOptions): CalendarKeyboardSession<TEventId, TResourceId>;
export declare function summarizeAnnotationMarks<TSource extends CalendarAnnotationSource>(marks: readonly TimeGridAnnotationMark<TSource, unknown>[]): readonly AnnotationSourceSummary<TSource>[];
export declare function timeGridColumns(range: PlainDateInterval, timeZone: string): readonly TimeGridColumn[];
export declare function timeGridDateTimeAt(column: TimeGridColumn, y: number, options?: TimeGridPointOptions): Temporal.ZonedDateTime;
export declare function timeGridPosition(columns: readonly TimeGridColumn[], instant: Temporal.Instant): TimeGridPosition | null;
export declare function timeGridRange(anchor: Temporal.PlainDate, span: TimeGridSpan, weekRules: CalendarWeekRules): PlainDateInterval;
export declare function timeGridSpatialNavigation(input: CalendarSpatialNavigationInput<TimeGridProjection<unknown>, unknown>): CalendarSpatialNavigation | null;
export declare function timeGridStrategy<TOptions = undefined, TEvent = unknown>(span: TimeGridSpan): CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent>;
export declare function timeGridTitle(range: PlainDateInterval, locale: Intl.Locale | string): string;
export declare function timeGridZoneAxis(columns: readonly TimeGridColumn[], timeZone: string, options?: TimeGridZoneAxisOptions): TimeGridZoneAxis | null;
export declare function timeGridZoneRows(column: TimeGridColumn, timeZone: string, step?: number): readonly TimeGridZoneRow[];
export declare function timeGridZoneTimes(column: TimeGridColumn, wallTime: Temporal.PlainTime, timeZone: string): readonly TimeGridZoneTime[];
export declare function timedFragmentBox(column: TimeGridColumn, interval: InstantInterval): TimeGridBand;
export declare function timelineExtent(columns: readonly TimeGridColumn[], interval: CalendarEventInterval): TimelineExtent | null;
export declare function timelinePosition(columns: readonly TimeGridColumn[], instant: Temporal.Instant): number | null;
export declare function toAllDayPlacement<TResourceId extends ResourceId>(placement: CalendarEventPlacement<TResourceId>, options: {
  readonly timeZone: string;
}): Extract<CalendarEventPlacement<TResourceId>, {
  readonly kind: "all-day";
}>;
export declare function toTimedPlacement<TResourceId extends ResourceId>(placement: CalendarEventPlacement<TResourceId>, start: Temporal.ZonedDateTime, duration: DurationInput): CalendarEventPlacement<TResourceId>;
export declare function validateCalendarEvent<TEvent extends CalendarEvent<unknown, EventId, ResourceId>>(event: TEvent): CalendarEventContractValidation<ValidatedCalendarEvent<TEvent>>;
export declare function validateCalendarEventInterval<TInstant, TPlainDate, TPlainDateTime, TInterval extends CalendarEventIntervalOf<TInstant, TPlainDate, TPlainDateTime>>(interval: TInterval, comparators: CalendarEventIntervalComparators<TInstant, TPlainDate, TPlainDateTime>): CalendarEventContractValidation<ValidatedCalendarEventInterval<TInterval>>;
declare const validatedCalendarEvent: unique symbol;
declare const validatedCalendarEventInterval: unique symbol;
export declare function visibleInstantRange(range: PlainDateInterval, timeZone: string): InstantInterval | null;
export declare function visibleResources<TResource>(tree: ResourceTree<TResource>, expandedResourceIds: readonly ResourceId[], { unassigned }?: ResourceVisibilityOptions): readonly VisibleResource<TResource>[];
export declare function withAsciiSpaces(text: string): string;
export declare function yearSpatialNavigation({ command, environment, focus, projection }: CalendarSpatialNavigationInput<Projection, unknown>): CalendarSpatialNavigation | null;

export {
  type AllDayCalendarEvent,
  type AllDayCalendarEventInterval,
  type AnnotationId,
  type AnnotationSnapshot,
  type AnnotationSnapshotIssue,
  type AnnotationSourceSummary,
  type AvailabilityBand,
  type AvailabilityException,
  type AvailabilityExtent,
  type AvailabilityHours,
  type AvailabilityIssue,
  type AvailabilityPolicyOptions,
  type AvailabilityRule,
  type AvailabilitySchedule,
  type AvailabilitySnapshot,
  type AvailabilitySnapshotInput,
  type AvailabilityStatus,
  type BusyQuery,
  type BusyResourcesQuery,
  type BusyStatus,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
  type CalendarAnnouncementBuilder,
  type CalendarAnnouncementContext,
  type CalendarAnnouncementMessages,
  type CalendarAnnouncer,
  type CalendarAvailability,
  type CalendarCellFocus,
  type CalendarChangeCause,
  type CalendarDayFocus,
  type CalendarDirection,
  type CalendarDraft,
  type CalendarEntityId,
  type CalendarEnvironment,
  type CalendarEnvironmentBase,
  type CalendarEvent,
  type CalendarEventBase,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventContractValidation,
  type CalendarEventCreateChange,
  type CalendarEventDeleteChange,
  type CalendarEventFocus,
  type CalendarEventInput,
  type CalendarEventInterval,
  type CalendarEventIntervalComparators,
  type CalendarEventIntervalOf,
  type CalendarEventPlacement,
  type CalendarEventPlacementInput,
  type CalendarEventProposal,
  type CalendarEventSource,
  type CalendarEventUpdateChange,
  type CalendarEventValidationIssue,
  type CalendarFocus,
  type CalendarInteractionCause,
  type CalendarInteractionCheck,
  type CalendarInteractionOptions,
  type CalendarInteractionPhase,
  type CalendarInteractionTarget,
  type CalendarInteractionUpdate,
  type CalendarKeyboardSession,
  type CalendarKeyboardSessionStart,
  type CalendarNavigationCommand,
  type CalendarNowSource,
  type CalendarPendingPlacements,
  type CalendarPolicy,
  type CalendarPolicyContext,
  type CalendarPolicyDecision,
  type CalendarPolicyResult,
  type CalendarResource,
  type CalendarSecondaryTimeZone,
  type CalendarSelection,
  type CalendarSlotFocus,
  type CalendarSpatialNavigation,
  type CalendarSpatialNavigationInput,
  type CalendarTransactionContext,
  type CalendarTransactionResult,
  type CalendarViewProjectionInput,
  type CalendarViewStrategy,
  type CalendarWallClockDelta,
  type CalendarWeekRules,
  type ClosedDate,
  type ClosedTime,
  type ConflictPolicyOptions,
  type DayGridOverflow,
  type DayGridRow,
  type DayGridSegment,
  type EventAdapter,
  type EventAdapterAccessor,
  type EventDayFragment,
  type EventId,
  type EventSnapshot,
  type EventSnapshotCache,
  type EventSnapshotIssue,
  type EventSnapshotOptions,
  type EventSnapshotQueryCacheStatistics,
  type EventSnapshotQueryOptions,
  type EventTransactions,
  type FloatingCalendarEvent,
  type FloatingCalendarEventInterval,
  type InvalidCalendarEventPolicy,
  type IsoDayOfWeek,
  type ListDay,
  type ListItem,
  type ListProjection,
  type ListViewOptions,
  type LocalDateRange,
  type MonthDay,
  type MonthProjection,
  type MonthWeek,
  type NormalizedAllDayCalendarEvent,
  type NormalizedCalendarEvent,
  type NormalizedFloatingCalendarEvent,
  type NormalizedTimedCalendarEvent,
  type OverlapLayout,
  type OverlapLayoutOptions,
  type ResolvedSecondaryTimeZones,
  type ResourceAvailability,
  type ResourceColumn,
  type ResourceColumnsProjection,
  type ResourceColumnsProjectionInput,
  type ResourceId,
  type ResourceStatus,
  type ResourceTimelineBar,
  type ResourceTimelineDayRow,
  type ResourceTimelineHourRow,
  type ResourceTimelineOptions,
  type ResourceTimelineProjection,
  type ResourceTimelineProjectionInput,
  type ResourceTimelineSpan,
  type ResourceTree,
  type ResourceTreeInput,
  type ResourceTreeNode,
  type ResourceVisibilityOptions,
  type SecondaryTimeZoneIssue,
  type TimeGridAnnotationGeometry,
  type TimeGridAnnotationMark,
  type TimeGridBand,
  type TimeGridColumn,
  type TimeGridDay,
  type TimeGridEventLayout,
  type TimeGridPointOptions,
  type TimeGridPosition,
  type TimeGridProjection,
  type TimeGridProjectionInput,
  type TimeGridSpan,
  type TimeGridZoneAxis,
  type TimeGridZoneAxisOptions,
  type TimeGridZoneRow,
  type TimeGridZoneShift,
  type TimeGridZoneTime,
  type TimedCalendarEvent,
  type TimedCalendarEventInterval,
  type TimedOverlapOptions,
  type TimelineExtent,
  type UnavailableReason,
  type ValidatedCalendarEvent,
  type ValidatedCalendarEventInterval,
  type VisibleResource,
  type YearDay,
  type YearMonth,
  type YearProjection,
  type YearWeek,
};
```
