// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { App } from "../src/app";
import type { DemoEvent } from "../src/calendar";
import { parseEvents, serializeEvents } from "../src/event-storage";
import { createSeedEvents } from "../src/seed";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const focusTime: DemoEvent = {
  calendarId: "work",
  end: Temporal.Instant.from("2026-10-08T12:00:00Z"),
  id: "focus-time",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  title: "Focus time",
};
const lunch: DemoEvent = {
  ...focusTime,
  end: Temporal.Instant.from("2026-10-08T13:30:00Z"),
  id: "lunch",
  start: Temporal.Instant.from("2026-10-08T12:30:00Z"),
  title: "Lunch",
};
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);

let stored = new Map<string, string>();

beforeEach(() => {
  // Node's experimental localStorage global shadows jsdom's, so stub a small one.
  stored = new Map([
    ["moltenship-demo:events", serializeEvents([focusTime, lunch])],
    [
      "moltenship-demo:settings",
      JSON.stringify({ locale: "en-US", timeZone: "UTC", weekStartsOn: 7 }),
    ],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
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

// Radix restores focus on a zero-delay timer after a layer unmounts.
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)));
const view = () => new URLSearchParams(location.search).get("view");
const eventButton = (id: string) =>
  container.querySelector<HTMLButtonElement>(`[data-event-id="${id}"]`);
const pastSaveDelay = () => act(() => new Promise((resolve) => setTimeout(resolve, 700)));

async function deleteFromPopover(id: string) {
  await act(async () => eventButton(id)?.click());
  const remove = document.querySelector<HTMLButtonElement>('button[aria-label="Delete event"]');
  await act(async () => remove?.click());
}

test("editing from the popover moves focus into the editor and keeps shortcuts out", async () => {
  await act(async () => root.render(<App />));
  const event = container.querySelector<HTMLButtonElement>('[data-event-id="focus-time"]');
  expect(event).not.toBeNull();

  await act(async () => event?.click());
  const edit = document.querySelector<HTMLButtonElement>('button[aria-label="Edit event"]');
  await act(async () => edit?.click());
  await settle();

  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Edit event");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Title");
  expect(dialog?.contains(document.activeElement)).toBe(true);

  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "m" }),
    );
  });
  expect(view()).toBe("day");

  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
  });
  await settle();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("focus-time");
});

test("names events with their calendar for screen readers", async () => {
  await act(async () => root.render(<App />));

  expect(eventButton("focus-time")?.getAttribute("aria-label")?.replace(/\s/g, " ")).toBe(
    "Focus time, Thursday, October 8, 10:00 AM – 12:00 PM, Work calendar",
  );
});

test("? lists the shortcuts and closing the list hands focus back", async () => {
  await act(async () => root.render(<App />));
  const event = eventButton("focus-time");
  event?.focus();

  await act(async () => {
    event?.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "?", shiftKey: true }));
  });
  await settle();
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.textContent).toContain("Keyboard shortcuts");
  expect(dialog?.textContent).toContain("Go to today");
  expect(dialog?.contains(document.activeElement)).toBe(true);

  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "Escape" }),
    );
  });
  await settle();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(eventButton("focus-time"));
});

test("deletes persist after the save delay and roll back when saves fail", async () => {
  await act(async () => root.render(<App />));
  const failSaves = [...container.querySelectorAll('[role="checkbox"]')].find((checkbox) =>
    checkbox.closest("label")?.textContent?.includes("Simulate failing saves"),
  );

  await act(async () => failSaves?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await deleteFromPopover("focus-time");
  expect(eventButton("focus-time")).toBeNull();
  await pastSaveDelay();
  expect(eventButton("focus-time")).not.toBeNull();
  expect(document.querySelector('[role="status"]')?.textContent).toContain("undone");

  await act(async () => failSaves?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await deleteFromPopover("lunch");
  await pastSaveDelay();
  expect(eventButton("lunch")).toBeNull();
  expect(stored.get("moltenship-demo:events")).not.toContain('"lunch"');
});

test("a reset during an in-flight delete keeps the fresh seed intact", async () => {
  const today = Temporal.Now.plainDateISO("UTC");
  stored.set("moltenship-demo:events", serializeEvents(createSeedEvents(today, "UTC")));
  history.replaceState(null, "", `/?view=day&date=${today.toString()}`);
  await act(async () => root.render(<App />));
  const deletedId = container.querySelector<HTMLElement>("[data-event-id]")?.dataset.eventId;
  if (deletedId === undefined) throw new Error("the seed has events today");

  await deleteFromPopover(deletedId);
  expect(eventButton(deletedId)).toBeNull();
  const reset = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Reset demo data"),
  );
  await act(async () => reset?.click());
  await pastSaveDelay();

  const ids = parseEvents(stored.get("moltenship-demo:events") ?? null)?.map(({ id }) => id);
  expect(ids).toContain(deletedId);
  expect(ids).toHaveLength(createSeedEvents(today, "UTC").length);
  expect(eventButton(deletedId)).not.toBeNull();
});
