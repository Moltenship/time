// @vitest-environment jsdom

import type { CalendarEventChange } from "@moltenship/calendar-solid";
import { expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";
import { createWeekView } from "@registry/time-grid-view/time-grid-view";

import { focus, press, render, settled } from "./render";
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

// The React week's keyboard tests (registry/tests/time-grid-keyboard.test.tsx), in Solid: the
// same keys, focus, drafts and announcements.

type Change = CalendarEventChange<ColoredEvent, string | number, string>;

const Calendar = createTestCalendar(createWeekView<ColoredEvent>({ dayView: "day" }));

// Thursday 2026-10-08 in UTC, in a Sunday-first week.
const events = [
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  allDay("trip", "2026-10-06", "2026-10-08"),
];

let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;

/** Hands the test the root's actions, so it can put the calendar's focus on a slot. */
function Actions() {
  actions = Calendar.useCalendarActions();
  return null;
}

async function renderWeek(
  weekEvents: readonly ColoredEvent[] = events,
  onEventChange: (change: Change) => void | Promise<void> = () => {},
) {
  const view = await render(() => (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="week"
      events={weekEvents}
      locale="en-US"
      onEventChange={onEventChange}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Actions />
      <Calendar.Title />
      <Calendar.ActiveView />
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  ));
  return view.container;
}

/** Focuses the grid's tab stop once the calendar's focus is on `target`. */
async function focusTarget(
  container: HTMLElement,
  target: { readonly date: Temporal.PlainDate; readonly time?: string },
) {
  actions!.setFocus(
    target.time === undefined
      ? { date: target.date, kind: "day" }
      : { date: target.date, kind: "slot", time: Temporal.PlainTime.from(target.time) },
  );
  await settled();
  await focus(container.querySelector('[role="grid"] [tabindex="0"]'));
}

const focusSlot = (container: HTMLElement, time: string) =>
  focusTarget(container, { date: anchorDate, time });
const focusToday = (container: HTMLElement) => focusTarget(container, { date: anchorDate });

async function focusEvent(container: HTMLElement, id: string) {
  await focusSlot(container, "09:00");
  await press("Enter");
  expect(document.activeElement?.getAttribute("data-event-id")).toBe(id);
}

const focused = () =>
  document.activeElement?.getAttribute("data-event-id") ?? ariaLabel(document.activeElement);

const column = () =>
  document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-date");

const spoken = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="announcer"]'))?.trim();

async function arrows(key: "ArrowDown" | "ArrowLeft" | "ArrowRight" | "ArrowUp", times = 1) {
  for (let step = 0; step < times; step += 1) await press(key);
}

test("has one tab stop, today's all-day cell; header dates and the row toggle are out of the tab order", async () => {
  const container = await renderWeek();
  const stops = [...container.querySelectorAll('[role="grid"] [tabindex="0"]')];

  expect(stops.map(ariaLabel)).toEqual(["Thursday, October 8, 2026, no all-day events"]);
  expect(
    container
      .querySelector('[aria-label="Open Thursday, October 8, 2026"]')
      ?.getAttribute("tabindex"),
  ).toBe("-1");
});

test("arrow keys move from the all-day row through 15-minute slots and between days", async () => {
  const container = await renderWeek();
  await focusToday(container);

  await press("ArrowDown");
  expect(focused()).toBe("Thursday, October 8 at 12:00 AM");
  expect(column()).toBe("2026-10-08");
  await press("ArrowRight");
  await press("ArrowDown");
  expect(focused()).toBe("Friday, October 9 at 12:15 AM");
  await arrows("ArrowUp", 2);
  expect(focused()).toBe("Friday, October 9, 2026, no all-day events");
});

test("Enter on a slot goes into the event covering it, and Escape back to its slot", async () => {
  const container = await renderWeek();
  await focusSlot(container, "09:15");

  await press("Enter");
  expect(focused()).toBe("standup");
  await press("Escape");
  expect(focused()).toBe("Thursday, October 8 at 9:00 AM");
});

test("Space moves an event by slots and days, and Enter saves it", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek(events, onEventChange);
  await focusEvent(container, "standup");

  await press(" ");
  expect(spoken(container)).toBe(
    "Picked up standup, Thursday, October 8, 9:00 – 9:30 AM. Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
  );
  await press("ArrowRight");
  await press("ArrowDown");
  expect(spoken(container)).toBe("Friday, October 9, 9:15 – 9:45 AM");
  expect(column()).toBe("2026-10-09");
  await press("Enter");
  await settled();

  expect(onEventChange).toHaveBeenCalledOnce();
  const change = onEventChange.mock.calls[0]![0];
  expect(change).toMatchObject({ cause: "move", eventId: "standup" });
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-09T09:15:00Z/2026-10-09T09:45:00Z",
  );
  expect(spoken(container)).toBe("Moved standup to Friday, October 9, 9:15 – 9:45 AM.");
});

test("Shift+Space resizes an event's end by slots", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek(events, onEventChange);
  await focusEvent(container, "standup");

  await press(" ", { shiftKey: true });
  await arrows("ArrowDown", 2);
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("resize-end");
  expect(change.proposed?.end.toString()).toBe("2026-10-08T10:00:00Z");
});

test("Space on a slot drafts an hour-long event that arrow keys extend", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek(events, onEventChange);
  await focusSlot(container, "14:00");

  await press(" ");
  expect(container.querySelector('[data-slot="time-grid-draft"]')).not.toBeNull();
  expect(spoken(container)).toMatch(/^New event, Thursday, October 8, 2:00 – 3:00 PM\. /u);
  await press("ArrowDown");
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("create");
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-08T14:00:00Z/2026-10-08T15:15:00Z",
  );
  expect(container.querySelector('[data-slot="time-grid-draft"]')).toBeNull();
});

test("Space on an all-day cell drafts an all-day event", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek(events, onEventChange);
  await focusToday(container);

  await press(" ");
  await press("ArrowRight");
  expect(
    [...container.querySelectorAll("[data-all-day][data-draft]")].map((cell) =>
      cell.getAttribute("data-date"),
    ),
  ).toEqual(["2026-10-08", "2026-10-09"]);
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-08/2026-10-10",
  );
});

test("Escape cancels a gesture and returns focus to where it started", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek(events, onEventChange);
  await focusEvent(container, "standup");

  await press(" ");
  await arrows("ArrowDown", 4);
  await press("Escape");

  expect(onEventChange).not.toHaveBeenCalled();
  expect(focused()).toBe("standup");
  expect(column()).toBe("2026-10-08");
  expect(spoken(container)).toBe("Cancelled. standup is back where it was.");
});

test("arrowing onto an all-day event the collapsed row hides expands the row", async () => {
  const busy = ["a", "b", "c", "d"].map((id) => allDay(id, "2026-10-08", "2026-10-09"));
  const container = await renderWeek([...events, ...busy]);
  await focusToday(container);
  expect(
    text(container.querySelector('[role="row"] button[tabindex="-1"]:not([aria-label])')),
  ).toBe("+2 more");

  await press("Enter");
  for (const id of ["a", "b", "c"]) {
    expect(focused()).toBe(id);
    await press("ArrowDown");
  }
  expect(focused()).toBe("d");
  expect(container.querySelector('[aria-label="Show fewer all-day events"]')).not.toBeNull();
});

test("Shift+Enter opens the focused day in the day view", async () => {
  const container = await renderWeek();
  await focusSlot(container, "10:00");

  await press("Enter", { shiftKey: true });

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-08");
});

test("Shift+Enter on an all-day cell opens its day", async () => {
  const container = await renderWeek();
  await focusTarget(container, { date: anchorDate.add({ days: 1 }) });

  await press("Enter", { shiftKey: true });

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-09");
});

test("arrow keys with nowhere to go keep focus and never reach app shortcuts", async () => {
  // Stands in for an app's "next period" shortcut, which skips keys a view already handled.
  const appShortcuts = vi.fn<(event: KeyboardEvent) => void>();
  const listener = (event: KeyboardEvent) => {
    if (!event.defaultPrevented) appShortcuts(event);
  };
  window.addEventListener("keydown", listener);
  try {
    const container = await renderWeek([
      ...events,
      timed("a", "2026-10-07T09:00Z", "2026-10-07T10:00Z"),
      timed("b", "2026-10-07T09:30Z", "2026-10-07T10:30Z"),
    ]);
    await focusSlot(container, "09:00");
    await press("Enter");

    // An event with no neighbour beside it.
    await press("ArrowRight");
    expect(focused()).toBe("standup");
    // The outer event of an overlapping pair, from Wednesday's 9:00 slot.
    await press("Escape");
    await press("ArrowLeft");
    expect(focused()).toBe("Wednesday, October 7 at 9:00 AM");
    await press("Enter");
    expect(focused()).toBe("a");
    await press("ArrowRight");
    expect(focused()).toBe("b");
    await press("ArrowRight");
    expect(focused()).toBe("b");

    expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 4 – 10, 2026");
    expect(appShortcuts).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("keydown", listener);
  }
});

test("names a moved event as saving until its change commits", async () => {
  const container = await renderWeek(events, () => new Promise<void>(() => {}));
  await focusEvent(container, "standup");

  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  const standup = container.querySelector('[data-event-id="standup"]');
  expect(standup?.getAttribute("aria-busy")).toBe("true");
  expect(ariaLabel(standup)).toMatch(/^standup, Friday, October 9, 9:00 – 9:30 AM.*saving$/u);
});
