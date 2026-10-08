import { useCallback } from "react";

import { isDemoCalendarId, type DemoCalendarId } from "./calendars";
import { usePersistentState } from "./storage";

function parseHiddenCalendars(stored: string | null): ReadonlySet<DemoCalendarId> {
  try {
    const value: unknown = JSON.parse(stored ?? "[]");
    return new Set(Array.isArray(value) ? value.filter(isDemoCalendarId) : []);
  } catch {
    return new Set();
  }
}

function serializeHiddenCalendars(hidden: ReadonlySet<DemoCalendarId>): string {
  return JSON.stringify([...hidden]);
}

export function useHiddenCalendars() {
  const [hidden, setHidden] = usePersistentState(
    "moltenship-demo:hidden-calendars",
    parseHiddenCalendars,
    serializeHiddenCalendars,
  );
  const toggleCalendar = useCallback(
    (calendarId: DemoCalendarId) =>
      setHidden((current) => {
        const next = new Set(current);
        if (!next.delete(calendarId)) next.add(calendarId);
        return next;
      }),
    [setHidden],
  );

  return [hidden, toggleCalendar] as const;
}
