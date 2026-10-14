import { useCallback } from "react";

import type { DemoEvent, DemoOccurrence } from "./calendar";
import { isDemoCalendarId, type DemoCalendarId } from "./calendars";
import { isRecord, usePersistentState } from "./storage";

/** Something to do that isn't on the calendar yet: dragged onto it, it becomes an event. */
export interface DemoTask {
  readonly calendarId: DemoCalendarId;
  /** Also the ID of the event it becomes, so an event unscheduled again is the same task. */
  readonly id: string;
  /** How long it takes, which the event it becomes lasts. */
  readonly minutes: number;
  readonly title: string;
}

export const tasksStorageKey = "moltenship-demo:tasks:v1";

/** The tasks a first visit, or a reset, starts with. */
export const seedTasks: readonly DemoTask[] = [
  { calendarId: "work", id: "task-q4-report", minutes: 90, title: "Draft the Q4 report" },
  { calendarId: "work", id: "task-design-review", minutes: 45, title: "Review the design doc" },
  { calendarId: "personal", id: "task-dentist", minutes: 30, title: "Call the dentist" },
  { calendarId: "fitness", id: "task-run", minutes: 60, title: "Long run" },
];

function isTask(value: unknown): value is DemoTask {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Number.isInteger(value.minutes) &&
    (value.minutes as number) > 0 &&
    isDemoCalendarId(value.calendarId)
  );
}

/** The saved tasks, or the seed when there are none or they don't read. */
export function loadTasks(stored: string | null): readonly DemoTask[] {
  if (stored === null) return seedTasks;
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) && parsed.every(isTask) ? parsed : seedTasks;
  } catch {
    return seedTasks;
  }
}

const serializeTasks = (tasks: readonly DemoTask[]) => JSON.stringify(tasks);

/** The unscheduled tasks and what changes them, from `useDemoTasks`. */
export type DemoTaskList = ReturnType<typeof useDemoTasks>;

/** The unscheduled tasks, persisted to localStorage. */
export function useDemoTasks() {
  const [tasks, setTasks] = usePersistentState(tasksStorageKey, loadTasks, serializeTasks);
  const addTask = useCallback(
    (task: DemoTask) =>
      setTasks((current) => [task, ...current.filter(({ id }) => id !== task.id)]),
    [setTasks],
  );
  const removeTask = useCallback(
    (id: string) => setTasks((current) => current.filter((task) => task.id !== id)),
    [setTasks],
  );
  const resetTasks = useCallback(() => setTasks(seedTasks), [setTasks]);
  return { addTask, removeTask, resetTasks, tasks };
}

/**
 * The record a task becomes when it's dropped on the calendar: a one-off event under the task's
 * ID. Its times are placeholders; the drop's placement replaces them.
 */
export function taskOccurrence(task: DemoTask): DemoOccurrence {
  const start = Temporal.Instant.fromEpochMilliseconds(0);
  const end = start.add({ minutes: task.minutes });
  const event: DemoEvent = {
    calendarId: task.calendarId,
    end,
    id: task.id,
    kind: "timed",
    start,
    title: task.title,
  };
  return { event, id: task.id, interval: { end, kind: "timed", start } };
}

/**
 * The task an event becomes when it's unscheduled, or `null` for one that can't be: only timed
 * one-off events, which a task's length describes. Series, all-day events and the read-only live
 * meetings stay on the calendar.
 */
export function taskFromOccurrence(occurrence: DemoOccurrence): DemoTask | null {
  const { event, interval, recurrence } = occurrence;
  if (recurrence !== undefined || event.live === true || interval.kind !== "timed") return null;
  const minutes = Math.round(interval.start.until(interval.end).total({ unit: "minutes" }));
  return { calendarId: event.calendarId, id: event.id, minutes, title: event.title };
}
