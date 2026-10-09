// @vitest-environment jsdom

import type { CalendarEventChange, CalendarFocus } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import { createWeekView } from "../time-grid-view/time-grid-view";
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

const Calendar = createTestCalendar(createWeekView<ColoredEvent>({ dayView: "day" }));

// Thursday 2026-10-08 in UTC, in a Sunday-first week.
const events = [
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  allDay("trip", "2026-10-06", "2026-10-08"),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderWeek({
  defaultFocus = null,
  onEventChange = () => {},
  weekEvents = events,
}: {
  readonly defaultFocus?: CalendarFocus | null;
  readonly onEventChange?: (change: Change) => void;
  readonly weekEvents?: readonly ColoredEvent[];
} = {}) {
  const view = await render(
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultFocus={defaultFocus}
      defaultTimeZone="UTC"
      defaultView="week"
      events={weekEvents}
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

const slot = (time: string): CalendarFocus => ({
  date: anchorDate,
  kind: "slot",
  time: Temporal.PlainTime.from(time),
});

/** Focuses the view's tab stop, as Tab would. */
async function tabIn(container: HTMLElement) {
  await act(async () =>
    container.querySelector<HTMLElement>('[role="grid"] [tabindex="0"]')!.focus(),
  );
}

const focused = () =>
  document.activeElement?.getAttribute("data-event-id") ?? ariaLabel(document.activeElement);
const spoken = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="announcer"]'))?.trim();

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
  await tabIn(container);

  await press("ArrowDown");
  expect(focused()).toBe("Thursday, October 8 at 12:00 AM");
  expect(document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-date")).toBe(
    "2026-10-08",
  );
  await press("ArrowDown");
  await press("ArrowRight");
  expect(focused()).toBe("Friday, October 9 at 12:15 AM");
  await press("ArrowUp");
  await press("ArrowUp");
  expect(focused()).toBe("Friday, October 9, 2026, no all-day events");
});

test("Enter on a slot goes into the event covering it, and Escape back to its slot", async () => {
  const container = await renderWeek({ defaultFocus: slot("09:15") });
  await tabIn(container);

  await press("Enter");
  expect(focused()).toBe("standup");
  await press("Escape");
  expect(focused()).toBe("Thursday, October 8 at 9:00 AM");
});

test("Space moves an event by slots and days, and Enter saves it", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek({ defaultFocus: slot("09:00"), onEventChange });
  await tabIn(container);
  await press("Enter");

  await press(" ");
  await press("ArrowDown");
  await press("ArrowRight");
  expect(spoken(container)).toBe("Friday, October 9, 9:15 – 9:45 AM");
  expect(document.activeElement?.closest('[role="gridcell"]')?.getAttribute("data-date")).toBe(
    "2026-10-09",
  );
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("move");
  expect(`${change.proposed?.start.toString()}/${change.proposed?.end.toString()}`).toBe(
    "2026-10-09T09:15:00Z/2026-10-09T09:45:00Z",
  );
  expect(spoken(container)).toBe("Moved standup to Friday, October 9, 9:15 – 9:45 AM.");
});

test("Shift+Space resizes an event's end by slots", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek({ defaultFocus: slot("09:00"), onEventChange });
  await tabIn(container);
  await press("Enter");

  await press(" ", { shiftKey: true });
  await press("ArrowDown");
  await press("ArrowDown");
  await press("Enter");

  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("resize-end");
  expect(change.proposed?.end.toString()).toBe("2026-10-08T10:00:00Z");
});

test("Space on a slot drafts an hour-long event that arrow keys extend", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderWeek({ defaultFocus: slot("14:00"), onEventChange });
  await tabIn(container);

  await press(" ");
  expect(container.querySelector('[data-slot="time-grid-draft"]')).not.toBeNull();
  expect(spoken(container)).toMatch(/^New event, Thursday, October 8, 2:00 – 3:00 PM\. /);
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
  const container = await renderWeek({ onEventChange });
  await tabIn(container);

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

test("arrowing onto an all-day event the collapsed row hides expands the row", async () => {
  const busy = ["a", "b", "c", "d"].map((id) => allDay(id, "2026-10-08", "2026-10-09"));
  const container = await renderWeek({ weekEvents: [...events, ...busy] });
  await tabIn(container);
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
  const container = await renderWeek({ defaultFocus: slot("10:00") });
  await tabIn(container);

  await press("Enter", { shiftKey: true });

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-08");
});

test("arrow keys with nowhere to go keep focus and never reach app shortcuts", async () => {
  // Stands in for an app's "next period" shortcut, which skips keys a view already handled.
  const appShortcuts = vi.fn<(event: KeyboardEvent) => void>();
  const listener = (event: KeyboardEvent) => {
    if (!event.defaultPrevented) appShortcuts(event);
  };
  window.addEventListener("keydown", listener);
  try {
    const container = await renderWeek({
      defaultFocus: slot("09:00"),
      weekEvents: [
        ...events,
        timed("a", "2026-10-07T09:00Z", "2026-10-07T10:00Z"),
        timed("b", "2026-10-07T09:30Z", "2026-10-07T10:30Z"),
      ],
    });
    await tabIn(container);
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
