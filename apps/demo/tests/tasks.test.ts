import { describe, expect, test } from "vite-plus/test";

import type { DemoOccurrence } from "../src/calendar";
import { draftForTask } from "../src/event-draft";
import {
  loadTasks,
  seedTasks,
  taskFromOccurrence,
  taskOccurrence,
  type DemoTask,
} from "../src/tasks";

const task: DemoTask = { calendarId: "work", id: "task-1", minutes: 45, title: "Review" };

function occurrence(overrides: Partial<DemoOccurrence> = {}): DemoOccurrence {
  const start = Temporal.Instant.from("2026-10-08T09:00:00Z");
  const end = Temporal.Instant.from("2026-10-08T10:30:00Z");
  return {
    event: { calendarId: "personal", end, id: "dentist", kind: "timed", start, title: "Dentist" },
    id: "dentist",
    interval: { end, kind: "timed", start },
    ...overrides,
  };
}

describe("unscheduled tasks", () => {
  test("load the saved tasks, or the seed when there are none or they don't read", () => {
    expect(loadTasks(JSON.stringify([task]))).toEqual([task]);
    expect(loadTasks(null)).toBe(seedTasks);
    expect(loadTasks("not json")).toBe(seedTasks);
    expect(loadTasks(JSON.stringify([{ ...task, minutes: 0 }]))).toBe(seedTasks);
    expect(loadTasks(JSON.stringify([{ ...task, calendarId: "elsewhere" }]))).toBe(seedTasks);
  });

  test("a task becomes a one-off event under its own ID, as long as it takes", () => {
    const made = taskOccurrence(task);

    expect(made.id).toBe("task-1");
    expect(made.event).toMatchObject({ calendarId: "work", id: "task-1", title: "Review" });
    expect(made.recurrence).toBeUndefined();
    if (made.interval.kind !== "timed") throw new Error("expected a timed event");
    expect(made.interval.start.until(made.interval.end).total({ unit: "minutes" })).toBe(45);
  });

  test("a timed one-off event becomes a task again, the same length", () => {
    expect(taskFromOccurrence(occurrence())).toEqual({
      calendarId: "personal",
      id: "dentist",
      minutes: 90,
      title: "Dentist",
    });
  });

  test("series, all-day events and live meetings stay on the calendar", () => {
    const base = occurrence();
    const allDay = Temporal.PlainDate.from("2026-10-08");
    expect(
      taskFromOccurrence({
        ...base,
        interval: { end: allDay.add({ days: 1 }), kind: "all-day", start: allDay },
      }),
    ).toBeNull();
    expect(taskFromOccurrence({ ...base, event: { ...base.event, live: true } })).toBeNull();
    expect(
      taskFromOccurrence({ ...base, recurrence: {} as NonNullable<DemoOccurrence["recurrence"]> }),
    ).toBeNull();
  });

  test("scheduling from the editor starts on the next half hour and takes the task's length", () => {
    const now = Temporal.ZonedDateTime.from("2026-10-08T10:10:00[Europe/Berlin]");
    const draft = draftForTask(task, now.toPlainDate(), now);

    expect(draft).toMatchObject({
      calendarId: "work",
      endTime: Temporal.PlainTime.from("11:15"),
      startTime: Temporal.PlainTime.from("10:30"),
      title: "Review",
    });
  });
});
