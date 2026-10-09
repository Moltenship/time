// @vitest-environment jsdom

import type { CalendarEventChange } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createMonthView } from "../month-view/month-view";
import { render } from "./render";
import {
  allDay,
  anchorDate,
  ariaLabel,
  clock,
  createTestCalendar,
  text,
  timed,
  type ColoredEvent,
} from "./view-fixtures";

type Change = CalendarEventChange<ColoredEvent, string | number, string>;

const Calendar = createTestCalendar(createMonthView<ColoredEvent>());

// Thursday 2026-10-08 in a Sunday-first month; the trip covers Tuesday to Thursday.
const events = [
  allDay("trip", "2026-10-06", "2026-10-09"),
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderMonth(
  monthEvents: readonly ColoredEvent[] = events,
  onEventChange: (change: Change) => void | Promise<void> = () => {},
) {
  const view = await render(
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="month"
      events={monthEvents}
      locale="en-US"
      onEventChange={onEventChange}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  return view.container;
}

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
    );
    await Promise.resolve();
  });
}

const cell = (container: HTMLElement, date: string) =>
  container
    .querySelector<HTMLElement>(`[data-date="${date}"]`)!
    .closest<HTMLElement>('[role="gridcell"]')!;

async function focusDay(container: HTMLElement, date: string) {
  await act(async () => cell(container, date).focus());
}

/** The focused element: an event's ID, or the date of a day cell. */
function focused() {
  const element = document.activeElement as HTMLElement;
  return (
    element.getAttribute("data-event-id") ??
    element.querySelector("[data-date]")?.getAttribute("data-date") ??
    element.tagName
  );
}

const spoken = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="announcer"]'))?.trim();

test("has one tab stop, today's cell, labelled with its date and event count", async () => {
  const container = await renderMonth();
  const stops = [...container.querySelectorAll('[role="grid"] [tabindex="0"]')];

  expect(stops).toEqual([cell(container, "2026-10-08")]);
  expect(ariaLabel(stops[0])).toBe("Thursday, October 8, 2026, 2 events");
  expect(ariaLabel(cell(container, "2026-10-10"))).toBe("Saturday, October 10, 2026, no events");
  // The date buttons stay clickable but out of the tab order.
  expect(
    container.querySelector('[aria-label="Thursday, October 8, 2026"]')?.getAttribute("tabindex"),
  ).toBe("-1");
});

test("arrow keys move between days, Enter into a day's events, Escape back out", async () => {
  const container = await renderMonth();
  await focusDay(container, "2026-10-08");

  await press("ArrowRight");
  expect(focused()).toBe("2026-10-09");
  await press("ArrowLeft");
  await press("Enter");
  expect(focused()).toBe("trip");
  await press("ArrowDown");
  expect(focused()).toBe("standup");
  await press("Escape");
  expect(focused()).toBe("2026-10-08");
  expect(cell(container, "2026-10-08").getAttribute("tabindex")).toBe("0");
});

test("Space grabs an event, arrow keys move it, and Enter drops it, announcing each step", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderMonth(events, onEventChange);
  await focusDay(container, "2026-10-08");
  await press("Enter");
  await press("ArrowDown");

  await press(" ");
  expect(spoken(container)).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM. Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
  );
  expect(document.activeElement?.hasAttribute("data-grabbed")).toBe(true);
  // A grabbed event previews as pending, but it is not saving yet.
  expect(ariaLabel(document.activeElement)).toBe("standup, Thursday, October 8, 9:00 – 9:30 AM");

  await press("ArrowRight");
  expect(focused()).toBe("standup");
  expect(document.activeElement?.closest('[role="gridcell"]')).toBe(cell(container, "2026-10-09"));
  expect(spoken(container)).toBe("Friday, October 9, 9:00 – 9:30 AM");

  await press("Enter");
  expect(onEventChange).toHaveBeenCalledOnce();
  expect(onEventChange.mock.calls[0]![0]).toMatchObject({ cause: "move", eventId: "standup" });
  expect(onEventChange.mock.calls[0]![0].proposed?.start.toString()).toBe("2026-10-09T09:00:00Z");
  expect(spoken(container)).toBe("Moved standup to Friday, October 9, 9:00 – 9:30 AM.");
});

test("Shift+Space resizes an event's end by days", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderMonth(events, onEventChange);
  await focusDay(container, "2026-10-08");
  await press("Enter");

  await press(" ", { shiftKey: true });
  await press("ArrowRight");
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("resize-end");
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-06/2026-10-10",
  );
  expect(spoken(container)).toBe("trip now runs all day, Tuesday, October 6 – Friday, October 9.");
});

test("Space on a day starts an all-day create that arrow keys extend", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderMonth(events, onEventChange);
  await focusDay(container, "2026-10-13");

  await press(" ");
  expect(spoken(container)).toBe(
    "New event, all day, Tuesday, October 13. Use the arrow keys to extend it, then Enter to finish or Escape to cancel.",
  );
  await press("ArrowRight");
  expect(
    [...container.querySelectorAll("[data-draft]")].map((day) => day.getAttribute("data-date")),
  ).toEqual(["2026-10-13", "2026-10-14"]);

  await press("Enter");
  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("create");
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-13/2026-10-15",
  );
});

test("Escape cancels a gesture and returns focus to where it started", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderMonth(events, onEventChange);
  await focusDay(container, "2026-10-08");
  await press("Enter");
  await press("ArrowDown");

  await press(" ");
  await press("ArrowDown");
  await press("Escape");

  expect(onEventChange).not.toHaveBeenCalled();
  expect(focused()).toBe("standup");
  expect(document.activeElement?.closest('[role="gridcell"]')).toBe(cell(container, "2026-10-08"));
  expect(spoken(container)).toBe("Cancelled. standup is back where it was.");
});

test("names a moved event as saving until its change commits", async () => {
  const container = await renderMonth(events, () => new Promise<void>(() => {}));
  await focusDay(container, "2026-10-08");
  await press("Enter");
  await press("ArrowDown");

  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  const standup = container.querySelector('[data-event-id="standup"]');
  expect(standup?.getAttribute("aria-busy")).toBe("true");
  expect(ariaLabel(standup)).toBe("standup, Friday, October 9, 9:00 – 9:30 AM, saving");
});

test("Shift+Enter opens the focused day", async () => {
  const container = await renderMonth();
  await focusDay(container, "2026-10-08");

  await press("Enter", { shiftKey: true });

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-08");
});

test("arrowing onto an event behind +N more shows its week's every lane", async () => {
  // jsdom has no layout, so rows hold one lane of events and the "+N more" control.
  const container = await renderMonth([
    ...events,
    timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z"),
  ]);
  const row = () => cell(container, "2026-10-08").closest('[role="row"]')!;
  await focusDay(container, "2026-10-08");
  await press("Enter");
  expect(focused()).toBe("trip");
  expect(row().querySelector('[aria-label^="2 more events"]')).not.toBeNull();

  await press("ArrowDown");
  expect(focused()).toBe("standup");
  expect(row().contains(document.activeElement)).toBe(true);
  expect(row().querySelector('[aria-label^="2 more events"]')).toBeNull();

  await press("ArrowDown");
  expect(focused()).toBe("lunch");
  await press("Escape");
  expect(focused()).toBe("2026-10-08");
  expect(row().querySelector('[aria-label^="2 more events"]')).not.toBeNull();
});

test("keys on an event in the +N more list stay with that event", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderMonth(
    [...events, timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z")],
    onEventChange,
  );
  await focusDay(container, "2026-10-08");
  await act(async () => {
    container.querySelector<HTMLElement>('[aria-label^="2 more events"]')!.click();
  });
  const copy = document.querySelector<HTMLElement>(
    '[data-slot="popover-content"] [data-event-id="lunch"]',
  )!;
  await act(async () => copy.focus());

  let enter = true;
  await act(async () => {
    enter = copy.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" }),
    );
  });
  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  // Enter is left to the button, which opens the event, and nothing was picked up or saved.
  expect(enter).toBe(true);
  expect(spoken(container)).toBe("");
  expect(onEventChange).not.toHaveBeenCalled();
});
