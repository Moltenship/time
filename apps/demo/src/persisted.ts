import { useCallback, useEffect, useRef, useState } from "react";

import {
  hiddenSourcesStorageKey,
  parseHiddenSources,
  serializeHiddenSources,
  type DemoAnnotationSourceId,
} from "./annotations";
import type { DemoEvent } from "./demo-model";
import { eventsStorageKey, seedAroundToday } from "./demo-events";
import { applyEventChange, type DemoEventChange } from "./event-changes";
import { parseEvents, serializeEvents } from "./event-storage";
import {
  hiddenCalendarsStorageKey,
  parseHiddenCalendars,
  serializeHiddenCalendars,
  toggleHidden,
} from "./hidden-calendars";
import type { DemoCalendarId } from "./calendars";
import { defaultSettings, parseSettings, serializeSettings, settingsStorageKey } from "./settings";
import { readStorage, writeStorage } from "./storage";
import {
  loadTasks,
  seedTasks,
  serializeTasks,
  tasksStorageKey,
  type DemoTask,
  type DemoTaskList,
} from "./tasks";

// The demo's saved state as React state. What it saves and how is framework-free, in the modules
// it imports, which the Solid demo saves with too, under the same keys.

export function usePersistentState<T>(
  key: string,
  load: (stored: string | null) => T,
  serialize: (value: T) => string,
) {
  const [value, setValue] = useState(() => load(readStorage(key)));

  useEffect(() => writeStorage(key, serialize(value)), [key, serialize, value]);

  return [value, setValue] as const;
}

export function useDemoSettings() {
  return usePersistentState(
    settingsStorageKey,
    (stored) => parseSettings(stored, defaultSettings()),
    serializeSettings,
  );
}

export function useHiddenCalendars() {
  const [hidden, setHidden] = usePersistentState(
    hiddenCalendarsStorageKey,
    parseHiddenCalendars,
    serializeHiddenCalendars,
  );
  const toggleCalendar = useCallback(
    (calendarId: DemoCalendarId) => setHidden((current) => toggleHidden(current, calendarId)),
    [setHidden],
  );

  return [hidden, toggleCalendar] as const;
}

/** Which annotation sources the sidebar hides; hiding one leaves it out of `annotationSources`. */
export function useHiddenAnnotationSources() {
  const [hidden, setHidden] = usePersistentState(
    hiddenSourcesStorageKey,
    parseHiddenSources,
    serializeHiddenSources,
  );
  const toggleSource = useCallback(
    (sourceId: DemoAnnotationSourceId) => setHidden((current) => toggleHidden(current, sourceId)),
    [setHidden],
  );
  return [hidden, toggleSource] as const;
}

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

/** The unscheduled tasks, persisted to localStorage. */
export function useDemoTasks(): DemoTaskList {
  const [tasks, setTasks] = usePersistentState(tasksStorageKey, loadTasks, serializeTasks);
  const resets = useRef(0);
  const addTask = useCallback(
    (task: DemoTask) =>
      setTasks((current) => [task, ...current.filter(({ id }) => id !== task.id)]),
    [setTasks],
  );
  const removeTask = useCallback(
    (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    [setTasks],
  );
  const resetTasks = useCallback(() => {
    resets.current += 1;
    setTasks(seedTasks);
  }, [setTasks]);
  return { addTask, removeTask, resets, resetTasks, tasks };
}
