import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
  validateHalfOpenInterval,
  type HalfOpenIntervalComparator,
} from "@moltenship/calendar-temporal";

import { isEventId, isResourceId, type EventId, type ResourceId } from "./ids";

export interface CalendarEventBase<
  TData,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly data: TData;
  readonly id: TEventId;
  readonly resourceIds?: readonly TResourceId[];
  readonly title: string;
}

export interface TimedCalendarEventInterval {
  readonly end: Temporal.Instant;
  readonly kind: "timed";
  readonly sourceTimeZone?: string;
  readonly start: Temporal.Instant;
}

export interface AllDayCalendarEventInterval {
  readonly end: Temporal.PlainDate;
  readonly kind: "all-day";
  readonly start: Temporal.PlainDate;
}

export interface FloatingCalendarEventInterval {
  readonly end: Temporal.PlainDateTime;
  readonly kind: "floating";
  readonly start: Temporal.PlainDateTime;
}

export type CalendarEventInterval =
  | TimedCalendarEventInterval
  | AllDayCalendarEventInterval
  | FloatingCalendarEventInterval;

export type CalendarEventIntervalOf<TInstant, TPlainDate, TPlainDateTime> =
  | {
      readonly end: TInstant;
      readonly kind: "timed";
      readonly sourceTimeZone?: string;
      readonly start: TInstant;
    }
  | {
      readonly end: TPlainDate;
      readonly kind: "all-day";
      readonly start: TPlainDate;
    }
  | {
      readonly end: TPlainDateTime;
      readonly kind: "floating";
      readonly start: TPlainDateTime;
    };

export type TimedCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> = CalendarEventBase<TData, TEventId, TResourceId> & TimedCalendarEventInterval;

export type AllDayCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> = CalendarEventBase<TData, TEventId, TResourceId> & AllDayCalendarEventInterval;

export type FloatingCalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> = CalendarEventBase<TData, TEventId, TResourceId> & FloatingCalendarEventInterval;

export type CalendarEvent<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
> =
  | TimedCalendarEvent<TData, TEventId, TResourceId>
  | AllDayCalendarEvent<TData, TEventId, TResourceId>
  | FloatingCalendarEvent<TData, TEventId, TResourceId>;

export interface EventAdapter<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  getId(event: TEvent): TEventId;
  getInterval(event: TEvent): CalendarEventInterval;
  getResourceIds(event: TEvent): readonly TResourceId[];
  getRevision?(event: TEvent): string | number;
  getTitle(event: TEvent): string;
  isReadOnly?(event: TEvent): boolean;
}

export function defineEventAdapter<TEvent>() {
  return <TEventId extends EventId, TResourceId extends ResourceId>(
    adapter: EventAdapter<TEvent, TEventId, TResourceId>,
  ): EventAdapter<TEvent, TEventId, TResourceId> => adapter;
}

const noResourceIds: readonly never[] = Object.freeze([]);

export function createCanonicalEventAdapter<
  TData = unknown,
  TEventId extends EventId = string,
  TResourceId extends ResourceId = string,
>(): EventAdapter<CalendarEvent<TData, TEventId, TResourceId>, TEventId, TResourceId> {
  return {
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  };
}

export interface CalendarEventIntervalComparators<TInstant, TPlainDate, TPlainDateTime> {
  readonly instant: HalfOpenIntervalComparator<TInstant>;
  readonly plainDate: HalfOpenIntervalComparator<TPlainDate>;
  readonly plainDateTime: HalfOpenIntervalComparator<TPlainDateTime>;
}

export interface CalendarEventValidationIssue {
  readonly code: "invalid-event-id" | "invalid-resource-id" | "start-not-before-end";
  readonly index?: number;
  readonly kind?: CalendarEventInterval["kind"];
}

declare const validatedCalendarEventInterval: unique symbol;
declare const validatedCalendarEvent: unique symbol;

export type ValidatedCalendarEventInterval<TInterval> = TInterval & {
  readonly [validatedCalendarEventInterval]: true;
};

export type ValidatedCalendarEvent<TEvent extends CalendarEvent<unknown, EventId, ResourceId>> =
  TEvent & {
    readonly [validatedCalendarEvent]: true;
  };

export type CalendarEventContractValidation<TValue> =
  | { readonly valid: true; readonly value: TValue }
  | { readonly issues: readonly CalendarEventValidationIssue[]; readonly valid: false };

const nativeIntervalComparators: CalendarEventIntervalComparators<
  Temporal.Instant,
  Temporal.PlainDate,
  Temporal.PlainDateTime
> = {
  instant: compareInstants,
  plainDate: comparePlainDates,
  plainDateTime: comparePlainDateTimes,
};

export function validateCalendarEventInterval<
  TInstant,
  TPlainDate,
  TPlainDateTime,
  TInterval extends CalendarEventIntervalOf<TInstant, TPlainDate, TPlainDateTime>,
>(
  interval: TInterval,
  comparators: CalendarEventIntervalComparators<TInstant, TPlainDate, TPlainDateTime>,
): CalendarEventContractValidation<ValidatedCalendarEventInterval<TInterval>> {
  const validation =
    interval.kind === "timed"
      ? validateHalfOpenInterval("timed", interval.start, interval.end, comparators.instant)
      : interval.kind === "all-day"
        ? validateHalfOpenInterval("all-day", interval.start, interval.end, comparators.plainDate)
        : validateHalfOpenInterval(
            "floating",
            interval.start,
            interval.end,
            comparators.plainDateTime,
          );

  if (!validation.valid) {
    return {
      valid: false,
      issues: [{ code: "start-not-before-end", kind: interval.kind }],
    };
  }

  return {
    valid: true,
    value: interval as ValidatedCalendarEventInterval<TInterval>,
  };
}

export function validateCalendarEvent<TEvent extends CalendarEvent<unknown, EventId, ResourceId>>(
  event: TEvent,
): CalendarEventContractValidation<ValidatedCalendarEvent<TEvent>> {
  const issues: CalendarEventValidationIssue[] = [];

  if (!isEventId(event.id)) {
    issues.push({ code: "invalid-event-id" });
  }

  event.resourceIds?.forEach((resourceId, index) => {
    if (!isResourceId(resourceId)) {
      issues.push({ code: "invalid-resource-id", index });
    }
  });

  const intervalValidation = validateCalendarEventInterval(event, nativeIntervalComparators);
  if (!intervalValidation.valid) {
    issues.push(...intervalValidation.issues);
  }

  if (issues.length > 0) {
    return { valid: false, issues };
  }

  return { valid: true, value: event as ValidatedCalendarEvent<TEvent> };
}
