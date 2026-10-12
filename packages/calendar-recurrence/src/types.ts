import type {
  CalendarEvent,
  CalendarEventInterval,
  EventAdapter,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";
import type { IcsRecurrenceRule } from "@moltenship/ics";

/**
 * A point in a series' own time: an `Instant` for timed series, a `PlainDate` for all-day ones and
 * a `PlainDateTime` for floating ones. Occurrence starts, RECURRENCE-ID, EXDATE, RDATE and UNTIL
 * all take the kind of the series' first occurrence.
 */
export type RecurrenceDate = Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;

/** An RRULE, as `@moltenship/ics` parses it, with UNTIL in the series' own time. */
export type RecurrenceRule = Omit<IcsRecurrenceRule, "until"> & {
  /** Inclusive, as RFC 5545 says. Its kind matches the series' first occurrence. */
  readonly until?: RecurrenceDate;
};

/** What makes an event the master of a series. */
export interface EventRecurrence {
  /** RRULE. A series without one has only its first occurrence and `recurrenceDates`. */
  readonly rule?: RecurrenceRule;
  /** EXDATE: original starts of occurrences that don't happen. */
  readonly exceptionDates?: readonly RecurrenceDate[];
  /** RDATE: starts of extra occurrences, which last as long as the first one. */
  readonly recurrenceDates?: readonly RecurrenceDate[];
}

/** What makes an event replace one occurrence of a series, as RECURRENCE-ID does. */
export interface RecurrenceOverride<TEventId extends EventId = EventId> {
  /** The original start of the occurrence it replaces. */
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: TEventId;
  /** RANGE=THISANDFUTURE: later occurrences shift by the same amount. */
  readonly thisAndFuture?: boolean;
}

/**
 * Reads recurrence from the application's events, beside its `EventAdapter`. A series is one master
 * event, which `EventAdapter.getInterval` places at its first occurrence, plus override events.
 * Timed series repeat in the interval's `sourceTimeZone`, or in UTC without one.
 */
export interface RecurrenceAdapter<TEvent, TEventId extends EventId = EventId> {
  /** The recurrence of a series' master; `undefined` for any other event. */
  getRecurrence(event: TEvent): EventRecurrence | undefined;
  /** Which occurrence an override replaces; `undefined` for any other event. */
  getOverride?(event: TEvent): RecurrenceOverride<TEventId> | undefined;
}

export interface RecurrenceAdapters<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly event: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly recurrence: RecurrenceAdapter<TEvent, TEventId>;
}

/** An occurrence's place in its series. */
export interface OccurrenceRecurrence<TEvent, TEventId extends EventId = EventId> {
  /** The original start, which names the occurrence and stays put when it moves. */
  readonly recurrenceId: RecurrenceDate;
  /** The override that replaces this occurrence, when it has one. */
  readonly override?: TEvent;
  readonly series: TEvent;
  readonly seriesId: TEventId;
}

/**
 * One item the calendar shows: an occurrence of a series, or a one-off event passed through.
 * Hand occurrences to the calendar with `createOccurrenceAdapter`.
 */
export interface RecurrenceOccurrence<TEvent, TEventId extends EventId = EventId> {
  /** The override, the series' master, or the one-off event, whose title, resources and data it shows. */
  readonly event: TEvent;
  /** `occurrenceId(seriesId, recurrenceId)` for an occurrence, the event's own ID for a one-off. */
  readonly id: TEventId | string;
  readonly interval: CalendarEventInterval;
  /** Absent on one-off events. */
  readonly recurrence?: OccurrenceRecurrence<TEvent, TEventId>;
}

/** Dates to expand series over, as `onVisibleRangeChange` reports them. */
export interface OccurrenceRange {
  /** Half-open, such as `CalendarVisibleRange.loadRange`. */
  readonly range: Readonly<{ end: Temporal.PlainDate; start: Temporal.PlainDate }>;
  /** The calendar's time zone, which places the dates for timed series. */
  readonly timeZone: string;
}

export interface RecurrenceIssue<TEvent, TEventId extends EventId = EventId> {
  readonly code:
    | "adapter-error"
    | "date-kind-mismatch"
    | "invalid-rule"
    | "iteration-limit"
    | "missing-series";
  readonly event: TEvent;
  readonly eventId?: TEventId;
  readonly message?: string;
}

export interface OccurrenceExpansion<TEvent, TEventId extends EventId = EventId> {
  readonly issues: readonly RecurrenceIssue<TEvent, TEventId>[];
  /** Occurrences overlapping the range, overrides and one-off events, in input order of their events. */
  readonly occurrences: readonly RecurrenceOccurrence<TEvent, TEventId>[];
}

export interface OccurrenceExpanderOptions {
  /** Most rule steps one series may take per expansion; past it, expansion stops with an issue. */
  readonly maxIterations?: number;
}

export interface OccurrenceExpander<TEvent, TEventId extends EventId = EventId> {
  /** Reuses earlier work for events that are the same objects as last time. */
  expand(events: readonly TEvent[], range: OccurrenceRange): OccurrenceExpansion<TEvent, TEventId>;
}

/** A `CalendarEvent` that may carry a series' recurrence or replace one of its occurrences. */
export type RecurringCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> = CalendarEvent<TData, TEventId, TResourceId> & {
  readonly override?: RecurrenceOverride<TEventId>;
  readonly recurrence?: EventRecurrence;
};
