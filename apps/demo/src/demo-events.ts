import { useCallback } from "react";

import type { DemoEvent } from "./calendar";
import { parseEvents, serializeEvents } from "./event-storage";
import { createSeedEvents } from "./seed";
import { usePersistentState } from "./storage";

const seedAroundToday = (timeZone: string) =>
  createSeedEvents(Temporal.Now.plainDateISO(timeZone), timeZone);

/** Demo events in memory, persisted to localStorage, and seeded around today on first visit. */
export function useDemoEvents(timeZone: string) {
  const [events, setEvents] = usePersistentState(
    "moltenship-demo:events",
    (stored) => parseEvents(stored) ?? seedAroundToday(timeZone),
    serializeEvents,
  );
  const saveEvent = useCallback(
    (event: DemoEvent) =>
      setEvents((current) =>
        current.some(({ id }) => id === event.id)
          ? current.map((existing) => (existing.id === event.id ? event : existing))
          : [...current, event],
      ),
    [setEvents],
  );
  const deleteEvent = useCallback(
    (eventId: string) => setEvents((current) => current.filter(({ id }) => id !== eventId)),
    [setEvents],
  );
  const resetEvents = useCallback(
    () => setEvents(seedAroundToday(timeZone)),
    [setEvents, timeZone],
  );

  return { deleteEvent, events, resetEvents, saveEvent };
}
