// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { App } from "../src/app";
import type { DemoEvent } from "../src/calendar";
import { serializeEvents } from "../src/event-storage";

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
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);

beforeEach(() => {
  // Node's experimental localStorage global shadows jsdom's, so stub a small one.
  const stored = new Map([
    ["moltenship-demo:events", serializeEvents([focusTime])],
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
