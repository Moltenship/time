# @moltenship/calendar-recurrence API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-recurrence`

```ts
import {
  CalendarEvent,
  CalendarEventChange,
  CalendarEventInterval,
  CalendarEventPlacement,
  EventAdapter,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  IcsEvent,
  IcsExtensionsConfig,
  IcsIssueCode,
  IcsRecurrenceRule,
  IcsWeekdayNumber,
} from "@moltenship/ics";

interface ApplyRecurrenceEditOptions<TData, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly createId: (event: Omit<RecurringCalendarEvent<TData, TEventId, TResourceId>, "id">) => TEventId;
}
type Change<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = RecurringOccurrenceChange<TEvent, TEventId, TResourceId>;
interface CoerceRecurrenceDateOptions {
  readonly defaultTimeZone?: string;
}
export declare const DEFAULT_MAX_ITERATIONS = 1e5;
type Event<TData, TEventId extends EventId, TResourceId extends ResourceId> = RecurringCalendarEvent<TData, TEventId, TResourceId>;
interface EventRecurrence {
  readonly duration?: Temporal.Duration;
  readonly exceptionDates?: readonly RecurrenceDate[];
  readonly recurrenceDates?: readonly (RecurrenceDate | RecurrencePeriod)[];
  readonly rule?: RecurrenceRule;
  readonly wallStart?: Temporal.PlainDateTime;
}
interface IcsRecurrenceIssue<TExtensions extends IcsExtensionsConfig = {}> {
  readonly code: IcsRecurrenceIssueCode;
  readonly event: IcsEvent<TExtensions>;
  readonly index: number;
  readonly message: string;
  readonly property?: string;
}
type IcsRecurrenceIssueCode = "date-kind-mismatch" | "duplicate-event" | "invalid-period" | "unresolved-time-zone" | "unsupported-rule";
interface IcsRecurringEvents<TExtensions extends IcsExtensionsConfig = {}> {
  readonly events: readonly RecurringCalendarEvent<IcsEvent<TExtensions>>[];
  readonly issues: readonly IcsRecurrenceIssue<TExtensions>[];
}
interface IcsRecurringEventsOptions {
  readonly minimumDuration?: Temporal.DurationLike;
  readonly timeZone?: string;
}
interface OccurrenceExpander<TEvent, TEventId extends EventId = EventId> {
  expand(events: readonly TEvent[], range: OccurrenceRange): OccurrenceExpansion<TEvent, TEventId>;
}
interface OccurrenceExpanderOptions {
  readonly defaultTimeZone?: string;
  readonly maxIterations?: number;
}
interface OccurrenceExpansion<TEvent, TEventId extends EventId = EventId> {
  readonly issues: readonly RecurrenceIssue<TEvent, TEventId>[];
  readonly occurrences: readonly RecurrenceOccurrence<TEvent, TEventId>[];
}
interface OccurrenceRange {
  readonly range: Readonly<{
    end: Temporal.PlainDate;
    start: Temporal.PlainDate;
  }>;
  readonly timeZone: string;
}
interface OccurrenceRecurrence<TEvent, TEventId extends EventId = EventId> {
  readonly recurrenceId: RecurrenceDate;
  readonly override?: TEvent;
  readonly series?: TEvent;
  readonly seriesId: TEventId;
}
interface RecurrenceAdapter<TEvent, TEventId extends EventId = EventId> {
  getRecurrence(event: TEvent): EventRecurrence | undefined;
  getOverride?(event: TEvent): RecurrenceOverride<TEventId> | undefined;
}
interface RecurrenceAdapters<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly event: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly recurrence: RecurrenceAdapter<TEvent, TEventId>;
}
type RecurrenceDate = Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;
type RecurrenceDateRole = "exception" | "start" | "until";
type RecurrenceEdit<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = RecurrenceEventEdit<TEvent, TEventId, TResourceId> | RecurrenceSeriesEdit<TEvent, TEventId, TResourceId> | RecurrenceEditRejection;
interface RecurrenceEditRejection {
  readonly message: string;
  readonly reason: RecurrenceEditRejectionReason;
  readonly type: "rejected";
}
type RecurrenceEditRejectionReason = "date-kind-mismatch" | "extra-occurrence" | "invalid-rule" | "invalid-time-zone" | "iteration-limit" | "missing-series" | "rule-cannot-move" | "unknown-occurrence" | "unsupported-rule";
type RecurrenceEditScope = "this" | "following" | "all";
interface RecurrenceEventEdit<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly type: "event";
}
interface RecurrenceIssue<TEvent, TEventId extends EventId = EventId> {
  readonly code: "adapter-error" | "date-kind-mismatch" | "conflicting-recurrence" | "duplicate-event-id" | "duplicate-override" | "invalid-rule" | "invalid-time-zone" | "iteration-limit" | "missing-series" | "unsupported-rule";
  readonly event: TEvent;
  readonly eventId?: TEventId;
  readonly index?: number;
  readonly message?: string;
}
interface RecurrenceKeyShift {
  readonly anchor?: {
    readonly from: RecurrenceDate;
    readonly to: RecurrenceDate;
  };
  readonly days: number;
  readonly first: CalendarEventInterval;
  readonly kind: CalendarEventInterval["kind"];
  readonly ordinals?: RecurrenceOrdinalShift;
  readonly timeZone: string;
  readonly toTimeZone: string;
  readonly wall: Temporal.Duration;
  readonly wallTime?: Temporal.PlainTime;
}
interface RecurrenceNewSeries<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly from: TEvent;
  readonly id?: TEventId;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrence: EventRecurrence;
}
interface RecurrenceOccurrence<TEvent, TEventId extends EventId = EventId> {
  readonly event: TEvent;
  readonly id: TEventId | string;
  readonly interval: CalendarEventInterval;
  readonly recurrence?: OccurrenceRecurrence<TEvent, TEventId>;
}
type RecurrenceOccurrenceChange<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = CalendarEventChange<RecurrenceOccurrence<TEvent, TEventId>, EventId, TResourceId>;
interface RecurrenceOrdinalShift {
  readonly entries: readonly {
    readonly from: IcsWeekdayNumber;
    readonly to: IcsWeekdayNumber;
  }[];
  readonly period: "month" | "year";
}
interface RecurrenceOverride<TEventId extends EventId = EventId> {
  readonly cancelled?: boolean;
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: TEventId;
}
type RecurrenceOverrideRekey = {
  readonly action: "delete";
} | {
  readonly action: "keep";
} | {
  readonly action: "update";
  readonly recurrenceId: RecurrenceDate;
  readonly series: "current" | "new";
};
type RecurrenceOverrideWrite<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly action: "create";
  readonly from: TEvent;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: TEventId;
} | {
  readonly action: "update";
  readonly cancelled?: true;
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrenceId: RecurrenceDate;
  readonly series: "current" | "new";
} | {
  readonly action: "delete";
  readonly event: TEvent;
  readonly eventId: TEventId;
};
interface RecurrenceOverridesRule {
  readonly action: "delete" | "keep" | "rekey";
  readonly after?: RecurrenceDate;
  readonly series: "current" | "new";
  readonly shift?: RecurrenceKeyShift;
}
interface RecurrencePeriod {
  readonly end: RecurrenceDate;
  readonly start: RecurrenceDate;
}
type RecurrenceRule = Omit<IcsRecurrenceRule, "until"> & {
  readonly until?: RecurrenceDate;
};
export declare class RecurrenceRuleError extends RangeError {
  readonly code: RecurrenceRuleErrorCode;
  constructor(code: RecurrenceRuleErrorCode, message: string);
}
type RecurrenceRuleErrorCode = "invalid-rule" | "invalid-time-zone" | "unsupported-rule";
interface RecurrenceRuleExpansion {
  readonly dates: readonly RecurrenceDate[];
  readonly truncated: boolean;
}
type RecurrenceRuleStart = CalendarEventInterval & {
  readonly wallStart?: Temporal.PlainDateTime;
};
interface RecurrenceRuleTextIssue {
  readonly code: IcsIssueCode;
  readonly message: string;
  readonly severity: "error" | "warning";
}
interface RecurrenceRuleTextResult {
  readonly issues: readonly RecurrenceRuleTextIssue[];
  readonly rule?: RecurrenceRule;
}
interface RecurrenceRuleWindow {
  readonly before?: RecurrenceDate;
  readonly from?: RecurrenceDate;
  readonly maxIterations?: number;
}
interface RecurrenceSeriesEdit<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly cause: "move" | "resize-start" | "resize-end" | "update" | "delete";
  readonly occurrenceIds: ReadonlyMap<EventId, string>;
  readonly otherOverrides: RecurrenceOverridesRule;
  readonly override?: RecurrenceOverrideWrite<TEvent, TEventId, TResourceId>;
  readonly newSeries?: RecurrenceNewSeries<TEvent, TEventId, TResourceId>;
  readonly recurrenceId: RecurrenceDate;
  readonly scope: RecurrenceEditScope;
  readonly series: RecurrenceSeriesWrite<TEvent, TEventId, TResourceId>;
  readonly seriesId: TEventId;
  readonly type: "series";
}
type RecurrenceSeriesWrite<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = {
  readonly action: "keep";
} | {
  readonly action: "update";
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrence: EventRecurrence;
} | {
  readonly action: "delete";
  readonly event: TEvent;
  readonly eventId: TEventId;
};
type RecurringCalendarEvent<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string> = CalendarEvent<TData, TEventId, TResourceId> & {
  readonly override?: RecurrenceOverride<TEventId>;
  readonly recurrence?: EventRecurrence;
};
type RecurringOccurrenceChange<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = Exclude<RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>, {
  cause: "create";
}> & {
  readonly event: RecurrenceOccurrence<TEvent, TEventId> & {
    readonly recurrence: NonNullable<RecurrenceOccurrence<TEvent, TEventId>["recurrence"]>;
  };
};
interface ResolveRecurrenceEditOptions<TEvent, TEventId extends EventId = EventId> {
  readonly defaultTimeZone?: string;
  readonly maxIterations?: number;
  readonly newSeriesId?: TEventId;
  readonly occurrences?: readonly RecurrenceOccurrence<TEvent, TEventId>[];
  readonly timeZone?: string;
}
export declare function applyRecurrenceEdit<TData, TEventId extends EventId, TResourceId extends ResourceId>(events: readonly Event<TData, TEventId, TResourceId>[], edit: RecurrenceSeriesEdit<Event<TData, TEventId, TResourceId>, TEventId, TResourceId>, options: ApplyRecurrenceEditOptions<TData, TEventId, TResourceId>): Event<TData, TEventId, TResourceId>[];
export declare function coerceRecurrenceDate(date: RecurrenceDate, first: CalendarEventInterval, role: RecurrenceDateRole, options?: CoerceRecurrenceDateOptions): RecurrenceDate | undefined;
export declare function createCanonicalRecurrenceAdapter<TData = unknown, TEventId extends EventId = string, TResourceId extends ResourceId = string>(): RecurrenceAdapters<RecurringCalendarEvent<TData, TEventId, TResourceId>, TEventId, TResourceId>;
export declare function createOccurrenceAdapter<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>): EventAdapter<RecurrenceOccurrence<TEvent, TEventId>, TEventId | string, TResourceId>;
export declare function createOccurrenceExpander<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>, options?: OccurrenceExpanderOptions): OccurrenceExpander<TEvent, TEventId>;
export declare function expandRecurrenceRule(rule: RecurrenceRule, first: RecurrenceRuleStart, window?: RecurrenceRuleWindow): RecurrenceRuleExpansion;
export declare function formatRecurrenceRule(rule: RecurrenceRule): string;
export declare function isRecurringChange<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>): change is Change<TEvent, TEventId, TResourceId>;
export declare function occurrenceId(seriesId: EventId, recurrenceId: RecurrenceDate): string;
export declare function parseOccurrenceId(id: EventId): {
  readonly recurrenceKey: string;
  readonly seriesId: string;
} | undefined;
export declare function parseRecurrenceRule(text: string): RecurrenceRuleTextResult;
export declare function recurrenceEditScopes<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>, adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>, options?: ResolveRecurrenceEditOptions<TEvent, TEventId>): readonly RecurrenceEditScope[];
export declare function recurrenceKey(recurrenceId: RecurrenceDate): string;
export declare function recurrenceOverrideEdit<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(edit: RecurrenceSeriesEdit<TEvent, TEventId, TResourceId>, recurrenceId: RecurrenceDate): RecurrenceOverrideRekey;
export declare function recurrenceRuleFromIcs(rule: IcsRecurrenceRule): RecurrenceRuleTextResult;
export declare function recurrenceRuleToIcs(rule: RecurrenceRule): IcsRecurrenceRule;
export declare function recurringEventsFromIcs<TExtensions extends IcsExtensionsConfig = {}>(events: readonly IcsEvent<TExtensions>[], options?: IcsRecurringEventsOptions): IcsRecurringEvents<TExtensions>;
export declare function resolveRecurrenceEdit<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(change: RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>, scope: RecurrenceEditScope, adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>, options?: ResolveRecurrenceEditOptions<TEvent, TEventId>): RecurrenceEdit<TEvent, TEventId, TResourceId>;

export {
  type ApplyRecurrenceEditOptions,
  type CoerceRecurrenceDateOptions,
  type EventRecurrence,
  type IcsRecurrenceIssue,
  type IcsRecurrenceIssueCode,
  type IcsRecurringEvents,
  type IcsRecurringEventsOptions,
  type OccurrenceExpander,
  type OccurrenceExpanderOptions,
  type OccurrenceExpansion,
  type OccurrenceRange,
  type OccurrenceRecurrence,
  type RecurrenceAdapter,
  type RecurrenceAdapters,
  type RecurrenceDate,
  type RecurrenceDateRole,
  type RecurrenceEdit,
  type RecurrenceEditRejection,
  type RecurrenceEditRejectionReason,
  type RecurrenceEditScope,
  type RecurrenceEventEdit,
  type RecurrenceIssue,
  type RecurrenceKeyShift,
  type RecurrenceNewSeries,
  type RecurrenceOccurrence,
  type RecurrenceOccurrenceChange,
  type RecurrenceOrdinalShift,
  type RecurrenceOverride,
  type RecurrenceOverrideRekey,
  type RecurrenceOverrideWrite,
  type RecurrenceOverridesRule,
  type RecurrencePeriod,
  type RecurrenceRule,
  type RecurrenceRuleErrorCode,
  type RecurrenceRuleExpansion,
  type RecurrenceRuleStart,
  type RecurrenceRuleTextIssue,
  type RecurrenceRuleTextResult,
  type RecurrenceRuleWindow,
  type RecurrenceSeriesEdit,
  type RecurrenceSeriesWrite,
  type RecurringCalendarEvent,
  type RecurringOccurrenceChange,
  type ResolveRecurrenceEditOptions,
};
```
