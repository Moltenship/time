// @vitest-environment jsdom

import type { CalendarFocus } from "@moltenship/calendar-core";
import { expect, test, vi } from "vite-plus/test";

import { createRovingFocusStore } from "../src/roving-focus";

const day = (date: string): CalendarFocus => ({ date: Temporal.PlainDate.from(date), kind: "day" });

test("elements registering in one commit notify once, and the tab stop is current at once", async () => {
  const first = Temporal.PlainDate.from("2026-01-01");
  const store = createRovingFocusStore(() => day("2026-01-01"));
  const listener = vi.fn();
  store.subscribe(listener);

  // A year of day cells, as one commit attaches their refs.
  const elements = Array.from({ length: 365 }, (_, index) => {
    const element = document.createElement("div");
    document.body.append(element);
    store.register(element, day(first.add({ days: index }).toString()), 1);
    return element;
  });

  expect(listener).not.toHaveBeenCalled();
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(1);

  // Focus moves are told at once, as the view's keys expect.
  store.update(day("2026-03-04"), () => day("2026-01-01"));
  expect(listener).toHaveBeenCalledTimes(2);
  expect(store.isTabStop(day("2026-03-04"), 1)).toBe(true);
  for (const element of elements) element.remove();
});
