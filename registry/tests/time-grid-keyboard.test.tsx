// @vitest-environment jsdom

import {
  cleanup,
  createTestEnvironment,
  renderCalendar,
  type CellQuery,
} from "@moltenship/calendar-testing";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createWeekView } from "../time-grid-view/time-grid-view";
import {
  allDay,
  anchorDate,
  ariaLabel,
  createTestCalendar,
  text,
  timed,
  type ColoredEvent,
} from "./view-fixtures";

// The week view through @moltenship/calendar-testing, as an app's tests would drive it.

const Calendar = createTestCalendar(createWeekView<ColoredEvent>({ dayView: "day" }));

// Thursday 2026-10-08 in UTC, in a Sunday-first week.
const environment = createTestEnvironment({
  weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
});
const events = [
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  allDay("trip", "2026-10-06", "2026-10-08"),
];

afterEach(cleanup);

function renderWeek({
  weekEvents = events,
}: {
  readonly weekEvents?: readonly ColoredEvent[];
} = {}) {
  return renderCalendar(Calendar, {
    children: (
      <>
        <Calendar.Title />
        <Calendar.ActiveView />
      </>
    ),
    createEvent: (change, id) => ({
      ...change.proposed,
      data: { color: "blue" as const },
      id,
      title: "New event",
    }),
    environment,
    events: weekEvents,
    messages: calendarAnnouncements,
    view: "week",
  });
}

const slot = (time: string): CellQuery<string> => ({ date: anchorDate, time });
const today: CellQuery<string> = { date: anchorDate };

const focused = () =>
  document.activeElement?.getAttribute("data-event-id") ?? ariaLabel(document.activeElement);

test("has one tab stop, today's all-day cell; header dates and the row toggle are out of the tab order", async () => {
  const { container } = await renderWeek();
  const stops = [...container.querySelectorAll('[role="grid"] [tabindex="0"]')];

  expect(stops.map(ariaLabel)).toEqual(["Thursday, October 8, 2026, no all-day events"]);
  expect(
    container
      .querySelector('[aria-label="Open Thursday, October 8, 2026"]')
      ?.getAttribute("tabindex"),
  ).toBe("-1");
});

test("arrow keys move from the all-day row through 15-minute slots and between days", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusCell(today);

  await calendar.keyboard.arrows({ down: 1 });
  expect(focused()).toBe("Thursday, October 8 at 12:00 AM");
  expect(document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-date")).toBe(
    "2026-10-08",
  );
  await calendar.keyboard.step({ across: 1, down: 1 });
  expect(focused()).toBe("Friday, October 9 at 12:15 AM");
  await calendar.keyboard.arrows({ up: 2 });
  expect(focused()).toBe("Friday, October 9, 2026, no all-day events");
});

test("Enter on a slot goes into the event covering it, and Escape back to its slot", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusCell(slot("09:15"));

  await calendar.keyboard.press("Enter");
  expect(focused()).toBe("standup");
  await calendar.keyboard.press("Escape");
  expect(focused()).toBe("Thursday, October 8 at 9:00 AM");
});

test("Space moves an event by slots and days, and Enter saves it", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusEvent("standup");

  await calendar.keyboard.grab();
  await calendar.keyboard.step({ across: 1, down: 1 });
  expect(calendar.lastAnnouncement()).toBe("Friday, October 9, 9:15 – 9:45 AM");
  expect(document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-date")).toBe(
    "2026-10-09",
  );
  await calendar.keyboard.drop();
  await calendar.settled();

  expect(calendar.changes.map(({ cause }) => cause)).toEqual(["move"]);
  expect(calendar.placementOf("standup").range).toBe("2026-10-09T09:15:00Z/2026-10-09T09:45:00Z");
  expect(calendar.results.map(({ detail, result }) => `${result.status} ${detail.input}`)).toEqual([
    "committed keyboard",
  ]);
  expect(calendar.lastAnnouncement()).toBe("Moved standup to Friday, October 9, 9:15 – 9:45 AM.");
});

test("Shift+Space resizes an event's end by slots", async () => {
  const calendar = await renderWeek();

  await calendar.keyboard.resizeEvent("standup", { down: 2 });
  await calendar.settled();

  expect(calendar.changes[0]?.cause).toBe("resize-end");
  expect(calendar.placementOf("standup").end).toBe("2026-10-08T10:00:00Z");
});

test("Space on a slot drafts an hour-long event that arrow keys extend", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusCell(slot("14:00"));

  await calendar.keyboard.grab();
  expect(calendar.container.querySelector('[data-slot="time-grid-draft"]')).not.toBeNull();
  expect(calendar.lastAnnouncement()).toMatch(/^New event, Thursday, October 8, 2:00 – 3:00 PM\. /);
  await calendar.keyboard.step({ down: 1 });
  await calendar.keyboard.drop();
  await calendar.settled();

  expect(calendar.changes[0]?.cause).toBe("create");
  expect(calendar.placementOf("new-1").range).toBe("2026-10-08T14:00:00Z/2026-10-08T15:15:00Z");
  expect(calendar.container.querySelector('[data-slot="time-grid-draft"]')).toBeNull();
});

test("Space on an all-day cell drafts an all-day event", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusCell(today);

  await calendar.keyboard.grab();
  await calendar.keyboard.step({ across: 1 });
  expect(
    [...calendar.container.querySelectorAll("[data-all-day][data-draft]")].map((cell) =>
      cell.getAttribute("data-date"),
    ),
  ).toEqual(["2026-10-08", "2026-10-09"]);
  await calendar.keyboard.drop();
  await calendar.settled();

  expect(calendar.placementOf("new-1").range).toBe("2026-10-08/2026-10-10");
});

test("arrowing onto an all-day event the collapsed row hides expands the row", async () => {
  const busy = ["a", "b", "c", "d"].map((id) => allDay(id, "2026-10-08", "2026-10-09"));
  const calendar = await renderWeek({ weekEvents: [...events, ...busy] });
  await calendar.keyboard.focusCell(today);
  expect(
    text(calendar.container.querySelector('[role="row"] button[tabindex="-1"]:not([aria-label])')),
  ).toBe("+2 more");

  await calendar.keyboard.press("Enter");
  for (const id of ["a", "b", "c"]) {
    expect(focused()).toBe(id);
    await calendar.keyboard.arrows({ down: 1 });
  }
  expect(focused()).toBe("d");
  expect(
    calendar.container.querySelector('[aria-label="Show fewer all-day events"]'),
  ).not.toBeNull();
});

test("Shift+Enter opens the focused day in the day view", async () => {
  const calendar = await renderWeek();
  await calendar.keyboard.focusCell(slot("10:00"));

  await calendar.keyboard.press("Enter", { shiftKey: true });

  expect(text(calendar.container.querySelector('[data-calendar-part="title"]'))).toBe(
    "Day 2026-10-08",
  );
});

test("arrow keys with nowhere to go keep focus and never reach app shortcuts", async () => {
  // Stands in for an app's "next period" shortcut, which skips keys a view already handled.
  const appShortcuts = vi.fn<(event: KeyboardEvent) => void>();
  const listener = (event: KeyboardEvent) => {
    if (!event.defaultPrevented) appShortcuts(event);
  };
  window.addEventListener("keydown", listener);
  try {
    const calendar = await renderWeek({
      weekEvents: [
        ...events,
        timed("a", "2026-10-07T09:00Z", "2026-10-07T10:00Z"),
        timed("b", "2026-10-07T09:30Z", "2026-10-07T10:30Z"),
      ],
    });
    await calendar.keyboard.focusCell(slot("09:00"));
    await calendar.keyboard.press("Enter");

    // An event with no neighbour beside it.
    await calendar.keyboard.arrows({ right: 1 });
    expect(focused()).toBe("standup");
    // The outer event of an overlapping pair, from Wednesday's 9:00 slot.
    await calendar.keyboard.press("Escape");
    await calendar.keyboard.arrows({ left: 1 });
    expect(focused()).toBe("Wednesday, October 7 at 9:00 AM");
    await calendar.keyboard.press("Enter");
    expect(focused()).toBe("a");
    await calendar.keyboard.arrows({ right: 1 });
    expect(focused()).toBe("b");
    await calendar.keyboard.arrows({ right: 1 });
    expect(focused()).toBe("b");

    expect(text(calendar.container.querySelector('[data-calendar-part="title"]'))).toBe(
      "Oct 4 – 10, 2026",
    );
    expect(appShortcuts).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("keydown", listener);
  }
});
