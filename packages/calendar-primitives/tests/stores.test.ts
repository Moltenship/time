// @vitest-environment jsdom
import "./setup";

import type { CalendarFocus } from "@moltenship/calendar-core";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import {
  calendarViewEntry,
  createCalendarViewRuntime,
  createClockTicker,
  createDraftBusyQuery,
  createResourceStatusClock,
  focusRovingTarget,
  type CalendarResourceStatus,
} from "../src/index";
import { host } from "./harness";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

const instant = (value: string) => Temporal.Instant.from(value);
const opens = instant("2026-08-15T09:00:00Z");

/** A clock the test moves, without firing a timer. */
function testClock(start: string) {
  let at = instant(start);
  return { instant: () => at, set: (value: string) => (at = instant(value)) };
}

/** Closed until 09:00, open after. */
function statusAt(at: Temporal.Instant): CalendarResourceStatus {
  const open = Temporal.Instant.compare(at, opens) >= 0;
  return {
    availability: open
      ? { available: true, closesAt: null }
      : { available: false, label: null, opensAt: opens, reason: "outside-hours" },
    busy: { busy: false, freeAt: null },
    changesAt: open ? null : opens,
  } as unknown as CalendarResourceStatus;
}

test("a status clock is null on the server and samples on first read", () => {
  const clock = testClock("2026-08-15T08:00:00Z");
  const store = createResourceStatusClock({ clock }, statusAt);

  expect(store.getServerSnapshot?.()).toBeNull();
  expect(store.getSnapshot()?.availability.available).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});

test("every subscriber of a status clock hears a change, from one timer", () => {
  const clock = testClock("2026-08-15T08:59:00Z");
  const store = createResourceStatusClock({ clock }, statusAt);
  store.getSnapshot();
  const a = vi.fn();
  const b = vi.fn();
  const stopA = store.subscribe(a);
  const stopB = store.subscribe(b);
  expect(vi.getTimerCount()).toBe(1);

  clock.set("2026-08-15T09:00:00Z");
  vi.advanceTimersByTime(60_000);

  expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  expect(store.getSnapshot()?.availability.available).toBe(true);
  stopA();
  stopA();
  expect(vi.getTimerCount()).toBe(1);
  stopB();
  expect(vi.getTimerCount()).toBe(0);
});

test("a new subscription samples again, and every subscriber hears what changed", () => {
  const clock = testClock("2026-08-15T08:00:00Z");
  const store = createResourceStatusClock({ clock }, statusAt);
  store.getSnapshot();
  const a = vi.fn();
  store.subscribe(a);
  expect(a).not.toHaveBeenCalled();

  // The clock jumped past the change without the timer firing, as after a device sleeps.
  clock.set("2026-08-15T10:00:00Z");
  const b = vi.fn();
  const stopB = store.subscribe(b);

  expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  expect(store.getSnapshot()?.availability.available).toBe(true);
  stopB();
});

test("a clock ticker serves every subscriber from one interval", () => {
  const clock = testClock("2026-08-15T08:00:00Z");
  const ticker = createClockTicker(clock, 1000);
  // A framework reads before it subscribes.
  ticker.getSnapshot();
  const a = vi.fn();
  const b = vi.fn();
  const stopA = ticker.subscribe(a);
  const stopB = ticker.subscribe(b);
  expect(vi.getTimerCount()).toBe(1);

  clock.set("2026-08-15T08:00:01Z");
  vi.advanceTimersByTime(1000);
  expect([a.mock.calls.length, b.mock.calls.length]).toEqual([1, 1]);
  expect(ticker.getSnapshot().toString()).toBe("2026-08-15T08:00:01Z");

  // A tick that finds the same instant tells no one.
  vi.advanceTimersByTime(1000);
  expect(a).toHaveBeenCalledTimes(1);
  stopA();
  stopB();
  expect(vi.getTimerCount()).toBe(0);
});

test("a draft's busy query keeps its answer while it is the same, and is null without a draft", () => {
  const { model } = host({ onEventChange: () => undefined });
  const query = createDraftBusyQuery();
  const draft = {
    eventId: null,
    proposed: {
      end: instant("2026-08-15T10:00:00Z"),
      kind: "timed",
      resourceIds: ["room-1"],
      start: instant("2026-08-15T09:00:00Z"),
    },
  } as const;

  const busy = query(draft, model.eventSnapshot, model.availability, "room-1");
  expect(busy).toEqual({ events: [], outsideHours: false });
  // An equal draft made again gives the same object, so a framework renders nothing.
  expect(query({ ...draft }, model.eventSnapshot, model.availability, "room-1")).toBe(busy);
  expect(query(draft, model.eventSnapshot, model.availability, null)).toBeNull();
  expect(query(null, model.eventSnapshot, model.availability, "room-1")).toBeNull();
});

test("an element taking DOM focus becomes the calendar's focus, unless it already is", () => {
  const { model } = host();
  const { interaction } = model;
  const setFocus = vi.fn(interaction.actions.setFocus);
  const runtime = { actions: { ...interaction.actions, setFocus }, read: interaction.read };
  const day: CalendarFocus = { date: Temporal.PlainDate.from("2026-08-17"), kind: "day" };
  const event = new FocusEvent("focus");

  focusRovingTarget(runtime, day, 1, event);
  expect(setFocus).toHaveBeenCalledWith(day, { event, reason: "focus-change" });
  expect(interaction.read().focus).toEqual(day);

  focusRovingTarget(runtime, day, 1, event);
  expect(setFocus).toHaveBeenCalledTimes(1);
});

test("a view runtime reads the latest view, and its tab stop starts at the view's entry", () => {
  const entry: CalendarFocus = { date: Temporal.PlainDate.from("2026-08-15"), kind: "day" };
  const first = {
    definition: { strategy: { getSpatialNavigation: () => ({ focus: entry }) } },
  } as never;
  let view: unknown = first;
  const runtime = createCalendarViewRuntime(() => view as never);

  // Nothing has registered, as on the server: the entry is the tab stop.
  expect(runtime.roving.isTabStop(entry, 1)).toBe(true);
  expect(calendarViewEntry(first)("home")).toEqual(entry);
  expect(runtime.getView()).toBe(first);
  view = null;
  expect(runtime.getView()).toBeNull();
});
