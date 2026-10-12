// @vitest-environment jsdom

import type { CalendarAvailability, CalendarEventChange } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import type { YearClosedDays } from "../year-view/year-month";
import { createYearView } from "../year-view/year-view";
import { click, render } from "./render";
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

const Calendar = createTestCalendar(
  createYearView<ColoredEvent>({
    getEventColor: (event) => event.data.color,
    // The test calendar has a day view only, so the month's name opens that.
    monthView: "day",
  }),
);

// Thursday 2026-10-08 is today; the trip covers Tuesday to Thursday.
const events = [
  allDay("trip", "2026-10-06", "2026-10-09"),
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z", "orange"),
  timed("review", "2026-10-08T15:30Z", "2026-10-08T16:00Z", "purple"),
  timed("retro", "2026-10-08T17:00Z", "2026-10-08T18:00Z", "red"),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderYear({
  availability,
  closedDays,
  onEventChange,
}: {
  readonly availability?: CalendarAvailability;
  readonly closedDays?: YearClosedDays;
  readonly onEventChange?: (change: Change) => void;
} = {}) {
  const view = await render(
    <Calendar.Root
      availability={availability}
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="year"
      events={events}
      locale="en-US"
      onEventChange={onEventChange}
      viewOptions={closedDays === undefined ? undefined : { year: { closedDays } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
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
  container.querySelector<HTMLElement>(`[role="gridcell"][data-date="${date}"]`)!;

async function focusDay(container: HTMLElement, date: string) {
  await act(async () => cell(container, date).focus());
}

const focused = () => document.activeElement?.getAttribute("data-date") ?? undefined;
const title = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="title"]'));
const popover = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');

/** An event's visible parts (time, title), joined by spaces. */
function label(element: Element): string {
  return [...element.children].map(text).filter(Boolean).join(" ");
}

test("shows the year's twelve months, each date once", async () => {
  const container = await renderYear();

  expect(title(container)).toBe("2026");
  expect([...container.querySelectorAll('[role="grid"]')].map((grid) => ariaLabel(grid))).toEqual([
    "January 2026",
    "February 2026",
    "March 2026",
    "April 2026",
    "May 2026",
    "June 2026",
    "July 2026",
    "August 2026",
    "September 2026",
    "October 2026",
    "November 2026",
    "December 2026",
  ]);
  const dates = [...container.querySelectorAll("[data-date]")].map((element) =>
    element.getAttribute("data-date"),
  );
  expect(dates).toHaveLength(365);
  expect(new Set(dates).size).toBe(365);
  // January 1 is a Thursday: four empty cells start its first week.
  const january = container.querySelector('[role="grid"]')!;
  const firstWeek = january.querySelectorAll('[role="row"]')[1]!;
  expect([...firstWeek.children].map((day) => text(day) ?? "")).toEqual([
    "",
    "",
    "",
    "",
    "1",
    "2",
    "3",
  ]);
});

test("has one tab stop, today, named with its date and event count", async () => {
  const container = await renderYear();
  const stops = [...container.querySelectorAll('[tabindex="0"]')];

  expect(stops).toEqual([cell(container, "2026-10-08")]);
  expect(ariaLabel(stops[0])).toBe("Thursday, October 8, 2026, 5 events");
  expect(stops[0]!.getAttribute("aria-current")).toBe("date");
  expect(ariaLabel(cell(container, "2026-10-07"))).toBe("Wednesday, October 7, 2026, 1 event");
  expect(ariaLabel(cell(container, "2026-10-10"))).toBe("Saturday, October 10, 2026, no events");
});

test("dots a day once per event colour, up to three", async () => {
  const container = await renderYear();
  const dots = (date: string) =>
    [...cell(container, date).querySelectorAll('[data-slot="year-event-dot"]')].map((dot) =>
      dot.getAttribute("data-color"),
    );

  // Teal trip, blue standup, orange lunch; purple and red don't fit.
  expect(dots("2026-10-08")).toEqual(["teal", "blue", "orange"]);
  expect(dots("2026-10-07")).toEqual(["teal"]);
  expect(dots("2026-10-10")).toEqual([]);
});

test("a click lists the day's events in a popover, all-day first", async () => {
  const container = await renderYear();

  await click(cell(container, "2026-10-08").querySelector("button"));

  expect(ariaLabel(popover())).toBe("Events on Thursday, October 8, 2026");
  expect([...popover()!.querySelectorAll("[data-event-id]")].map(label)).toEqual([
    "trip",
    "9 AM standup",
    "12 PM lunch",
    "3:30 PM review",
    "5 PM retro",
  ]);

  await click(cell(container, "2026-10-10").querySelector("button"));
  expect(ariaLabel(popover())).toBe("Events on Saturday, October 10, 2026");
  expect(text(popover())).toContain("No events");
});

test("the popover's date opens the day, and a month's name opens its month", async () => {
  const container = await renderYear();

  await click(cell(container, "2026-10-08").querySelector("button"));
  await click(popover()!.querySelector('button[aria-label="Thursday, October 8, 2026"]'));
  expect(title(container)).toBe("Day 2026-10-08");
  expect(container.querySelector('[data-testid="day-view"]')).not.toBeNull();

  await cleanup?.();
  const again = await renderYear();
  await click(again.querySelector('button[aria-label="March 2026"]'));
  expect(title(again)).toBe("Day 2026-03-01");
});

test("arrow and Page keys move between days and months, and past December to next year", async () => {
  const container = await renderYear();
  await focusDay(container, "2026-10-08");

  await press("ArrowRight");
  expect(focused()).toBe("2026-10-09");
  await press("ArrowDown");
  expect(focused()).toBe("2026-10-16");
  await press("PageDown");
  expect(focused()).toBe("2026-11-16");
  await press("End");
  expect(focused()).toBe("2026-11-21");
  await press("PageDown");
  await press("ArrowDown");
  await press("ArrowDown");
  expect(focused()).toBe("2027-01-04");
  expect(title(container)).toBe("2027");
});

test("Enter opens a day's events, Escape returns to the day, Shift+Enter opens the day", async () => {
  const container = await renderYear();
  await focusDay(container, "2026-10-08");

  await press("Enter");
  expect(ariaLabel(popover())).toBe("Events on Thursday, October 8, 2026");
  await vi.waitFor(() => expect(popover()!.contains(document.activeElement)).toBe(true));
  await press("Escape");
  await vi.waitFor(() => expect(focused()).toBe("2026-10-08"));

  await press("Enter", { shiftKey: true });
  expect(title(container)).toBe("Day 2026-10-08");
});

test("Space opens a day's events rather than creating an event", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderYear({ onEventChange });
  await focusDay(container, "2026-10-10");

  await press(" ");
  await press("ArrowRight");
  await press("Enter");

  expect(ariaLabel(popover())).toBe("Events on Saturday, October 10, 2026");
  expect(onEventChange).not.toHaveBeenCalled();
});

describe("closed days", () => {
  const time = (value: string) => Temporal.PlainTime.from(value);
  // Weekdays 9 to 5, and an offsite that closes Friday, October 9.
  const officeHours: CalendarAvailability = {
    exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
    weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
  };
  // Sunday, October 4 to Saturday, October 10: one row of the grid.
  const week = Array.from(
    { length: 7 },
    (_, index) => `2026-10-${String(index + 4).padStart(2, "0")}`,
  );

  /** The row's shading: a day's number where it's shaded, bracketed where its band is rounded. */
  function shading(container: HTMLElement): string {
    return week
      .map((date) => {
        const band = cell(container, date).querySelector('[data-slot="year-closed"]');
        if (band === null) return "·";
        const { classList } = band;
        return `${classList.contains("rounded-s-md") ? "[" : ""}${date.slice(8)}${classList.contains("rounded-e-md") ? "]" : ""}`;
      })
      .join(" ");
  }

  test("are named closed, and only the exceptions are shaded by default", async () => {
    const container = await renderYear({ availability: officeHours });

    expect(shading(container)).toBe("· · · · · [09] ·");
    expect(ariaLabel(cell(container, "2026-10-09"))).toBe(
      "Friday, October 9, 2026, Offsite, closed, no events",
    );
    // The weekend isn't shaded, but its name still says so.
    expect(ariaLabel(cell(container, "2026-10-10"))).toBe(
      "Saturday, October 10, 2026, closed, no events",
    );
    expect(cell(container, "2026-10-10").hasAttribute("data-closed")).toBe(true);
    expect(cell(container, "2026-10-08").hasAttribute("data-closed")).toBe(false);
  });

  test('"all" shades weekends too, one band along each row\'s run of closed days', async () => {
    const container = await renderYear({ availability: officeHours, closedDays: "all" });

    expect(shading(container)).toBe("[04] · · · · [09 10]");
    const offsite = cell(container, "2026-10-09").querySelector('[data-slot="year-closed"]')!;
    expect(offsite.getAttribute("data-reason")).toBe("exception");
    // Open time meets the band on Thursday's side only.
    expect(offsite.hasAttribute("data-opens-before")).toBe(true);
    expect(offsite.hasAttribute("data-opens-after")).toBe(false);
  });

  test('"none" shades nothing', async () => {
    const container = await renderYear({ availability: officeHours, closedDays: "none" });

    expect(shading(container)).toBe("· · · · · · ·");
    expect(ariaLabel(cell(container, "2026-10-09"))).toBe(
      "Friday, October 9, 2026, Offsite, closed, no events",
    );
  });
});
