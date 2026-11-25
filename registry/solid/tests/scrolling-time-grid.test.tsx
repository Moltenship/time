// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { expect, test } from "vite-plus/test";

import {
  createScrollingDayView,
  createScrollingThreeDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";

import { focus, press, render, settled } from "./render";
import { ariaLabel, text } from "./view-fixtures";

// The React scrolling week and day's tests (the time grid cases of
// registry/tests/scrolling-views.test.tsx), in Solid. React's server markup case has no twin: the
// Solid registry renders no server markup yet.

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createScrollingWeekView(), createScrollingThreeDayView(), createScrollingDayView()],
});
type View = (typeof Calendar.views)[number]["name"];

const events: readonly Fixture[] = [
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
    id: "planning",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Planning",
  },
  {
    data: null,
    end: Temporal.Instant.from("2026-10-02T11:00:00Z"),
    id: "before",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-02T09:00:00Z"),
    title: "Before",
  },
  // A month-long holiday, which outlasts any page of loaded days.
  {
    data: null,
    end: Temporal.PlainDate.from("2026-10-30"),
    id: "season",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-05"),
    title: "Season",
  },
  // Starts before the week of Monday October 5, and runs into the next.
  {
    data: null,
    end: Temporal.PlainDate.from("2026-10-14"),
    id: "trip",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-02"),
    title: "Trip",
  },
];

let calendarActions: ReturnType<typeof Calendar.useCalendarActions> | undefined;

function CaptureActions() {
  calendarActions = Calendar.useCalendarActions();
  return null;
}

async function show(view: View) {
  const screen = await render(() => (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-07")}
      defaultTimeZone="UTC"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      viewOptions={{ "scrolling-3-day": { dayView: "scrolling-day" } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  return screen.container;
}

async function scrollTo(date: string) {
  calendarActions!.setAnchorDate(Temporal.PlainDate.from(date));
  await settled();
}

const title = (container: HTMLElement) =>
  text(container.querySelector('[data-calendar-part="title"]'));

/** The date of the all-day cell an element renders in. */
const cellDate = (element: Element | null | undefined) =>
  element?.closest('[role="gridcell"]')?.querySelector("[data-date]")?.getAttribute("data-date");

test("a scrolling week shows the anchor's week, renders one each side, and exposes only its days", async () => {
  const container = await show("scrolling-week");
  const columns = [...container.querySelectorAll('[role="gridcell"][data-date]')];

  // Wednesday October 7's week, from Monday.
  expect(title(container)).toBe("Oct 5 – 11, 2026");
  expect(columns.map((column) => column.getAttribute("data-date"))).toEqual(
    Array.from({ length: 21 }, (_, index) =>
      Temporal.PlainDate.from("2026-09-28").add({ days: index }).toString(),
    ),
  );
  expect(
    columns
      .filter((column) => !column.hasAttribute("aria-hidden"))
      .map((column) => column.getAttribute("data-date")),
  ).toEqual([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
  // Events on the loaded days around the view render too, ready to scroll into view.
  expect(
    container.querySelector('[data-date="2026-10-02"] [data-event-id="before"]'),
  ).not.toBeNull();
  const headers = container.querySelectorAll(
    '[role="columnheader"][aria-label]:not([aria-hidden])',
  );
  // The time-zone corner, then one header per visible day.
  expect(headers).toHaveLength(7);
  expect(ariaLabel(headers[1])).toBe("Tuesday, October 6, 2026");
});

test("a scrolling day view shows one day and names its header for that day", async () => {
  const container = await show("scrolling-day");

  expect(title(container)).toBe("October 7, 2026");
  expect(
    [...container.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])')].map(
      (column) => column.getAttribute("data-date"),
    ),
  ).toEqual(["2026-10-07"]);
  // A single day has nothing to open.
  expect(container.querySelector('[aria-label^="Open "]')).toBeNull();
});

test("three scrolling days page three at a time, and their dates open the day", async () => {
  const container = await show("scrolling-3-day");

  expect(
    [...container.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])')].map(
      (column) => column.getAttribute("data-date"),
    ),
  ).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"]);
  // A page either side renders too.
  expect(container.querySelectorAll('[role="gridcell"][data-date]')).toHaveLength(9);
  expect(container.querySelector('[aria-label="Open Thursday, October 8, 2026"]')).not.toBeNull();
});

test("the canvas places the rendered days a page before the visible ones", async () => {
  const container = await show("scrolling-week");
  const strips = [
    ...container.querySelectorAll<HTMLElement>(
      '[data-slot="scrolling-time-grid"] [style*="margin-inline-start"]',
    ),
  ];
  const days = container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-days"]')!;
  const track = days.firstElementChild as HTMLElement;

  // Each row's days, the header's, the all-day row's and the columns', sit at the same place.
  expect(strips).toHaveLength(3);
  expect(new Set(strips.map((strip) => strip.style.marginInlineStart)).size).toBe(1);
  expect(strips[0]!.style.width).toBe("calc(21 * var(--calendar-day-width))");
  expect(track.style.backgroundSize).toContain("var(--calendar-day-width) 100%");
  // Snap points where each page starts.
  expect(track.querySelectorAll("[aria-hidden] > *").length).toBeGreaterThan(1);
});

test("days scrolled away give the tab stop back to the visible days", async () => {
  const container = await show("scrolling-week");
  const cell = container.querySelector<HTMLElement>(
    '[data-date="2026-10-07"][data-all-day]',
  )!.parentElement!;
  await focus(cell);
  expect(cell.tabIndex).toBe(0);

  // A swipe comes to rest on the next week, leaving October 7 rendered but out of view.
  await scrollTo("2026-10-12");

  expect(cell.getAttribute("aria-hidden")).toBe("true");
  expect(cell.tabIndex).toBe(-1);
  const stops = [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')];
  expect(stops).toHaveLength(1);
  expect(stops[0]!.closest('[aria-hidden="true"]')).toBeNull();
  expect(container.querySelectorAll('[aria-hidden="true"] [tabindex="0"]')).toHaveLength(0);
});

test("days scrolled back into view take their cells back into the roving focus", async () => {
  const container = await show("scrolling-week");
  const cell = container.querySelector<HTMLElement>(
    '[data-date="2026-10-07"][data-all-day]',
  )!.parentElement!;
  await focus(cell);

  // The next week, with October 7 still rendered beside it.
  await scrollTo("2026-10-12");
  expect(cell.tabIndex).toBe(-1);
  await scrollTo("2026-10-07");

  // The same element, kept as the days scrolled away and back, is the tab stop again.
  expect(cell.isConnected).toBe(true);
  expect(cell.hasAttribute("aria-hidden")).toBe(false);
  expect(cell.tabIndex).toBe(0);
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});

test("a slot in a column scrolled away keeps focus but gives back the tab stop", async () => {
  const container = await show("scrolling-day");
  const grid = container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]')!;
  await focus(grid.querySelector('[tabindex="0"]'));
  // Down from the day's all-day cell into its first slot.
  await press("ArrowDown");
  const slot = document.activeElement as HTMLElement;
  expect(slot.getAttribute("role")).toBe("button");
  expect(slot.tabIndex).toBe(0);

  await scrollTo("2026-10-08");

  expect(document.activeElement).toBe(slot);
  expect(slot.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(container.querySelectorAll('[aria-hidden="true"] [tabindex="0"]')).toHaveLength(0);
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});

test("a bar that starts in days scrolled away stays readable and focusable", async () => {
  const container = await show("scrolling-week");
  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]')!;

  // It renders in the first visible day's cell and reaches back to its own first day.
  expect(cellDate(bar)).toBe("2026-10-05");
  expect(bar.closest('[aria-hidden="true"]')).toBeNull();
  expect(bar.style.insetInlineStart).toBe("calc(-3 * (100% + 1px))");

  const cell = container.querySelector<HTMLElement>(
    '[data-date="2026-10-08"][data-all-day]',
  )!.parentElement!;
  await focus(cell);
  // The trip, which starts first, is the day's first all-day event.
  await press("Enter");
  expect(document.activeElement).toBe(bar);
});

test("keys leave a bar focused by pointer from the first visible day it covers", async () => {
  const container = await show("scrolling-week");
  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]')!;

  // A click focuses the bar with no earlier focus on the event.
  await focus(bar);
  await press("Escape");

  // Escape returns to October 5, the first day it shows on, rather than paging back to October 2.
  expect(title(container)).toBe("Oct 5 – 11, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 5/);
});

test("a focused bar keeps focus as the day it was focused on scrolls away", async () => {
  const container = await show("scrolling-week");
  await focus(container.querySelector('[data-event-id="trip"]'));

  // A swipe comes to rest on the next week: the bar, through October 13, now renders from there.
  await scrollTo("2026-10-12");

  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]:not([tabindex="-1"])');
  expect(cellDate(bar)).toBe("2026-10-12");
  expect(document.activeElement).toBe(bar);
  await press("Escape");
  expect(title(container)).toBe("Oct 12 – 18, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 12/);
});

test.each([
  ["scrolling-week", "2026-10-20", "2026-10-19"],
  ["scrolling-day", "2026-10-09", "2026-10-09"],
] as const)(
  "%s keeps focus on a long bar when the view jumps past its loaded days",
  async (view, to, first) => {
    const container = await show(view);
    await focus(container.querySelector('[data-event-id="season"]'));

    // The day where focus was is no longer even loaded.
    await scrollTo(to);

    const bar = container.querySelector<HTMLElement>(
      '[data-event-id="season"]:not([tabindex="-1"])',
    );
    expect(cellDate(bar)).toBe(first);
    expect(document.activeElement).toBe(bar);
  },
);

test("a bar a midnight fold starts a day early keeps focus as the view jumps", async () => {
  // St John's fell back at 00:01 on November 7, 2010: an event from 00:00 that night also covers
  // the last minutes of November 6, its first local date.
  const fold: Fixture = {
    data: null,
    end: Temporal.Instant.from("2010-11-10T04:00:00Z"),
    id: "fold",
    kind: "timed",
    start: Temporal.Instant.from("2010-11-07T02:30:00Z"),
    title: "Fold",
  };
  const screen = await render(() => (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2010-11-06")}
      defaultTimeZone="America/St_Johns"
      defaultView="scrolling-day"
      events={[fold]}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  await focus(screen.container.querySelector('[data-event-id="fold"]'));

  await scrollTo("2010-11-08");

  const bar = screen.container.querySelector<HTMLElement>(
    '[data-event-id="fold"]:not([tabindex="-1"])',
  );
  expect(bar).not.toBeNull();
  expect(document.activeElement).toBe(bar);
});

test.each([
  ["scrolling-day", "2026-10-18", /^Sunday, October 18/],
  ["scrolling-week", "2026-10-07", /^Sunday, October 11/],
] as const)(
  "%s keeps focus on a long bar as the view scrolls back past its focused day",
  async (view, back, cell) => {
    const container = await show(view);
    await focus(container.querySelector('[data-event-id="season"]'));
    // Forward to October 20, where focus follows the bar, then back before it.
    await scrollTo("2026-10-20");
    await scrollTo(back);

    const bar = container.querySelector<HTMLElement>(
      '[data-event-id="season"]:not([tabindex="-1"])',
    );
    expect(bar).not.toBeNull();
    expect(document.activeElement).toBe(bar);
    // Escape goes to the last visible day the bar covers, without scrolling forward again.
    const before = title(container);
    await press("Escape");
    expect(title(container)).toBe(before);
    expect(ariaLabel(document.activeElement)).toMatch(cell);
  },
);

test("keys page a scrolling week past its visible days", async () => {
  const container = await show("scrolling-week");
  const grid = container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]')!;
  await focus(grid.querySelector('[tabindex="0"]'));
  expect(ariaLabel(document.activeElement)).toMatch(/^Thursday, October 8/);

  await press("End");
  await press("ArrowRight");

  expect(title(container)).toBe("Oct 12 – 18, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 12/);
});

test("the now line sits in today's column only", async () => {
  const container = await show("scrolling-week");
  const lines = container.querySelectorAll('[data-slot="time-grid-now"]');
  expect(lines).toHaveLength(1);
  expect(lines[0]!.closest("[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");
});

test("right to left lays the days from the right", async () => {
  const screen = await render(() => (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-07")}
      defaultTimeZone="UTC"
      defaultView="scrolling-week"
      direction="rtl"
      events={events}
      locale="ar"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  ));
  const grid = screen.container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]')!;
  const track = grid.querySelector<HTMLElement>('[data-slot="scrolling-time-grid-days"]')!
    .firstElementChild as HTMLElement;

  expect(grid.getAttribute("dir")).toBe("rtl");
  expect(track.style.backgroundImage).toContain("to left");
  expect(track.style.backgroundPosition).toMatch(/^0(px)? 0(px)?, right /);
});
