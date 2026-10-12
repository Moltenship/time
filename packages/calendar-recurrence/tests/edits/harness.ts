import {
  createCanonicalEventAdapter,
  moveEventPlacement,
  resizeEventPlacement,
  type CalendarEventInterval,
  type CalendarEventPlacement,
  type CalendarEventPlacementInput,
  type CalendarWallClockDelta,
  type EventAdapter,
} from "@moltenship/calendar-core";

import { expect } from "vite-plus/test";

import {
  coerceRecurrenceDate,
  expandRecurrenceRule,
  occurrenceId,
  type EventRecurrence,
  type RecurrenceAdapters,
  type RecurrenceDate,
  type RecurrenceOccurrence,
  type RecurrenceOccurrenceChange,
  type RecurrenceOverride,
  type RecurringCalendarEvent,
} from "../../src";

// A test-only expander and occurrence adapter, written from the contract types, until #48 phase 3
// ships `createOccurrenceExpander` and `createOccurrenceAdapter`. Baseline engine: DAILY and WEEKLY.

const temporalTypes = [
  Temporal.Duration,
  Temporal.Instant,
  Temporal.PlainDate,
  Temporal.PlainDateTime,
  Temporal.PlainTime,
  Temporal.ZonedDateTime,
];
const isTemporal = (value: unknown) => temporalTypes.some((type) => value instanceof type);

// Temporal values have no own properties, so `toMatchObject` would find any two of them equal.
expect.addEqualityTesters([
  (left: unknown, right: unknown) => {
    if (!isTemporal(left) && !isTemporal(right)) return undefined;
    return (
      isTemporal(left) &&
      isTemporal(right) &&
      (left as object).constructor === (right as object).constructor &&
      String(left) === String(right)
    );
  },
]);

export type Event = RecurringCalendarEvent<null>;
export type Occurrence = RecurrenceOccurrence<Event, string>;
export type Change = RecurrenceOccurrenceChange<Event, string, string>;

export const adapters: RecurrenceAdapters<Event, string, string> = {
  event: createCanonicalEventAdapter<null>(),
  recurrence: {
    getOverride: (event) => event.override,
    getRecurrence: (event) => (event.override === undefined ? event.recurrence : undefined),
  },
};

export const berlin = "Europe/Berlin";

/** A Berlin wall time as an instant. */
export function at(wall: string, timeZone = berlin): Temporal.Instant {
  return Temporal.PlainDateTime.from(wall)
    .toZonedDateTime(timeZone, { disambiguation: "compatible" })
    .toInstant();
}

/** An instant on a zone's wall clock, for readable expectations. */
export function wall(date: RecurrenceDate | undefined, timeZone = berlin): string {
  if (date === undefined) return "undefined";
  return date instanceof Temporal.Instant
    ? date.toZonedDateTimeISO(timeZone).toPlainDateTime().toString()
    : date.toString();
}

export function timed(
  id: string,
  start: string,
  end: string,
  extra: Partial<Event> = {},
  timeZone = berlin,
): Event {
  return {
    data: null,
    end: at(end, timeZone),
    id,
    kind: "timed",
    sourceTimeZone: timeZone,
    start: at(start, timeZone),
    title: id,
    ...extra,
  } as Event;
}

export function allDay(id: string, start: string, end: string, extra: Partial<Event> = {}): Event {
  return {
    data: null,
    end: Temporal.PlainDate.from(end),
    id,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title: id,
    ...extra,
  } as Event;
}

export function floating(
  id: string,
  start: string,
  end: string,
  extra: Partial<Event> = {},
): Event {
  return {
    data: null,
    end: Temporal.PlainDateTime.from(end),
    id,
    kind: "floating",
    start: Temporal.PlainDateTime.from(start),
    title: id,
    ...extra,
  } as Event;
}

/** An override event: the master's copy at `interval`, replacing `recurrenceId`. */
export function overrideOf(
  master: Event,
  id: string,
  recurrenceId: RecurrenceDate,
  interval: CalendarEventInterval,
  extra: Partial<RecurrenceOverride<string>> = {},
): Event {
  const {
    recurrence: _recurrence,
    sourceTimeZone: _zone,
    ...rest
  } = master as Event & {
    sourceTimeZone?: string;
  };
  return {
    ...rest,
    ...interval,
    id,
    override: { recurrenceId, seriesId: master.id, ...extra },
  } as Event;
}

function intervalOf(event: Event): CalendarEventInterval {
  return event.kind === "timed"
    ? {
        end: event.end,
        kind: "timed",
        ...(event.sourceTimeZone === undefined ? {} : { sourceTimeZone: event.sourceTimeZone }),
        start: event.start,
      }
    : event.kind === "all-day"
      ? { end: event.end, kind: "all-day", start: event.start }
      : { end: event.end, kind: "floating", start: event.start };
}

function compare(left: RecurrenceDate, right: RecurrenceDate): number {
  return Temporal.Instant.compare(
    left instanceof Temporal.Instant ? left : left.toZonedDateTime("UTC").toInstant(),
    right instanceof Temporal.Instant ? right : right.toZonedDateTime("UTC").toInstant(),
  );
}

function boundFor(kind: CalendarEventInterval["kind"], until: Temporal.PlainDate): RecurrenceDate {
  if (kind === "all-day") return until;
  if (kind === "floating") return until.toPlainDateTime();
  return until.toZonedDateTime("UTC").toInstant();
}

function lengthOf(
  first: CalendarEventInterval,
  recurrence: EventRecurrence,
): (start: RecurrenceDate) => RecurrenceDate {
  const { duration } = recurrence;
  const timeZone = first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC";
  if (first.kind === "timed") {
    const exact = first.start.until(first.end);
    return (start) =>
      duration === undefined
        ? (start as Temporal.Instant).add(exact)
        : (start as Temporal.Instant).toZonedDateTimeISO(timeZone).add(duration).toInstant();
  }
  if (first.kind === "all-day") {
    const days = duration ?? first.start.until(first.end);
    return (start) => (start as Temporal.PlainDate).add(days);
  }
  const length = duration ?? first.start.until(first.end);
  return (start) => (start as Temporal.PlainDateTime).add(length);
}

function intervalAt(
  first: CalendarEventInterval,
  start: RecurrenceDate,
  end: RecurrenceDate,
): CalendarEventInterval {
  return { ...first, end, start } as CalendarEventInterval;
}

/**
 * Occurrences of `events` starting before `until`: generated ones minus EXDATEs and overridden
 * starts, overrides that aren't cancelled, and one-off events.
 */
export function expand(
  events: readonly Event[],
  until = Temporal.PlainDate.from("2027-06-01"),
): Occurrence[] {
  const masters = new Map(
    events
      .filter((event) => event.override === undefined && event.recurrence !== undefined)
      .map((event) => [event.id, event]),
  );
  const occurrences: Occurrence[] = [];
  for (const event of events) {
    if (event.override !== undefined) {
      const { cancelled, recurrenceId, seriesId } = event.override;
      if (cancelled === true) continue;
      const series = masters.get(seriesId);
      occurrences.push({
        event,
        id: occurrenceId(seriesId, recurrenceId),
        interval: intervalOf(event),
        recurrence: { override: event, recurrenceId, seriesId, ...(series ? { series } : {}) },
      });
      continue;
    }
    const recurrence = event.recurrence;
    if (recurrence === undefined) {
      occurrences.push({ event, id: event.id, interval: intervalOf(event) });
      continue;
    }

    const first = intervalOf(event);
    const before = boundFor(first.kind, until);
    const end = lengthOf(first, recurrence);
    const starts: { readonly end: RecurrenceDate; readonly start: RecurrenceDate }[] = (
      recurrence.rule
        ? expandRecurrenceRule(
            recurrence.rule,
            {
              ...first,
              ...(recurrence.wallStart === undefined ? {} : { wallStart: recurrence.wallStart }),
            },
            { before },
          ).dates
        : [first.start]
    ).map((start) => ({ end: end(start), start }));
    for (const extra of recurrence.recurrenceDates ?? []) {
      const period = "start" in extra && "end" in extra ? extra : undefined;
      const start = coerceRecurrenceDate(
        period?.start ?? (extra as RecurrenceDate),
        first,
        "start",
      );
      const stop = period && coerceRecurrenceDate(period.end, first, "start");
      if (start !== undefined && compare(start, before) < 0) {
        starts.push({ end: stop ?? end(start), start });
      }
    }
    starts.sort((left, right) => compare(left.start, right.start));
    const timeZone = first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC";
    const excluded = (start: RecurrenceDate) =>
      (recurrence.exceptionDates ?? []).some((date) => {
        const key = coerceRecurrenceDate(date, first, "exception");
        if (key === undefined) return false;
        if (key instanceof Temporal.PlainDate && !(start instanceof Temporal.PlainDate)) {
          const day =
            start instanceof Temporal.Instant
              ? start.toZonedDateTimeISO(timeZone).toPlainDate()
              : start.toPlainDate();
          return day.equals(key);
        }
        return compare(key, start) === 0;
      }) ||
      events.some(
        (other) =>
          other.override?.seriesId === event.id &&
          compare(
            coerceRecurrenceDate(other.override.recurrenceId, first, "start") ?? first.start,
            start,
          ) === 0,
      );
    let previous: RecurrenceDate | undefined;
    for (const { end: stop, start } of starts) {
      if (previous !== undefined && compare(previous, start) === 0) continue;
      previous = start;
      if (excluded(start)) continue;
      occurrences.push({
        event,
        id: occurrenceId(event.id, start),
        interval: intervalAt(first, start, stop),
        recurrence: { recurrenceId: start, series: event, seriesId: event.id },
      });
    }
  }
  return occurrences;
}

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identityOf(event: object): number {
  let identity = identities.get(event);
  if (identity === undefined) {
    identity = nextIdentity++;
    identities.set(event, identity);
  }
  return identity;
}

/** As phase 3's `createOccurrenceAdapter`: the shown event's fields, and a revision. */
export const occurrenceAdapter: EventAdapter<Occurrence, string, string> = {
  getId: (occurrence) => occurrence.id,
  getInterval: (occurrence) => occurrence.interval,
  getResourceIds: (occurrence) => occurrence.event.resourceIds ?? [],
  getRevision: (occurrence) =>
    JSON.stringify([
      identityOf(occurrence.event),
      occurrence.recurrence?.series === undefined ? null : identityOf(occurrence.recurrence.series),
      String(occurrence.interval.start),
      String(occurrence.interval.end),
    ]),
  getTitle: (occurrence) => occurrence.event.title,
};

export function find(occurrences: readonly Occurrence[], key: string): Occurrence {
  const occurrence = occurrences.find(({ id }) => id.endsWith(`::${key}`) || id === key);
  if (occurrence === undefined) {
    throw new Error(`No occurrence ${key} in ${occurrences.map(({ id }) => id).join(", ")}`);
  }
  return occurrence;
}

function originalOf(occurrence: Occurrence): CalendarEventPlacement<string> {
  return { ...occurrence.interval, resourceIds: occurrence.event.resourceIds ?? [] };
}

/** The change the calendar would hand `onEventChange`. */
export function change(
  occurrence: Occurrence,
  cause: "delete" | "move" | "resize-end" | "resize-start" | "update",
  proposed?: CalendarEventPlacementInput<string>,
): Change {
  const original = originalOf(occurrence);
  const base = { event: occurrence, eventId: occurrence.id, id: "change-1", original };
  if (cause === "delete") return { ...base, cause, proposed: null };
  if (proposed === undefined) throw new Error("A placement is needed.");
  return {
    ...base,
    cause,
    proposed: { ...proposed, resourceIds: proposed.resourceIds ?? original.resourceIds },
  };
}

/** A move by a wall-clock delta in `timeZone`, as a drag in a calendar showing it makes. */
export function move(
  occurrence: Occurrence,
  delta: CalendarWallClockDelta,
  timeZone = berlin,
): Change {
  return change(
    occurrence,
    "move",
    moveEventPlacement(originalOf(occurrence), delta, { timeZone }),
  );
}

export function resize(
  occurrence: Occurrence,
  edge: "end" | "start",
  delta: CalendarWallClockDelta,
  timeZone = berlin,
): Change {
  return change(
    occurrence,
    edge === "end" ? "resize-end" : "resize-start",
    resizeEventPlacement(originalOf(occurrence), edge, delta, { timeZone }),
  );
}
