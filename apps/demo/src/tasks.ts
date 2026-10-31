import { useCallback, useRef } from "react";

import type { DemoEvent, DemoOccurrence } from "./demo-model";
import { isDemoCalendarId, type DemoCalendarId } from "./calendars";
import { isDemoResourceId, type DemoResourceId } from "./resources";
import { isRecord, usePersistentState } from "./storage";

/** Something to do that isn't on the calendar yet: dragged onto it, it becomes an event. */
export interface DemoTask {
  readonly calendarId: DemoCalendarId;
  /** Kept from an event unscheduled into a task, for the event it becomes again. */
  readonly description?: string;
  /** Also the ID of the event it becomes, so an event unscheduled again is the same task. */
  readonly id: string;
  /** How long it takes, which the event it becomes lasts. */
  readonly minutes: number;
  /** Kept from an event unscheduled into a task, for the event it becomes again. */
  readonly resourceIds?: readonly DemoResourceId[];
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
    isDemoCalendarId(value.calendarId) &&
    (value.description === undefined || typeof value.description === "string") &&
    (value.resourceIds === undefined ||
      (Array.isArray(value.resourceIds) && value.resourceIds.every(isDemoResourceId)))
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
  /** Counts resets, so an unschedule still saving when the data was reset leaves the seed alone. */
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

/** The records tasks become, which a create carries when a task is dropped on the calendar. */
const taskRecords = new WeakSet<DemoOccurrence>();

/** Whether a create's record is a task dropped on the calendar, rather than an event restored. */
export function isTaskRecord(record: DemoOccurrence | null): boolean {
  return record !== null && taskRecords.has(record);
}

/**
 * The record a task becomes when it's dropped on the calendar: a one-off event under the task's
 * ID. Its times are placeholders; the drop's placement replaces them.
 */
export function taskOccurrence(task: DemoTask): DemoOccurrence {
  const start = Temporal.Instant.fromEpochMilliseconds(0);
  const end = start.add({ minutes: task.minutes });
  const { calendarId, description, id, resourceIds, title } = task;
  const event: DemoEvent = {
    calendarId,
    ...(description === undefined ? {} : { description }),
    end,
    id,
    kind: "timed",
    ...(resourceIds === undefined ? {} : { resourceIds }),
    start,
    title,
  };
  const occurrence: DemoOccurrence = { event, id, interval: { end, kind: "timed", start } };
  taskRecords.add(occurrence);
  return occurrence;
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
  const { calendarId, description, id, resourceIds, title } = event;
  return {
    calendarId,
    ...(description === undefined ? {} : { description }),
    id,
    minutes,
    ...(resourceIds === undefined ? {} : { resourceIds }),
    title,
  };
}

/**
 * Moves focus to a task's card, as after its event was unscheduled from the popover, once the card
 * has rendered. Nothing happens where the list isn't shown, as on a phone.
 */
export function focusTask(id: string): void {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`aside [data-task-id="${CSS.escape(id)}"]`)?.focus();
  });
}
