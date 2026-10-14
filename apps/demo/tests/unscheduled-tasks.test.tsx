// @vitest-environment jsdom
// First, so dnd-kit, which the demo's sidebar uses, finds the ResizeObserver it reads as it loads.
import "./resize-observer";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { App } from "../src/app";
import type { DemoEvent } from "../src/calendar";
import { eventsStorageKey } from "../src/demo-events";
import { parseEvents, serializeEvents } from "../src/event-storage";
import { tasksStorageKey, type DemoTask } from "../src/tasks";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const focusTime: DemoEvent = {
  calendarId: "work",
  description: "Heads down",
  end: Temporal.Instant.from("2026-10-08T12:00:00Z"),
  id: "focus-time",
  kind: "timed",
  resourceIds: ["room-orchid"],
  start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  title: "Focus time",
};
const dentist: DemoTask = {
  calendarId: "personal",
  id: "task-dentist",
  minutes: 30,
  title: "Call the dentist",
};
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);

let stored = new Map<string, string>();

beforeEach(() => {
  // Node's experimental localStorage global shadows jsdom's, so stub a small one.
  stored = new Map([
    [eventsStorageKey, serializeEvents([focusTime])],
    [tasksStorageKey, JSON.stringify([dentist])],
    [
      "moltenship-demo:settings",
      JSON.stringify({ locale: "en-US", timeZone: "UTC", weekStartsOn: 7 }),
    ],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: () => {},
    matches: false,
    removeEventListener: () => {},
  }));
  history.replaceState(null, "", "/?view=day&date=2026-10-08");
});

afterEach(async () => {
  await act(async () => root.render(null));
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const pastSaveDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, 700)));
const eventButton = (id: string) =>
  container.querySelector<HTMLButtonElement>(`main [data-event-id="${id}"]`);
const taskTitles = () =>
  [...container.querySelectorAll("aside li > button:first-child")].map(
    (card) => card.textContent?.split(",")[0],
  );
const storedTasks = () => JSON.parse(stored.get(tasksStorageKey) ?? "[]") as DemoTask[];
const undoToast = () =>
  document.querySelector('[aria-label="Notifications"] [role="dialog"]')?.textContent ?? null;

async function unscheduleFromPopover(id: string) {
  await act(async () => eventButton(id)?.click());
  const unschedule = document.querySelector<HTMLButtonElement>(
    'button[aria-label="Unschedule event"]',
  );
  expect(unschedule).not.toBeNull();
  await act(async () => unschedule?.click());
}

test("the popover unschedules a one-off event into a task, which no undo takes back", async () => {
  await act(async () => root.render(<App />));

  await unscheduleFromPopover("focus-time");
  // The task shows at once; the event goes once its delete is saved.
  expect(taskTitles()).toEqual(["Focus time", "Call the dentist"]);
  await pastSaveDelay();

  expect(eventButton("focus-time")).toBeNull();
  expect(parseEvents(stored.get(eventsStorageKey) ?? "")).toEqual([]);
  // It keeps what the event had, for when it's scheduled again.
  expect(storedTasks()[0]).toEqual({
    calendarId: "work",
    description: "Heads down",
    id: "focus-time",
    minutes: 120,
    resourceIds: ["room-orchid"],
    title: "Focus time",
  });
  // The history leaves unschedules out: a redo would lose the task.
  expect(undoToast()).toBeNull();
});

test("an unschedule that fails to save brings the event back and takes the task away", async () => {
  await act(async () => root.render(<App />));
  const failSaves = [...container.querySelectorAll('[role="checkbox"]')].find((checkbox) =>
    checkbox.closest("label")?.textContent?.includes("Simulate failing saves"),
  );
  await act(async () => failSaves?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

  await unscheduleFromPopover("focus-time");
  expect(taskTitles()).toContain("Focus time");
  await pastSaveDelay();
  await settle();

  expect(eventButton("focus-time")).not.toBeNull();
  expect(taskTitles()).toEqual(["Call the dentist"]);
});

test("the editor schedules a task under its own ID, and keeps it when cancelled", async () => {
  await act(async () => root.render(<App />));
  const schedule = () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Schedule Call the dentist"]');

  await act(async () => schedule()?.click());
  await settle();
  let dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("New event");
  expect(dialog?.querySelector<HTMLInputElement>('input[aria-label="Title"]')?.value).toBe(
    "Call the dentist",
  );
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
  });
  await settle();
  expect(taskTitles()).toEqual(["Call the dentist"]);

  await act(async () => schedule()?.click());
  await settle();
  dialog = document.querySelector('[role="dialog"]');
  const save = [...(dialog?.querySelectorAll("button") ?? [])].find(
    (button) => button.textContent?.trim() === "Save",
  );
  await act(async () => save?.click());
  await settle();

  expect(taskTitles()).toEqual([]);
  expect(eventButton("task-dentist")?.getAttribute("aria-label")).toMatch(/^Call the dentist, /);
  // Focus goes back to the list, as the task's button is gone.
  expect(document.activeElement?.tagName).toBe("UL");
});
