import {
  formatRecurrenceRule,
  recurrenceKey,
  type EventRecurrence,
  type RecurrenceDate,
  type RecurrenceOverride,
  type RecurrencePeriod,
} from "@moltenship/calendar-recurrence";

import type { DemoEvent } from "./calendar";
import { isDemoCalendarId } from "./calendars";
import { readRule } from "./repeat";
import { isDemoResourceId } from "./resources";
import { isRecord } from "./storage";

const invalid = () => new TypeError("invalid-stored-event");

/** A series date as `recurrenceKey` writes it: `…Z` for an instant, `…T…` for a wall time. */
function parseRecurrenceDate(value: unknown): RecurrenceDate {
  if (typeof value !== "string") throw invalid();
  if (value.endsWith("Z")) return Temporal.Instant.from(value);
  return value.includes("T") ? Temporal.PlainDateTime.from(value) : Temporal.PlainDate.from(value);
}

function parseDates<T>(value: unknown, parse: (item: unknown) => T): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw invalid();
  return value.map(parse);
}

function parseRecurrence(value: unknown): EventRecurrence | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid();
  const { duration, exceptionDates, recurrenceDates, rule, wallStart } = value;
  if (rule !== undefined && typeof rule !== "string") throw invalid();
  const parsedRule = rule === undefined ? undefined : readRule(rule);
  if (rule !== undefined && parsedRule === undefined) throw invalid();
  if (duration !== undefined && typeof duration !== "string") throw invalid();
  if (wallStart !== undefined && typeof wallStart !== "string") throw invalid();

  const exceptions = parseDates(exceptionDates, parseRecurrenceDate);
  const extras = parseDates(recurrenceDates, (item): RecurrenceDate | RecurrencePeriod =>
    isRecord(item)
      ? { end: parseRecurrenceDate(item.end), start: parseRecurrenceDate(item.start) }
      : parseRecurrenceDate(item),
  );
  return {
    ...(parsedRule === undefined ? {} : { rule: parsedRule }),
    ...(exceptions === undefined ? {} : { exceptionDates: exceptions }),
    ...(extras === undefined ? {} : { recurrenceDates: extras }),
    ...(duration === undefined ? {} : { duration: Temporal.Duration.from(duration) }),
    ...(wallStart === undefined ? {} : { wallStart: Temporal.PlainDateTime.from(wallStart) }),
  };
}

function parseOverride(value: unknown): RecurrenceOverride<string> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw invalid();
  const { cancelled, recurrenceId, seriesId } = value;
  if (typeof seriesId !== "string" || (cancelled !== undefined && cancelled !== true)) {
    throw invalid();
  }
  return {
    ...(cancelled === true ? { cancelled } : {}),
    recurrenceId: parseRecurrenceDate(recurrenceId),
    seriesId,
  };
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    Temporal.Now.zonedDateTimeISO(value);
    return true;
  } catch {
    return false;
  }
}

function parseEvent(value: unknown): DemoEvent {
  if (!isRecord(value)) throw invalid();
  const { calendarId, description, end, id, kind, resourceIds, sourceTimeZone, start, title } =
    value;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof start !== "string" ||
    typeof end !== "string" ||
    !isDemoCalendarId(calendarId) ||
    (description !== undefined && typeof description !== "string") ||
    (resourceIds !== undefined &&
      !(Array.isArray(resourceIds) && resourceIds.every(isDemoResourceId)))
  ) {
    throw invalid();
  }

  // Events saved before recurrence have neither field, and load as one-off events.
  const recurrence = parseRecurrence(value.recurrence);
  const override = parseOverride(value.override);
  const base = {
    calendarId,
    id,
    title,
    ...(description === undefined ? {} : { description }),
    ...(override === undefined ? {} : { override }),
    ...(recurrence === undefined ? {} : { recurrence }),
    ...(resourceIds === undefined ? {} : { resourceIds }),
  };
  if (kind === "timed") {
    if (sourceTimeZone !== undefined && !isTimeZone(sourceTimeZone)) throw invalid();
    return {
      ...base,
      end: Temporal.Instant.from(end),
      kind,
      ...(sourceTimeZone === undefined ? {} : { sourceTimeZone }),
      start: Temporal.Instant.from(start),
    };
  }
  if (kind === "all-day") {
    return {
      ...base,
      end: Temporal.PlainDate.from(end),
      kind,
      start: Temporal.PlainDate.from(start),
    };
  }
  throw invalid();
}

function serializeRecurrence({
  duration,
  exceptionDates,
  recurrenceDates,
  rule,
  wallStart,
}: EventRecurrence) {
  return {
    ...(rule === undefined ? {} : { rule: formatRecurrenceRule(rule) }),
    ...(exceptionDates === undefined ? {} : { exceptionDates: exceptionDates.map(recurrenceKey) }),
    ...(recurrenceDates === undefined
      ? {}
      : {
          recurrenceDates: recurrenceDates.map((date) =>
            "start" in date
              ? { end: recurrenceKey(date.end), start: recurrenceKey(date.start) }
              : recurrenceKey(date),
          ),
        }),
    ...(duration === undefined ? {} : { duration: duration.toString() }),
    ...(wallStart === undefined ? {} : { wallStart: wallStart.toString() }),
  };
}

/**
 * Temporal values serialize to ISO strings through their `toJSON`; a series' rule is stored as
 * RRULE text and its dates in `recurrenceKey`'s form, which tells their kinds apart.
 */
export function serializeEvents(events: readonly DemoEvent[]): string {
  return JSON.stringify(
    events.map(({ override, recurrence, ...event }) => ({
      ...event,
      ...(override === undefined
        ? {}
        : { override: { ...override, recurrenceId: recurrenceKey(override.recurrenceId) } }),
      ...(recurrence === undefined ? {} : { recurrence: serializeRecurrence(recurrence) }),
    })),
  );
}

/**
 * Returns `null` when nothing is stored or the stored value no longer matches the event shape.
 * Events stored before the demo had recurrence parse too: they're one-off events.
 */
export function parseEvents(stored: string | null): DemoEvent[] | null {
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value) ? value.map(parseEvent) : null;
  } catch {
    return null;
  }
}
