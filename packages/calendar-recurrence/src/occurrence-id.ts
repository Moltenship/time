import type { EventId } from "@moltenship/calendar-core";

import type { RecurrenceDate } from "./types";

const separator = "::";

// The three key forms `recurrenceKey` writes, with extended years and fractional seconds.
const year = String.raw`(?:\d{4}|[+-]\d{6})`;
const date = String.raw`${year}-\d{2}-\d{2}`;
const time = String.raw`T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?`;
const keyPattern = new RegExp(String.raw`^${date}(?:${time}Z?)?$`);

/**
 * The ISO form of an occurrence's original start: `2026-10-28T09:00:00Z` for timed series,
 * `2026-10-28` for all-day ones and `2026-10-28T10:00:00` for floating ones, always in the ISO
 * calendar and without a calendar annotation. Instants are UTC, so the key doesn't depend on the
 * time zone the calendar shows. The format is stable, since applications persist IDs.
 */
export function recurrenceKey(recurrenceId: RecurrenceDate): string {
  if (recurrenceId instanceof Temporal.Instant) return recurrenceId.toString();
  return recurrenceId.withCalendar("iso8601").toString({ calendarName: "never" });
}

/**
 * The ID of one occurrence of a series. It stays the same across views, time zones and reloads, and
 * when an override moves the occurrence, since the override keeps the original start. Edits to the
 * whole series, or to this and following occurrences, change the starts and so the IDs.
 */
export function occurrenceId(seriesId: EventId, recurrenceId: RecurrenceDate): string {
  return `${String(seriesId)}${separator}${recurrenceKey(recurrenceId)}`;
}

/**
 * Splits an `occurrenceId` into the series ID, as a string, and the recurrence key. `undefined`
 * when the ID doesn't end in a recurrence key, as a one-off event's usually doesn't. Prefer
 * `RecurrenceOccurrence.recurrence`, which keeps the series ID's type; parse only IDs you stored.
 */
export function parseOccurrenceId(
  id: EventId,
): { readonly recurrenceKey: string; readonly seriesId: string } | undefined {
  if (typeof id !== "string") return undefined;
  // Keys never contain the separator, so the last one ends the series ID.
  const index = id.lastIndexOf(separator);
  if (index <= 0) return undefined;
  const key = id.slice(index + separator.length);
  return keyPattern.test(key) ? { recurrenceKey: key, seriesId: id.slice(0, index) } : undefined;
}
