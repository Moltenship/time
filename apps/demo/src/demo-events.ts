import { useCallback } from "react";

import type { DemoEvent } from "./demo-model";
import { applyEventChange, type DemoEventChange } from "./event-changes";
import { parseEvents, serializeEvents } from "./event-storage";
import { createRoutineEvents } from "./routine";
import { createSeedEvents } from "./seed";
import { createSeriesEvents } from "./seed-series";
import { usePersistentState } from "./storage";

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

/** Demo events in memory, persisted to localStorage, and seeded around today on first visit. */
export function useDemoEvents(timeZone: string) {
  const [events, setEvents] = usePersistentState<readonly DemoEvent[]>(
    eventsStorageKey,
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
