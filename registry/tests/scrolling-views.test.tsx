// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { epochDay, fromEpochDay } from "../calendar/scrolling-axis";
import { createScrollingMonthView } from "../scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "../scrolling-time-grid-view/scrolling-time-grid-view";
import { press, render } from "./render";
import { ariaLabel, text } from "./view-fixtures";

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createScrollingWeekView(), createScrollingDayView(), createScrollingMonthView()],
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

function Screen({
  onView,
  view,
}: {
  readonly onView?: (view: string) => void;
  readonly view: View;
}) {
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-07")}
      defaultTimeZone="UTC"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T10:20:00Z")}
      onViewChange={onView}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function show(view: View, onView?: (view: string) => void) {
  const screen = await render(<Screen onView={onView} view={view} />);
  cleanup = screen.unmount;
  return screen.container;
}

test("numbers days from 1970 for the scrolling axis", () => {
  expect(epochDay(Temporal.PlainDate.from("1970-01-02"))).toBe(1);
  expect(fromEpochDay(epochDay(Temporal.PlainDate.from("2026-10-07"))).toString()).toBe(
    "2026-10-07",
  );
});

test("a scrolling week shows the anchor's week, renders one each side, and exposes only its days", async () => {
  const container = await show("scrolling-week");
  const columns = [...container.querySelectorAll('[role="gridcell"][data-date]')];

  // Wednesday October 7's week, from Monday.
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 5 – 11, 2026");
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

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("October 7, 2026");
  expect(
    [...container.querySelectorAll('[role="gridcell"][data-date]:not([aria-hidden])')].map(
      (column) => column.getAttribute("data-date"),
    ),
  ).toEqual(["2026-10-07"]);
  // A single day has nothing to open.
  expect(container.querySelector('[aria-label^="Open "]')).toBeNull();
});

test("a scrolling month shows six weeks from the week of its month's first day", async () => {
  const onView = vi.fn<(view: string) => void>();
  const container = await show("scrolling-month", onView);
  const rows = [
    ...container.querySelectorAll('[data-slot="scrolling-month-viewport"] [role="row"]'),
  ];
  const visible = rows.filter((row) => row.closest("[aria-hidden]") === null);

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("October 2026");
  expect(rows).toHaveLength(18);
  expect(visible.map((row) => row.querySelector("[data-date]")?.getAttribute("data-date"))).toEqual(
    ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"],
  );

  await act(async () =>
    container.querySelector<HTMLElement>('button[aria-label="Thursday, October 8, 2026"]')!.click(),
  );
  // Dates open the day view unless `dayView` names another.
  expect(onView).toHaveBeenCalledWith("day", expect.anything());
});

test("days scrolled away give the tab stop back to the visible days", async () => {
  const container = await show("scrolling-week");
  const cell = container.querySelector<HTMLElement>(
    '[data-date="2026-10-07"][data-all-day]',
  )!.parentElement!;
  await act(async () => cell.focus());
  expect(cell.tabIndex).toBe(0);

  // A swipe comes to rest on the next week, leaving October 7 rendered but out of view.
  await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-10-12")));

  expect(cell.getAttribute("aria-hidden")).toBe("true");
  expect(cell.tabIndex).toBe(-1);
  const stops = [...container.querySelectorAll<HTMLElement>('[tabindex="0"]')];
  expect(stops).toHaveLength(1);
  expect(stops[0]!.closest('[aria-hidden="true"]')).toBeNull();
  expect(container.querySelectorAll('[aria-hidden="true"] [tabindex="0"]')).toHaveLength(0);
});

test("weeks scrolled away give the tab stop back to the visible weeks", async () => {
  const container = await show("scrolling-month");
  const cell = container.querySelector<HTMLElement>('[data-date="2026-09-28"]')!.parentElement!;
  await act(async () => cell.focus());
  expect(cell.tabIndex).toBe(0);

  // A swipe comes to rest on November, leaving September 28's week rendered but out of view.
  await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-11-14")));

  expect(cell.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(cell.tabIndex).toBe(-1);
  expect(container.querySelectorAll('[aria-hidden="true"] [tabindex="0"]')).toHaveLength(0);
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});

test("a bar that starts in days scrolled away stays readable and focusable", async () => {
  const container = await show("scrolling-week");
  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]')!;

  // It renders in the first visible day's cell and reaches back to its own first day.
  expect(
    bar.closest('[role="gridcell"]')?.querySelector("[data-date]")?.getAttribute("data-date"),
  ).toBe("2026-10-05");
  expect(bar.closest('[aria-hidden="true"]')).toBeNull();
  expect(bar.style.insetInlineStart).toBe("calc(-3 * (100% + 1px))");

  const cell = container.querySelector<HTMLElement>(
    '[data-date="2026-10-08"][data-all-day]',
  )!.parentElement!;
  await act(async () => cell.focus());
  // The trip, which starts first, is the day's first all-day event.
  await press(cell, "Enter");
  expect(document.activeElement).toBe(bar);
});

test("keys leave a bar focused by pointer from the first visible day it covers", async () => {
  const container = await show("scrolling-week");
  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]')!;

  // A click focuses the bar with no earlier focus on the event.
  await act(async () => bar.focus());
  await press(bar, "Escape");

  // Escape returns to October 5, the first day it shows on, rather than paging back to October 2.
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 5 – 11, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 5/);
});

test("a focused bar keeps focus as the day it was focused on scrolls away", async () => {
  const container = await show("scrolling-week");
  await act(async () => container.querySelector<HTMLElement>('[data-event-id="trip"]')!.focus());

  // A swipe comes to rest on the next week: the bar, through October 13, now renders from there.
  await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-10-12")));

  const bar = container.querySelector<HTMLElement>('[data-event-id="trip"]:not([tabindex="-1"])');
  expect(
    bar?.closest('[role="gridcell"]')?.querySelector("[data-date]")?.getAttribute("data-date"),
  ).toBe("2026-10-12");
  expect(document.activeElement).toBe(bar);
  await press(bar, "Escape");
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 12 – 18, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 12/);
});

test.each([
  ["scrolling-week", "2026-10-20", "2026-10-19"],
  ["scrolling-day", "2026-10-09", "2026-10-09"],
] as const)(
  "%s keeps focus on a long bar when the view jumps past its loaded days",
  async (view, to, first) => {
    const container = await show(view);
    await act(async () =>
      container.querySelector<HTMLElement>('[data-event-id="season"]')!.focus(),
    );

    // The day where focus was is no longer even loaded.
    await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from(to)));

    const bar = container.querySelector<HTMLElement>(
      '[data-event-id="season"]:not([tabindex="-1"])',
    );
    expect(
      bar?.closest('[role="gridcell"]')?.querySelector("[data-date]")?.getAttribute("data-date"),
    ).toBe(first);
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
  const screen = await render(
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
    </Calendar.Root>,
  );
  cleanup = screen.unmount;
  await act(async () =>
    screen.container.querySelector<HTMLElement>('[data-event-id="fold"]')!.focus(),
  );

  await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from("2010-11-08")));

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
    await act(async () =>
      container.querySelector<HTMLElement>('[data-event-id="season"]')!.focus(),
    );
    // Forward to October 20, where focus follows the bar, then back before it.
    await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-10-20")));
    await act(async () => calendarActions!.setAnchorDate(Temporal.PlainDate.from(back)));

    const bar = container.querySelector<HTMLElement>(
      '[data-event-id="season"]:not([tabindex="-1"])',
    );
    expect(bar).not.toBeNull();
    expect(document.activeElement).toBe(bar);
    // Escape goes to the last visible day the bar covers, without scrolling forward again.
    const title = text(container.querySelector('[data-calendar-part="title"]'));
    await press(bar, "Escape");
    expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe(title);
    expect(ariaLabel(document.activeElement)).toMatch(cell);
  },
);

test("keys page a scrolling week past its visible days", async () => {
  const container = await show("scrolling-week");
  const grid = container.querySelector<HTMLElement>('[data-slot="scrolling-time-grid"]')!;
  await act(async () => grid.querySelector<HTMLElement>('[tabindex="0"]')!.focus());
  expect(ariaLabel(document.activeElement)).toMatch(/^Thursday, October 8/);

  await press(document.activeElement, "End");
  await press(document.activeElement, "ArrowRight");

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 12 – 18, 2026");
  expect(ariaLabel(document.activeElement)).toMatch(/^Monday, October 12/);
});

test.each(["scrolling-week", "scrolling-day", "scrolling-month"] as const)(
  "%s server markup shows the visible range first and hydrates as is",
  async (view) => {
    const markup = renderToString(<Screen view={view} />);
    // Until the browser lays the canvas out, the visible range starts it: the page before sits
    // past its start edge.
    expect(markup).toMatch(
      view === "scrolling-month"
        ? /margin-block-start:calc\(-6 \* var\(--calendar-week-height\)\)/
        : view === "scrolling-week"
          ? /margin-inline-start:calc\(-7 \* var\(--calendar-day-width\)\)/
          : /margin-inline-start:calc\(-1 \* var\(--calendar-day-width\)\)/,
    );

    const container = document.createElement("div");
    container.innerHTML = markup;
    document.body.append(container);
    const errors: unknown[] = [];
    const root = await act(async () =>
      hydrateRoot(container, <Screen view={view} />, {
        onRecoverableError: (error) => errors.push(error),
      }),
    );
    cleanup = async () => {
      await act(async () => root.unmount());
      container.remove();
    };

    expect(errors).toEqual([]);
  },
);
