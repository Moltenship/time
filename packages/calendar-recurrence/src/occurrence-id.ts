import type { EventId } from "@moltenship/calendar-core";

import type { RecurrenceDate } from "./types";

const separator = "::";

/**
 * The ISO form of an occurrence's original start: `2026-10-28T09:00:00Z` for timed series,
 * `2026-10-28` for all-day ones and `2026-10-28T10:00:00` for floating ones. Instants are UTC, so
 * the key doesn't depend on the time zone the calendar shows.
 */
export function recurrenceKey(recurrenceId: RecurrenceDate): string {
  return recurrenceId.toString();
}

/**
 * The ID of one occurrence of a series. It stays the same across views, time zones and reloads, and
 * when an override moves the occurrence, since the override keeps the original start.
 */
export function occurrenceId(seriesId: EventId, recurrenceId: RecurrenceDate): string {
  return `${String(seriesId)}${separator}${recurrenceKey(recurrenceId)}`;
}

/**
 * Splits an `occurrenceId` into the series ID, as a string, and the recurrence key. `undefined` for
 * an ID without a recurrence key, such as a one-off event's.
 */
export function parseOccurrenceId(
  id: EventId,
): { readonly recurrenceKey: string; readonly seriesId: string } | undefined {
  if (typeof id !== "string") return undefined;
  // ISO keys never contain the separator, so the last one ends the series ID.
  const index = id.lastIndexOf(separator);
  if (index <= 0) return undefined;
  const key = id.slice(index + separator.length);
  return key === "" ? undefined : { recurrenceKey: key, seriesId: id.slice(0, index) };
}
