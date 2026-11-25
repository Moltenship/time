import { isDemoCalendarId, type DemoCalendarId } from "./calendars";

/** Where the calendars switched off in the sidebar are saved. */
export const hiddenCalendarsStorageKey = "moltenship-demo:hidden-calendars";

export function parseHiddenCalendars(stored: string | null): ReadonlySet<DemoCalendarId> {
  try {
    const value: unknown = JSON.parse(stored ?? "[]");
    return new Set(Array.isArray(value) ? value.filter(isDemoCalendarId) : []);
  } catch {
    return new Set();
  }
}

export function serializeHiddenCalendars(hidden: ReadonlySet<DemoCalendarId>): string {
  return JSON.stringify([...hidden]);
}

/** `hidden` with `calendarId` shown if it was hidden, and hidden if it was shown. */
export function toggleHidden<T>(hidden: ReadonlySet<T>, id: T): ReadonlySet<T> {
  const next = new Set(hidden);
  if (!next.delete(id)) next.add(id);
  return next;
}
