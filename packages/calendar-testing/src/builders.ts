import type {
  AllDayCalendarEvent,
  AvailabilityException,
  AvailabilityHours,
  AvailabilityRule,
  CalendarAvailability,
  CalendarEvent,
  CalendarResource,
  EventId,
  IsoDayOfWeek,
  ResourceAvailability,
  ResourceId,
  TimedCalendarEvent,
} from "@moltenship/calendar";
import {
  parseRecurrenceRule,
  type EventRecurrence,
  type RecurrenceDate,
  type RecurrencePeriod,
  type RecurrenceRule,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";

import { toInstant, toPlainDate, type DateInput, type DateTimeInput } from "./environment";

/** The start events get without one: 09:00 on the default environment's date. */
const defaultStart = "2026-10-08T09:00";
const defaultDate = "2026-10-08";

interface EventBaseInput<TData, TEventId extends EventId, TResourceId extends ResourceId> {
  /** Defaults to the title. */
  readonly id?: TEventId;
  /** Defaults to the ID, or `"Event"`. */
  readonly title?: string;
  readonly resourceIds?: readonly TResourceId[];
  /** Defaults to `null`. */
  readonly data?: TData;
}

/** `data` as given, `null` when left out. */
function dataOf<TData>(input: { readonly data?: TData }): TData {
  return ("data" in input ? input.data : null) as TData;
}

/** A timed event: `start` and `end`, or `start` and `duration`. */
export interface TimedEventInput<
  TData = null,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> extends EventBaseInput<TData, TEventId, TResourceId> {
  /** Exact, or a wall time on `timeZone`. Defaults to 09:00 on 8 October 2026. */
  readonly start?: DateTimeInput;
  /** Exact, or a wall time on `timeZone`. Defaults to `start` plus `duration`. */
  readonly end?: DateTimeInput;
  /** Added on `timeZone`'s wall clock, so a day stays a day across DST. Defaults to an hour. */
  readonly duration?: Temporal.DurationLike | string;
  /**
   * The zone wall times are read on, and the event's `sourceTimeZone`. Without it, wall times are
   * UTC and the event has no source zone.
   */
  readonly timeZone?: string;
}

/** An all-day event over whole dates, `end` exclusive. */
export interface AllDayEventInput<
  TData = null,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> extends EventBaseInput<TData, TEventId, TResourceId> {
  /** Defaults to 8 October 2026. */
  readonly start?: DateInput;
  /** The day after the last one. Defaults to `start` plus `days`. */
  readonly end?: DateInput;
  /** Defaults to 1. */
  readonly days?: number;
}

function identity<TEventId extends EventId>(
  id: TEventId | undefined,
  title: string | undefined,
  fallback: string,
) {
  const named = title ?? (id === undefined ? fallback : String(id));
  return { id: id ?? (named as TEventId), title: named };
}

/** A timed event in the canonical shape `createCanonicalEventAdapter` reads. */
export function buildEvent<
  TData = null,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
>(
  input: TimedEventInput<TData, TEventId, TResourceId> = {},
): TimedCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>> {
  const timeZone = input.timeZone ?? "UTC";
  const start = toInstant(input.start ?? defaultStart, timeZone);
  const end =
    input.end === undefined
      ? start
          .toZonedDateTimeISO(timeZone)
          .add(input.duration ?? { hours: 1 })
          .toInstant()
      : toInstant(input.end, timeZone);

  return Object.freeze({
    ...identity(input.id, input.title, "Event"),
    data: dataOf(input),
    end,
    kind: "timed",
    ...(input.resourceIds === undefined
      ? {}
      : { resourceIds: Object.freeze([...input.resourceIds]) }),
    ...(input.timeZone === undefined ? {} : { sourceTimeZone: input.timeZone }),
    start,
  });
}

/** An all-day event in the canonical shape. */
export function buildAllDayEvent<
  TData = null,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
>(
  input: AllDayEventInput<TData, TEventId, TResourceId> = {},
): AllDayCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>> {
  const start = toPlainDate(input.start ?? defaultDate);
  const end =
    input.end === undefined ? start.add({ days: input.days ?? 1 }) : toPlainDate(input.end);

  return Object.freeze({
    ...identity(input.id, input.title, "Event"),
    data: dataOf(input),
    end,
    kind: "all-day",
    ...(input.resourceIds === undefined
      ? {}
      : { resourceIds: Object.freeze([...input.resourceIds]) }),
    start,
  });
}

export interface ResourceInput<TData = null, TResourceId extends ResourceId = string> {
  /** Defaults to the title. */
  readonly id?: TResourceId;
  /** Defaults to the ID, or `"Resource"`. */
  readonly title?: string;
  readonly parentId?: TResourceId;
  readonly timeZone?: string;
  readonly availability?: ResourceAvailability;
  /** Defaults to `null`. */
  readonly data?: TData;
}

/** A resource in the canonical `CalendarResource` shape. */
export function buildResource<TData = null, TResourceId extends ResourceId = string>(
  input: ResourceInput<TData, TResourceId> = {},
): CalendarResource<NoInfer<TData>, NoInfer<TResourceId>> {
  const { id, title } = identity(input.id, input.title, "Resource");
  return Object.freeze({
    ...(input.availability === undefined ? {} : { availability: input.availability }),
    data: dataOf(input),
    id: id as TResourceId,
    ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    title,
  });
}

/** Open hours: `"09:00-17:00"`, or `{ start, end }` as `PlainTime`s or text. */
export type HoursInput =
  | string
  | {
      readonly start: Temporal.PlainTime | string;
      readonly end: Temporal.PlainTime | string;
    };

export interface AvailabilityExceptionInput {
  readonly date: DateInput;
  /** Hours that replace the weekly ones on `date`; none closes it. */
  readonly hours?: HoursInput | readonly HoursInput[];
  readonly label?: string;
}

export interface AvailabilityInput {
  /** Days the weekly hours start on, `1` Monday to `7` Sunday. Defaults to Monday to Friday. */
  readonly days?: readonly IsoDayOfWeek[];
  /** Defaults to `"09:00-17:00"`. An empty list opens only the exceptions' hours. */
  readonly hours?: HoursInput | readonly HoursInput[];
  readonly exceptions?: readonly AvailabilityExceptionInput[];
  /** The zone the hours are on; the display time zone when absent. */
  readonly timeZone?: string;
}

function toHours(input: HoursInput): AvailabilityHours {
  if (typeof input === "string") {
    const [start, end] = input.split("-").map((part) => part.trim());
    if (start === undefined || end === undefined) {
      throw new RangeError(`Hours must look like "09:00-17:00", not ${JSON.stringify(input)}`);
    }
    return Object.freeze({
      end: Temporal.PlainTime.from(end),
      start: Temporal.PlainTime.from(start),
    });
  }
  return Object.freeze({
    end: Temporal.PlainTime.from(input.end),
    start: Temporal.PlainTime.from(input.start),
  });
}

function toHoursList(input: HoursInput | readonly HoursInput[]): readonly AvailabilityHours[] {
  return Object.freeze(
    (typeof input === "string" || !Array.isArray(input) ? [input as HoursInput] : input).map(
      toHours,
    ),
  );
}

const weekdays: readonly IsoDayOfWeek[] = Object.freeze([1, 2, 3, 4, 5]);

/** Working hours for `Root`'s `availability` or a resource's: Monday to Friday, 9 to 5 by default. */
export function buildAvailability(input: AvailabilityInput = {}): CalendarAvailability {
  const days = Object.freeze([...(input.days ?? weekdays)]);
  const weekly: readonly AvailabilityRule[] = Object.freeze(
    toHoursList(input.hours ?? "09:00-17:00").map((hours) => Object.freeze({ ...hours, days })),
  );
  const exceptions: readonly AvailabilityException[] = Object.freeze(
    (input.exceptions ?? []).map((exception) =>
      Object.freeze({
        date: toPlainDate(exception.date),
        ...(exception.hours === undefined ? {} : { hours: toHoursList(exception.hours) }),
        ...(exception.label === undefined ? {} : { label: exception.label }),
      }),
    ),
  );

  return Object.freeze({
    ...(exceptions.length === 0 ? {} : { exceptions }),
    ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
    weekly,
  });
}

/** What makes an event a series; dates are text or Temporal values in the series' kind. */
export interface RecurrenceInput {
  /** RRULE text, such as `"FREQ=WEEKLY;BYDAY=MO,WE"`, or a parsed rule. */
  readonly rule?: string | RecurrenceRule;
  /** EXDATE: original starts of occurrences that don't happen. */
  readonly exceptionDates?: readonly (RecurrenceDate | string)[];
  /** RDATE: extra occurrences. */
  readonly recurrenceDates?: readonly (RecurrenceDate | RecurrencePeriod | string)[];
  /** DURATION, which keeps each occurrence's wall-clock length across DST. */
  readonly duration?: Temporal.Duration | string;
}

function parseRule(rule: string | RecurrenceRule): RecurrenceRule {
  if (typeof rule !== "string") return rule;
  const { issues, rule: parsed } = parseRecurrenceRule(rule);
  const errors = issues.filter(({ severity }) => severity === "error");
  if (parsed === undefined || errors.length > 0) {
    const reasons = (errors.length > 0 ? errors : issues).map(({ message }) => message);
    throw new RangeError(
      `Invalid RRULE ${JSON.stringify(rule)}: ${reasons.join("; ") || "no rule"}`,
    );
  }
  return parsed;
}

/**
 * Makes `event` the master of a series. Dates given as text take the event's kind: instants (wall
 * times on its `sourceTimeZone`, or UTC) for a timed event, date-times for a floating one, dates
 * for an all-day one. A date alone on a timed or floating series, such as `"2026-10-28"`, stays a
 * date in `exceptionDates`, which drops every occurrence that day; in `recurrenceDates` it throws,
 * as an extra occurrence of such a series needs a time.
 */
export function withRecurrence<TData, TEventId extends EventId, TResourceId extends ResourceId>(
  event: CalendarEvent<TData, TEventId, TResourceId>,
  recurrence: RecurrenceInput,
): RecurringCalendarEvent<TData, TEventId, TResourceId> {
  const zone = event.kind === "timed" ? (event.sourceTimeZone ?? "UTC") : "UTC";
  const toDate = (value: RecurrenceDate | string, role: "exception" | "extra"): RecurrenceDate => {
    if (typeof value !== "string") return value;
    if (event.kind === "all-day") return Temporal.PlainDate.from(value);
    if (!/[Tt ]/u.test(value)) {
      if (role === "exception") return Temporal.PlainDate.from(value);
      throw new RangeError(
        `An extra occurrence of a ${event.kind} series needs a time, not just the date ${JSON.stringify(value)}.`,
      );
    }
    if (event.kind === "floating") return Temporal.PlainDateTime.from(value);
    return toInstant(value, zone);
  };
  const result: EventRecurrence = {
    ...(recurrence.duration === undefined
      ? {}
      : { duration: Temporal.Duration.from(recurrence.duration) }),
    ...(recurrence.exceptionDates === undefined
      ? {}
      : {
          exceptionDates: Object.freeze(
            recurrence.exceptionDates.map((value) => toDate(value, "exception")),
          ),
        }),
    ...(recurrence.recurrenceDates === undefined
      ? {}
      : {
          recurrenceDates: Object.freeze(
            recurrence.recurrenceDates.map((value) =>
              typeof value === "string" || !("start" in value) ? toDate(value, "extra") : value,
            ),
          ),
        }),
    ...(recurrence.rule === undefined ? {} : { rule: parseRule(recurrence.rule) }),
  };
  return Object.freeze({ ...event, recurrence: Object.freeze(result) });
}

/**
 * A timed recurring series: `buildEvent`'s input, where `duration` sizes the first occurrence,
 * plus the rule and dates. Give `timeZone`, so the series repeats on that zone's wall clock.
 */
export function buildRecurringEvent<
  TData = null,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
>(
  input: TimedEventInput<TData, TEventId, TResourceId> & Omit<RecurrenceInput, "duration">,
): RecurringCalendarEvent<NoInfer<TData>, NoInfer<TEventId>, NoInfer<TResourceId>> {
  const { exceptionDates, recurrenceDates, rule, ...event } = input;
  return withRecurrence(buildEvent(event), { exceptionDates, recurrenceDates, rule });
}
