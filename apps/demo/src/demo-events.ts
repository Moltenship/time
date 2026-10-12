import { useCallback, useEffect } from "react";

import type { DemoEvent } from "./calendar";
import { applyEventChange, type DemoEventChange } from "./event-changes";
import { parseEvents, serializeEvents } from "./event-storage";
import { createRoutineEvents } from "./routine";
import { createSeedEvents } from "./seed";
import { createSeriesEvents, upgradeSavedEvents } from "./seed-series";
import { readStorage, removeStorage, usePersistentState } from "./storage";

/** Three detailed weeks around today, its series, and a year of routine either way. */
function seedAroundToday(timeZone: string) {
  const today = Temporal.Now.plainDateISO(timeZone);
  return [
    ...createSeedEvents(today, timeZone),
    ...createSeriesEvents(today, timeZone),
    ...createRoutineEvents(today, timeZone),
  ];
}

/** The storage key; a new one when the seed changes, so returning visitors get the new seed. */
export const eventsStorageKey = "moltenship-demo:events:v4";
/** Where events were saved before the demo had recurrence; they're upgraded once, then removed. */
export const legacyEventsStorageKey = "moltenship-demo:events:v3";

/** The saved events, else those saved before recurrence brought up to date, else a fresh seed. */
export function loadEvents(stored: string | null, timeZone: string): DemoEvent[] {
  const events = parseEvents(stored);
  if (events !== null) return events;
  const legacy = parseEvents(readStorage(legacyEventsStorageKey));
  return legacy === null
    ? seedAroundToday(timeZone)
    : upgradeSavedEvents(legacy, Temporal.Now.plainDateISO(timeZone), timeZone);
}

/** Demo events in memory, persisted to localStorage, and seeded around today on first visit. */
export function useDemoEvents(timeZone: string) {
  const [events, setEvents] = usePersistentState<readonly DemoEvent[]>(
    eventsStorageKey,
    (stored) => loadEvents(stored, timeZone),
    serializeEvents,
  );
  // Runs after the effect above saves the events under the new key, and only once that worked.
  useEffect(() => {
    if (readStorage(eventsStorageKey) !== null) removeStorage(legacyEventsStorageKey);
  }, []);
  const saveEvent = useCallback(
    (event: DemoEvent) =>
      setEvents((current) =>
        current.some(({ id }) => id === event.id)
          ? current.map((existing) => (existing.id === event.id ? event : existing))
          : [...current, event],
      ),
    [setEvents],
  );
  const applyChange = useCallback(
    (change: DemoEventChange) => setEvents((current) => applyEventChange(current, change)),
    [setEvents],
  );
  const resetEvents = useCallback(
    () => setEvents(seedAroundToday(timeZone)),
    [setEvents, timeZone],
  );

  return { applyChange, events, resetEvents, saveEvent, setEvents };
}
