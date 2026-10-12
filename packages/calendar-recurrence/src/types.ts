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
 * take the kind of the series' first occurrence; `coerceRecurrenceDate` brings other kinds in.
 * Exception dates may also be a `PlainDate` on any series, which excludes the whole day.
 */
export type RecurrenceDate = Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime;

/** An RRULE, as `@moltenship/ics` parses it, with UNTIL in the series' own time. */
export type RecurrenceRule = Omit<IcsRecurrenceRule, "until"> & {
  /**
   * Inclusive, as RFC 5545 says. Its kind matches the series' first occurrence. With COUNT too, as
   * some feeds write, the series ends at whichever comes first.
   */
  readonly until?: RecurrenceDate;
};

/** An RDATE PERIOD: an extra occurrence with its own length. Both ends take the series' kind. */
export interface RecurrencePeriod {
  readonly end: RecurrenceDate;
  readonly start: RecurrenceDate;
}

/** What makes an event the master of a series. */
export interface EventRecurrence {
  /**
   * DURATION's nominal length, such as `P1D`, which keeps each occurrence's wall-clock length
   * across DST. Without it, occurrences last exactly as long as the first (RFC 5545 §3.8.5.3). On
   * an all-day series it counts whole days: a time part, which a DATE start's DURATION shouldn't
   * have, rounds up to the next whole day, as `getEventEnd` from `@moltenship/ics` does.
   */
  readonly duration?: Temporal.Duration;
  /**
   * EXDATE: original starts of occurrences that don't happen, the first one included. A `PlainDate`
   * on a timed or floating series excludes every occurrence starting that day, in the series' time
   * zone. Excluded occurrences still count toward COUNT (RFC 5545 §3.8.5.1).
   */
  readonly exceptionDates?: readonly RecurrenceDate[];
  /**
   * RDATE: extra occurrences. A date starts one that lasts as long as the first occurrence; a
   * period keeps its own length.
   */
  readonly recurrenceDates?: readonly (RecurrenceDate | RecurrencePeriod)[];
  /** RRULE. A series without one has only its first occurrence and `recurrenceDates`. */
  readonly rule?: RecurrenceRule;
  /**
   * A timed series' first start as written, when it fell in a DST gap and so resolved later. Later
   * occurrences repeat at this wall time, which each day resolves on its own. ICS gives it as
   * `IcsZonedDateTime.wallTime`. Ignored unless it resolves to the first start, so a stale one left
   * after the start moves does no harm; edits that move the start drop it.
   */
  readonly wallStart?: Temporal.PlainDateTime;
}

/** What makes an event replace one occurrence of a series, as RECURRENCE-ID does. */
export interface RecurrenceOverride<TEventId extends EventId = EventId> {
  /**
   * The occurrence doesn't happen, as Google's cancelled instances and ICS overrides with
   * `STATUS:CANCELLED` say. It hides the occurrence and isn't shown itself.
   */
  readonly cancelled?: boolean;
  /**
   * The original start of the occurrence it replaces, in the series' kind: an `Instant` for a timed
   * series. That keeps the override's ID the same before and after its master loads.
   */
  readonly recurrenceId: RecurrenceDate;
  readonly seriesId: TEventId;
}

/**
 * Reads recurrence from the application's events, beside its `EventAdapter`. A series is one master
 * event, which `EventAdapter.getInterval` places at its first occurrence, plus override events.
 * Timed series repeat in the interval's `sourceTimeZone`, or the expander's `defaultTimeZone`. An
 * event with both is an override, and its recurrence is ignored with an issue.
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
  /**
   * The series' master. Absent for an override whose master isn't among the events, such as an
   * invitation to one occurrence; it keeps its occurrence ID, so it matches once the master loads.
   */
  readonly series?: TEvent;
  readonly seriesId: TEventId;
}

/**
 * One item the calendar shows: an occurrence of a series, or a one-off event passed through.
 * Hand occurrences to the calendar with `createOccurrenceAdapter`.
 */
export interface RecurrenceOccurrence<TEvent, TEventId extends EventId = EventId> {
  /** The override, the series' master, or the one-off event, whose title, resources and data it shows. */
  readonly event: TEvent;
  /**
   * `occurrenceId(seriesId, recurrenceId)` for an occurrence or override, with or without its
   * master, and the event's own ID for a one-off.
   */
  readonly id: TEventId | string;
  readonly interval: CalendarEventInterval;
  /** Absent on one-off events. */
  readonly recurrence?: OccurrenceRecurrence<TEvent, TEventId>;
}

/** Dates to expand series over, as `onVisibleRangeChange` reports them. */
export interface OccurrenceRange {
  /**
   * Half-open. Pass `CalendarVisibleRange.loadRange`, not its `range`, so pages a scrolling view
   * shows next already have their occurrences.
   */
  readonly range: Readonly<{ end: Temporal.PlainDate; start: Temporal.PlainDate }>;
  /** The calendar's time zone, which places the dates for timed series. */
  readonly timeZone: string;
}

export interface RecurrenceIssue<TEvent, TEventId extends EventId = EventId> {
  readonly code:
    | "adapter-error"
    /** A date that `coerceRecurrenceDate` couldn't bring into the series' kind; only it is dropped. */
    | "date-kind-mismatch"
    /** An event that is both a series' master and an override; it is treated as the override. */
    | "conflicting-recurrence"
    /** Two items with the same ID, such as series `42` and `"42"`; the later one is left out. */
    | "duplicate-event-id"
    /** Two overrides for the same occurrence; the later one in the input wins. */
    | "duplicate-override"
    | "invalid-rule"
    | "invalid-time-zone"
    | "iteration-limit"
    | "missing-series"
    /** A valid RFC 5545 construct the package doesn't handle, such as RANGE=THISANDFUTURE. */
    | "unsupported-rule";
  readonly event: TEvent;
  readonly eventId?: TEventId;
  /** The event's position in the input. */
  readonly index?: number;
  readonly message?: string;
}

export interface OccurrenceExpansion<TEvent, TEventId extends EventId = EventId> {
  readonly issues: readonly RecurrenceIssue<TEvent, TEventId>[];
  /**
   * Occurrences overlapping the range, plus every override that isn't cancelled and every one-off
   * event, in the input order of their events and in time order within a series. IDs are unique.
   * Unchanged events over the same range give the same occurrence objects while that range is one
   * of the last four each series was expanded over, so memoization holds across re-renders and
   * scrolling back and forth; an occurrence that comes out the same in an overlapping range keeps
   * its object too. A range older than that gives equal occurrences, but new objects.
   */
  readonly occurrences: readonly RecurrenceOccurrence<TEvent, TEventId>[];
}

export interface OccurrenceExpanderOptions {
  /**
   * Where timed series without `sourceTimeZone` repeat. Defaults to UTC, as RFC 5545 does for a
   * UTC DTSTART; weekdays and DST then follow UTC, so set it when your events carry no zone.
   */
  readonly defaultTimeZone?: string;
  /** Most loop steps one series may take per expansion; see `RecurrenceRuleWindow`. */
  readonly maxIterations?: number;
}

export interface OccurrenceExpander<TEvent, TEventId extends EventId = EventId> {
  /**
   * Reuses earlier work for events that are the same objects as before, over each series' recent
   * ranges; see `OccurrenceExpansion.occurrences`.
   */
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

/**
 * Where a rule starts: the series' first occurrence, with the wall time it was written at when that
 * fell in a DST gap (`EventRecurrence.wallStart`). Timed series without `sourceTimeZone` repeat in
 * UTC; the expander fills in its `defaultTimeZone` first.
 */
export type RecurrenceRuleStart = CalendarEventInterval & {
  readonly wallStart?: Temporal.PlainDateTime;
};

export interface RecurrenceRuleWindow {
  /** Stops before occurrences starting at or after this. */
  readonly before?: RecurrenceDate;
  /**
   * Leaves out occurrences starting before this. COUNT still counts them; without COUNT, engines
   * skip ahead instead of stepping through every earlier period.
   */
  readonly from?: RecurrenceDate;
  /**
   * Most steps to take, a positive integer. A step is one period the engine visits, whether or not
   * it produces anything, so a rule that never matches stops too; periods skipped to reach `from`
   * don't count. Engines may take more than one step per occurrence, never less. Defaults to
   * `DEFAULT_MAX_ITERATIONS`.
   */
  readonly maxIterations?: number;
}

export interface RecurrenceRuleExpansion {
  /**
   * Occurrence starts in the kind of the first occurrence and the ISO calendar, strictly
   * increasing: starts that resolve to the same instant, as two wall times in a DST gap can, appear
   * once.
   */
  readonly dates: readonly RecurrenceDate[];
  /**
   * `maxIterations` ran out before the end of the window, while the rule may still have had
   * occurrences to give. Some rules turn out impossible only after the cap, such as
   * `FREQ=MINUTELY;INTERVAL=2;BYMINUTE=1` from an even minute, so a truncated rule may have had
   * none left.
   */
  readonly truncated: boolean;
}
