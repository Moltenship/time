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

const event = (date: string, eventId: string, resourceId?: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  eventId,
  kind: "event",
  resourceId,
});

function elements(count: number) {
  return Array.from({ length: count }, () =>
    document.body.appendChild(document.createElement("div")),
  );
}

test("elements a commit registers while it reads their tab stops resolve it once", () => {
  const first = Temporal.PlainDate.from("2026-01-01");
  const entry = vi.fn(() => day("2026-01-01"));
  const store = createRovingFocusStore(entry);
  store.update(day("2026-01-01"), entry);

  // As Solid renders a list: each element reads whether it's the tab stop, then registers.
  const all = elements(2_000);
  all.forEach((element, index) => {
    const target = day(first.add({ days: index }).toString());
    store.isTabStop(target, 1);
    store.register(element, target, 1);
  });

  // Once with no elements, once with the first: the reads after that find the tab stop kept.
  expect(entry).toHaveBeenCalledTimes(2);
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);
  for (const element of all) element.remove();
});

test("a later element moves the tab stop only where it lands better", () => {
  const store = createRovingFocusStore(() => day("2026-01-01"));
  const [entryDay, other, copy, own] = elements(4);
  store.update(event("2026-01-02", "a", "r1"), () => day("2026-01-01"));
  store.register(entryDay!, day("2026-01-01"), 1);
  // The focus isn't rendered: the entry is the tab stop.
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);
  store.register(other!, event("2026-01-02", "b", "r1"), 1);
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);

  // A copy of the focused event in no resource lands on it, so it takes the tab stop.
  store.register(copy!, event("2026-01-02", "a"), 1);
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(false);
  expect(store.isTabStop(event("2026-01-02", "a"), 1)).toBe(true);

  // The event in the focus's own resource beats the copy, though it registers later.
  store.register(own!, event("2026-01-02", "a", "r1"), 1);
  expect(store.isTabStop(event("2026-01-02", "a"), 1)).toBe(false);
  expect(store.isTabStop(event("2026-01-02", "a", "r1"), 1)).toBe(true);
  for (const element of [entryDay, other, copy, own]) element!.remove();
});

test("the tab stop's element leaving or showing another target moves the tab stop", () => {
  const store = createRovingFocusStore(() => day("2026-01-01"));
  const [entryDay, focused] = elements(2);
  store.update(day("2026-01-05"), () => day("2026-01-01"));
  store.register(entryDay!, day("2026-01-01"), 1);
  const release = store.register(focused!, day("2026-01-05"), 1);
  expect(store.isTabStop(day("2026-01-05"), 1)).toBe(true);

  // The same element registering again for the same target keeps it.
  store.register(focused!, day("2026-01-05"), 1);
  expect(store.isTabStop(day("2026-01-05"), 1)).toBe(true);

  // For another target, it no longer shows the focus: the entry takes the tab stop.
  store.register(focused!, day("2026-01-06"), 1);
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);

  // Back on the focus, then gone.
  const again = store.register(focused!, day("2026-01-05"), 1);
  expect(store.isTabStop(day("2026-01-05"), 1)).toBe(true);
  release();
  expect(store.isTabStop(day("2026-01-05"), 1)).toBe(true);
  again();
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);
  for (const element of [entryDay, focused]) element!.remove();
});

test("with neither the focus nor the entry rendered, the first element in the document is the tab stop", () => {
  const store = createRovingFocusStore(() => day("2026-01-01"));
  const [later, earlier] = elements(2);
  store.update(day("2026-02-01"), () => day("2026-01-01"));
  store.register(later!, day("2026-01-10"), 1);
  expect(store.isTabStop(day("2026-01-10"), 1)).toBe(true);
  document.body.prepend(earlier!);
  store.register(earlier!, day("2026-01-09"), 1);
  expect(store.isTabStop(day("2026-01-09"), 1)).toBe(true);
  for (const element of [later, earlier]) element!.remove();
});

test("paging back enters from the end on the elements that register next", () => {
  const store = createRovingFocusStore((command) =>
    command === "end" ? day("2026-01-07") : day("2026-01-01"),
  );
  const all = elements(8);
  store.update(null, (command) => (command === "end" ? day("2026-01-07") : day("2026-01-01")));
  all.slice(0, 7).forEach((element, index) => {
    store.register(element, day(`2026-01-0${index + 1}`), 1);
  });
  expect(store.isTabStop(day("2026-01-01"), 1)).toBe(true);
  store.enterFromEnd();
  store.register(all[7]!, day("2026-01-08"), 1);
  expect(store.isTabStop(day("2026-01-07"), 1)).toBe(true);
  for (const element of all) element.remove();
});

test("a known element registering again for its target, and others leaving, keep the tab stop", () => {
  const first = Temporal.PlainDate.from("2026-01-01");
  const entry = vi.fn(() => day("2026-01-01"));
  const store = createRovingFocusStore(entry);
  store.update(day("2026-01-03"), entry);
  const all = elements(200);
  const releases = all.map((element, index) =>
    store.register(element, day(first.add({ days: index }).toString()), 1),
  );
  expect(store.isTabStop(day("2026-01-03"), 1)).toBe(true);
  const calls = entry.mock.calls.length;

  // As Solid's event chips on a new projection: a new registration for the same target, then the
  // old one's release, which leaves the new one in place.
  const again = all.map((element, index) => {
    const release = store.register(element, day(first.add({ days: index }).toString()), 1);
    releases[index]!();
    store.isTabStop(day(first.add({ days: index }).toString()), 1);
    return release;
  });
  // Rows scrolling away, other than the focused one.
  again.slice(100).forEach((release, index) => {
    all[100 + index]!.remove();
    release();
    store.isTabStop(day(first.add({ days: 100 + index }).toString()), 1);
  });

  expect(entry).toHaveBeenCalledTimes(calls);
  expect(store.isTabStop(day("2026-01-03"), 1)).toBe(true);
  for (const element of all) element.remove();
});

test("an element registering again over more days can land on the focus", () => {
  const store = createRovingFocusStore(() => event("2026-01-01", "a"));
  const [bar] = elements(1);
  store.update(event("2026-01-02", "a"), () => event("2026-01-01", "a"));
  // A month bar of event a from January 1: one day long, it shows the entry, not the focus.
  store.register(bar!, event("2026-01-01", "a"), 1);
  expect(store.isTabStop(event("2026-01-02", "a"), 1)).toBe(false);

  // Two days long, it shows the focus on January 2.
  store.register(bar!, event("2026-01-01", "a"), 2);
  expect(store.isTabStop(event("2026-01-02", "a"), 1)).toBe(true);
  bar!.remove();
});

test("a later element in the entry's own resource takes the tab stop from a copy", () => {
  const entry = () => event("2026-01-01", "a", "r1");
  const store = createRovingFocusStore(entry);
  const [copy, own] = elements(2);
  store.update(null, entry);
  store.register(copy!, event("2026-01-01", "a"), 1);
  expect(store.isTabStop(event("2026-01-01", "a"), 1)).toBe(true);
  store.register(own!, event("2026-01-01", "a", "r1"), 1);
  expect(store.isTabStop(event("2026-01-01", "a"), 1)).toBe(false);
  expect(store.isTabStop(event("2026-01-01", "a", "r1"), 1)).toBe(true);
  for (const element of [copy, own]) element!.remove();
});
