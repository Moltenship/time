import type { InstantInterval } from "@moltenship/calendar-temporal";

import type { IsoDayOfWeek } from "../environment";
import type { ResourceId } from "../ids";

/**
 * Open hours on a wall clock, `[start, end)`. An `end` at or before `start` runs past midnight
 * into the next day, so `22:00`–`06:00` is a night and `00:00`–`00:00` a whole day.
 */
export interface AvailabilityHours {
  readonly start: Temporal.PlainTime;
  readonly end: Temporal.PlainTime;
}

/** The same hours on some days of the week. */
export interface AvailabilityRule extends AvailabilityHours {
  /** ISO days the hours start on: `1` is Monday and `7` Sunday. */
  readonly days: readonly IsoDayOfWeek[];
}

/** Different hours on one date, such as a holiday or a late opening. */
export interface AvailabilityException {
  readonly date: Temporal.PlainDate;
  /** The hours that replace the weekly ones on `date`. Without any, the date is closed. */
  readonly hours?: readonly AvailabilityHours[];
  /** Why, such as "Public holiday"; views name a closed date with it. */
  readonly label?: string;
}

/**
 * When a resource is available, on its own wall clock. Hours start on their date; hours that run
 * past midnight continue into the next.
 */
export interface ResourceAvailability {
  /**
   * Hours by day of the week. Without them every day is open all day, so only `exceptions` close
   * time; an empty list opens only the exceptions' hours. A resource's own replace the calendar's.
   */
  readonly weekly?: readonly AvailabilityRule[];
  /**
   * Dates whose hours differ from the weekly ones. A resource has the calendar's as well as its
   * own, and its own win on the same date.
   */
  readonly exceptions?: readonly AvailabilityException[];
}

/** The calendar's working hours, which resources without their own follow. */
export interface CalendarAvailability extends ResourceAvailability {
  /**
   * The time zone the hours are on, such as the office's. A resource's hours follow its own
   * `timeZone` instead. Defaults to the display time zone.
   */
  readonly timeZone?: string;
}

/**
 * One set of hours resolved on one time zone. Every query is half-open and DST-safe: a start in a
 * skipped hour opens when the clock jumps past it, and an end in a repeated hour closes after the
 * repeat. Dates are resolved once and cached, so queries never scan the rules or exceptions.
 */
export interface AvailabilitySchedule {
  readonly timeZone: string;
  /** The open parts of `range`, merged and in time order. */
  available(range: InstantInterval): readonly InstantInterval[];
  /** The closed parts of `range`, merged and in time order. */
  unavailable(range: InstantInterval): readonly InstantInterval[];
  /** Whether all of `range` is open. */
  isAvailable(range: InstantInterval): boolean;
  /** The exception on a date of the schedule's wall clock. */
  exceptionOn(date: Temporal.PlainDate): AvailabilityException | undefined;
}

export interface AvailabilityIssue {
  readonly code:
    | "duplicate-exception-date"
    | "invalid-availability-exception"
    | "invalid-availability-rule"
    | "invalid-time-zone";
  /** The resource it belongs to; absent for the calendar's own hours. */
  readonly resourceId?: ResourceId;
  /** The rule, exception, or time zone that was left out. */
  readonly value: unknown;
}

/**
 * The calendar's hours and every resource's, on their time zones. Invalid rules, exceptions, and
 * time zones are left out and reported in `issues`; the calendar never throws over them.
 */
export interface AvailabilitySnapshot {
  /** The calendar's own hours, which events without resources follow; `null` when always open. */
  readonly calendar: AvailabilitySchedule | null;
  readonly issues: readonly AvailabilityIssue[];
  /** The display time zone. */
  readonly timeZone: string;
  /**
   * A resource's hours: its own, or the calendar's on the resource's time zone; `null` when it is
   * always open. The unassigned bucket (`null`) and unknown resources follow the calendar's.
   */
  forResource(resourceId: ResourceId | null): AvailabilitySchedule | null;
}
