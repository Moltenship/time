import type {
  CalendarEventChange,
  CalendarEventInterval,
  CalendarEventPlacement,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

import type { EventRecurrence, RecurrenceDate, RecurrenceOccurrence } from "../types";
import type { RecurrenceOrdinalShift } from "./ordinals";

/**
 * Which occurrences an edit to one occurrence applies to: `"this"` one, this and the
 * `"following"` ones, or `"all"` of them. The registry's scope dialog declares the same union.
 */
export type RecurrenceEditScope = "this" | "following" | "all";

/**
 * What the calendar hands `onEventChange` for events fed through `createOccurrenceAdapter`: a change
 * whose event is an occurrence, or a create.
 */
export type RecurrenceOccurrenceChange<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> = CalendarEventChange<RecurrenceOccurrence<TEvent, TEventId>, EventId, TResourceId>;

/** A change to an occurrence of a series: what `isRecurringChange` lets through. */
export type RecurringOccurrenceChange<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> = Exclude<RecurrenceOccurrenceChange<TEvent, TEventId, TResourceId>, { cause: "create" }> & {
  readonly event: RecurrenceOccurrence<TEvent, TEventId> & {
    readonly recurrence: NonNullable<RecurrenceOccurrence<TEvent, TEventId>["recurrence"]>;
  };
};

export interface ResolveRecurrenceEditOptions<TEvent, TEventId extends EventId = EventId> {
  /** Where timed series without `sourceTimeZone` repeat: the expander's `defaultTimeZone`. */
  readonly defaultTimeZone?: string;
  /** Most loop steps a `"following"` edit's search for the previous occurrence may take. */
  readonly maxIterations?: number;
  /**
   * The ID the series a `"following"` edit starts will have, when the application picks IDs
   * itself, as it does for optimistic creates. With it, `newSeries.id` and `occurrenceIds` name
   * the new series' occurrences; without it, `occurrenceIds` leaves them out.
   */
  readonly newSeriesId?: TEventId;
  /**
   * The occurrences the application shows, such as the expansion it hands the calendar, so
   * `occurrenceIds` maps their IDs too and selection and focus can follow them.
   */
  readonly occurrences?: readonly RecurrenceOccurrence<TEvent, TEventId>[];
  /**
   * The calendar's time zone, which the user moves occurrences on. With it, a timed series dragged
   * by whole days there moves by whole days on its own clock and keeps its time of day, as
   * `"all"` and `"following"` should, even in a week when the calendar's zone has changed DST and
   * the series' hasn't. Without it, the series takes the time the occurrence was dropped at, which
   * is an hour off then.
   */
  readonly timeZone?: string;
}

/** The series' master after the edit. Write `placement` and `recurrence` over the stored ones. */
export type RecurrenceSeriesWrite<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | { readonly action: "keep" }
  | {
      readonly action: "update";
      readonly event: TEvent;
      readonly eventId: TEventId;
      /** The first occurrence's interval and resources. */
      readonly placement: CalendarEventPlacement<TResourceId>;
      /** The whole recurrence, which replaces the stored one. */
      readonly recurrence: EventRecurrence;
    }
  | { readonly action: "delete"; readonly event: TEvent; readonly eventId: TEventId };

/** The series a `"following"` edit starts at the edited occurrence. */
export interface RecurrenceNewSeries<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The master to copy the title, data and everything but placement and recurrence from. */
  readonly from: TEvent;
  /** `options.newSeriesId`, when the application gave one. */
  readonly id?: TEventId;
  /** Its first occurrence: where the edited occurrence went. */
  readonly placement: CalendarEventPlacement<TResourceId>;
  readonly recurrence: EventRecurrence;
}

/** What happens to the override of the edited occurrence. */
export type RecurrenceOverrideWrite<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | {
      readonly action: "create";
      /** The master to copy the title, data and the rest from. */
      readonly from: TEvent;
      readonly placement: CalendarEventPlacement<TResourceId>;
      readonly recurrenceId: RecurrenceDate;
      readonly seriesId: TEventId;
    }
  | {
      readonly action: "update";
      /** Set when the override now marks a deleted occurrence, as `RecurrenceOverride.cancelled`. */
      readonly cancelled?: true;
      readonly event: TEvent;
      readonly eventId: TEventId;
      readonly placement: CalendarEventPlacement<TResourceId>;
      readonly recurrenceId: RecurrenceDate;
      /** `"new"`: it now belongs to `newSeries`, so its series ID becomes the new master's. */
      readonly series: "current" | "new";
    }
  | { readonly action: "delete"; readonly event: TEvent; readonly eventId: TEventId };

/**
 * How original starts move: from the old series' time to the new one's. Read it through
 * `recurrenceOverrideEdit`; its fields may change.
 */
export interface RecurrenceKeyShift {
  /** An original start that maps exactly, such as the first occurrence to its new start. */
  readonly anchor?: { readonly from: RecurrenceDate; readonly to: RecurrenceDate };
  /** Calendar days, which is all whole-day dates move by. */
  readonly days: number;
  /** The old series' first occurrence, whose kind keys arrive in. */
  readonly first: CalendarEventInterval;
  /** The new kind of the series' dates. */
  readonly kind: CalendarEventInterval["kind"];
  /** How an ordinal weekday rule moves each date within its month or year. */
  readonly ordinals?: RecurrenceOrdinalShift;
  /**
   * The zone the old series repeated in, for a timed one; else the zone instants are read in, as
   * the expander's `defaultTimeZone` is.
   */
  readonly timeZone: string;
  /** The zone the new series repeats in. */
  readonly toTimeZone: string;
  /** The change on the series' wall clock. */
  readonly wall: Temporal.Duration;
  /**
   * The time of day a timed series repeats at, which reads back the starts a DST gap moved
   * forward.
   */
  readonly wallTime?: Temporal.PlainTime;
}

/**
 * What happens to the series' overrides other than the edited occurrence's. The application may
 * not have them all loaded, so the edit describes a rule: apply `recurrenceOverrideEdit` to every
 * override of `seriesId` it stores.
 */
export interface RecurrenceOverridesRule {
  /** `"rekey"`: they replace the same occurrences, whose original starts move by `shift`. */
  readonly action: "delete" | "keep" | "rekey";
  /** Only overrides of occurrences after this original start; all of them when absent. */
  readonly after?: RecurrenceDate;
  /** `"new"`: they move to `newSeries`. */
  readonly series: "current" | "new";
  readonly shift?: RecurrenceKeyShift;
}

/** What `recurrenceOverrideEdit` says to do with one stored override. */
export type RecurrenceOverrideRekey =
  | { readonly action: "delete" }
  | { readonly action: "keep" }
  | {
      readonly action: "update";
      /** Its new original start. Its own placement stays. */
      readonly recurrenceId: RecurrenceDate;
      readonly series: "current" | "new";
    };

/** A change to a one-off event, or a create, which needs no scope: the event unwrapped. */
export interface RecurrenceEventEdit<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly type: "event";
}

/**
 * What to persist for a change to an occurrence. Writes are plain data: the master, the series a
 * `"following"` edit starts, the edited occurrence's override and a rule for the other overrides.
 * Only placement and recurrence are described; copy anything else an `"update"` changed, such as
 * the title, yourself.
 */
export interface RecurrenceSeriesEdit<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly cause: "move" | "resize-start" | "resize-end" | "update" | "delete";
  /**
   * Old occurrence IDs to new ones, for selection and focus: the edited occurrence's and those in
   * `options.occurrences` whose IDs change. `"this"` keeps IDs, so its map is empty.
   */
  readonly occurrenceIds: ReadonlyMap<EventId, string>;
  /** The series' other overrides. */
  readonly otherOverrides: RecurrenceOverridesRule;
  /** The edited occurrence's override, when it has or gets one. */
  readonly override?: RecurrenceOverrideWrite<TEvent, TEventId, TResourceId>;
  /** The series a `"following"` edit starts. */
  readonly newSeries?: RecurrenceNewSeries<TEvent, TEventId, TResourceId>;
  /** The edited occurrence's original start. */
  readonly recurrenceId: RecurrenceDate;
  /** The scope applied: `"following"` on the first occurrence is `"all"`. */
  readonly scope: RecurrenceEditScope;
  readonly series: RecurrenceSeriesWrite<TEvent, TEventId, TResourceId>;
  readonly seriesId: TEventId;
  readonly type: "series";
}

export type RecurrenceEditRejectionReason =
  /** The date kinds don't match the series, as `coerceRecurrenceDate` decides. */
  | "date-kind-mismatch"
  /** `"following"` from an occurrence only RDATE adds, which no rule can continue from. */
  | "extra-occurrence"
  /** The engine can't expand the rule, or the one the edit would write. */
  | "invalid-rule"
  /** The series' or the placement's zone isn't one Temporal knows. */
  | "invalid-time-zone"
  /** The search for the previous occurrence ran past `maxIterations`. */
  | "iteration-limit"
  /** `"following"` or `"all"` on an override whose master isn't loaded, or isn't a master. */
  | "missing-series"
  /** The rule can't follow the change, such as a BYSETPOS rule moved to another day. */
  | "rule-cannot-move"
  /** The rule doesn't produce the occurrence any more. */
  | "unknown-occurrence"
  /** The engine doesn't handle the rule, or the one the edit would write. */
  | "unsupported-rule";

export interface RecurrenceEditRejection {
  readonly message: string;
  readonly reason: RecurrenceEditRejectionReason;
  readonly type: "rejected";
}

export type RecurrenceEdit<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> =
  | RecurrenceEventEdit<TEvent, TEventId, TResourceId>
  | RecurrenceSeriesEdit<TEvent, TEventId, TResourceId>
  | RecurrenceEditRejection;
