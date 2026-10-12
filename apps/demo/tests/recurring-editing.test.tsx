// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { App } from "../src/app";
import type { DemoEvent } from "../src/calendar";
import { eventsStorageKey, legacyEventsStorageKey } from "../src/demo-events";
import { parseEvents, serializeEvents } from "../src/event-storage";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Weekdays at 09:00 UTC from Monday 5 October 2026.
const standup: DemoEvent = {
  calendarId: "work",
  end: Temporal.Instant.from("2026-10-05T09:15:00Z"),
  id: "standup",
  kind: "timed",
  recurrence: {
    rule: {
      byDay: ["MO", "TU", "WE", "TH", "FR"].map((weekday) => ({ weekday: weekday as "MO" })),
      frequency: "WEEKLY",
    },
  },
  sourceTimeZone: "UTC",
  start: Temporal.Instant.from("2026-10-05T09:00:00Z"),
  title: "Standup",
};
const focusTime: DemoEvent = {
  calendarId: "work",
  end: Temporal.Instant.from("2026-10-08T12:00:00Z"),
  id: "focus-time",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  title: "Focus time",
};
const thursday = "standup::2026-10-08T09:00:00Z";

const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);

let stored = new Map<string, string>();

beforeEach(() => {
  stored = new Map([
    [eventsStorageKey, serializeEvents([standup, focusTime])],
    [
      "moltenship-demo:settings",
      JSON.stringify({ locale: "en-US", timeZone: "UTC", weekStartsOn: 1 }),
    ],
  ]);
  // Node's experimental localStorage global shadows jsdom's, so stub a small one.
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    removeItem: (key: string) => stored.delete(key),
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
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
});

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const pastSaveDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, 700)));
const eventButton = (id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-event-id="${id}"]`);
/** An event's accessible name, with the narrow spaces `Intl` puts in times made plain. */
const label = (id: string) => eventButton(id)?.getAttribute("aria-label")?.replace(/\s/g, " ");
const scopeDialog = () =>
  [...document.querySelectorAll('[role="dialog"]')].find((dialog) =>
    dialog.textContent?.includes("recurring event"),
  );
const choose = (label: string) =>
  act(async () =>
    [...(scopeDialog()?.querySelectorAll("button") ?? [])]
      .find((button) => button.textContent === label)
      ?.click(),
  );
const saved = () => parseEvents(stored.get(eventsStorageKey) ?? null) ?? [];

async function pressKey(key: string) {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

/** Grabs the occurrence with the keyboard and moves it down a step, which proposes a change. */
async function moveDown(id: string) {
  await act(async () => eventButton(id)?.focus());
  await pressKey(" ");
  await pressKey("ArrowDown");
  await pressKey("Enter");
  await settle();
}

test("shows occurrences with a repeat mark and says they repeat", async () => {
  await act(async () => root.render(<App />));
  const chip = eventButton(thursday);

  expect(label(thursday)).toBe(
    "Standup, Thursday, October 8, 9:00 – 9:15 AM, Work calendar, repeating event",
  );
  expect(
    chip?.querySelector('[data-slot="calendar-event-icon"]')?.getAttribute("aria-hidden"),
  ).toBe("true");
  expect(eventButton("focus-time")?.querySelector('[data-slot="calendar-event-icon"]')).toBeNull();

  await act(async () => chip?.click());
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Every weekday");
});

test("a move asks for its scope while it waits, and cancelling rolls it back", async () => {
  await act(async () => root.render(<App />));
  await moveDown(thursday);

  expect(scopeDialog()?.textContent).toContain("“Standup” repeats");
  expect(
    [...(scopeDialog()?.querySelectorAll("button") ?? [])].map((button) => button.textContent),
  ).toEqual(["This event", "This and following events", "All events", "Cancel"]);
  expect(label(thursday)).toContain("9:15 – 9:30 AM");

  await choose("Cancel");
  await settle();
  expect(label(thursday)).toContain("9:00 – 9:15 AM");
  expect(saved()).toHaveLength(2);
});

test('"This event" saves an override and keeps the occurrence and its focus', async () => {
  await act(async () => root.render(<App />));
  await moveDown(thursday);
  await choose("This event");
  await pastSaveDelay();

  const override = saved().find(({ override }) => override !== undefined);
  expect(override?.start.toString()).toBe("2026-10-08T09:15:00Z");
  expect(override?.override?.recurrenceId.toString()).toBe("2026-10-08T09:00:00Z");
  expect(label(thursday)).toContain("9:15 – 9:30 AM");
  expect(document.activeElement).toBe(eventButton(thursday));
});

test('"All events" moves the series, and focus follows the renamed occurrence', async () => {
  await act(async () => root.render(<App />));
  await moveDown(thursday);
  await choose("All events");
  await pastSaveDelay();

  const renamed = "standup::2026-10-08T09:15:00Z";
  expect(
    saved()
      .find(({ id }) => id === "standup")
      ?.start.toString(),
  ).toBe("2026-10-05T09:15:00Z");
  expect(eventButton(thursday)).toBeNull();
  expect(document.activeElement).toBe(eventButton(renamed));
});

test("deleting from the popover asks which occurrences, and all of them deletes the series", async () => {
  await act(async () => root.render(<App />));
  await act(async () => eventButton(thursday)?.click());
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Delete event"]')?.click(),
  );
  await settle();

  expect(scopeDialog()?.textContent).toContain("Which events do you want to delete?");
  await choose("All events");
  await pastSaveDelay();
  expect(saved().map(({ id }) => id)).toEqual(["focus-time"]);
  expect(eventButton(thursday)).toBeNull();
});

test("the editor saves a new title to the whole series through the scope dialog", async () => {
  await act(async () => root.render(<App />));
  await act(async () => eventButton(thursday)?.click());
  await act(async () =>
    document.querySelector<HTMLButtonElement>('button[aria-label="Edit event"]')?.click(),
  );
  await settle();

  const title = document.querySelector<HTMLInputElement>('input[aria-label="Title"]')!;
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    "Every weekday (Monday to Friday)",
  );
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(
      title,
      "Daily sync",
    );
    title.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    document.querySelector<HTMLFormElement>('[role="dialog"] form')?.requestSubmit(),
  );
  await settle();
  await choose("All events");
  await settle();

  expect(saved().find(({ id }) => id === "standup")?.title).toBe("Daily sync");
  expect(saved()).toHaveLength(2);
  expect(label(thursday)).toContain("Daily sync");
});

test("events saved before recurrence load, are upgraded once, and the old key goes", async () => {
  stored.delete(eventsStorageKey);
  stored.set(legacyEventsStorageKey, JSON.stringify([JSON.parse(serializeEvents([focusTime]))[0]]));
  await act(async () => root.render(<App />));

  expect(eventButton("focus-time")).not.toBeNull();
  const ids = saved().map(({ id }) => id);
  expect(ids).toContain("focus-time");
  expect(ids).toContain("standup");
  expect(stored.has(legacyEventsStorageKey)).toBe(false);
});
