import type { DemoEvent } from "./calendar";
import { isDemoCalendarId } from "./calendars";

export const eventsStorageKey = "moltenship-demo:events";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvent(value: unknown): DemoEvent {
  if (!isRecord(value)) throw new TypeError("invalid-stored-event");
  const { calendarId, description, end, id, kind, start, title } = value;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof start !== "string" ||
    typeof end !== "string" ||
    !isDemoCalendarId(calendarId) ||
    (description !== undefined && typeof description !== "string")
  ) {
    throw new TypeError("invalid-stored-event");
  }

  const base = { calendarId, id, title, ...(description === undefined ? {} : { description }) };
  if (kind === "timed") {
    return { ...base, end: Temporal.Instant.from(end), kind, start: Temporal.Instant.from(start) };
  }
  if (kind === "all-day") {
    return {
      ...base,
      end: Temporal.PlainDate.from(end),
      kind,
      start: Temporal.PlainDate.from(start),
    };
  }
  throw new TypeError("invalid-stored-event");
}

/** Temporal values serialize to ISO strings through their `toJSON`. */
export function serializeEvents(events: readonly DemoEvent[]): string {
  return JSON.stringify(events);
}

/** Returns `null` when nothing is stored or the stored value no longer matches the event shape. */
export function parseEvents(stored: string | null): DemoEvent[] | null {
  if (stored === null) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return Array.isArray(value) ? value.map(parseEvent) : null;
  } catch {
    return null;
  }
}
