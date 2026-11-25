// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarEvent,
} from "@moltenship/calendar-solid";
import { expect, test, vi } from "vite-plus/test";

import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";

import { click, focus, render, settled } from "./render";
import { text } from "./view-fixtures";

// The React scrolling month's tests (the month cases of registry/tests/scrolling-views.test.tsx),
// in Solid. React's server markup case has no twin: the Solid registry renders no server markup
// yet.

type Fixture = CalendarEvent<null, string>;

const Calendar = createCalendar<Fixture>()({
  eventAdapter: createCanonicalEventAdapter<null, string>(),
  views: [createScrollingMonthView<Fixture>()],
});

const events: readonly Fixture[] = [
  {
    data: null,
    end: Temporal.Instant.from("2026-10-08T11:00:00Z"),
    id: "planning",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Planning",
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

async function show(onView?: (view: string) => void) {
  const screen = await render(() => (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-07")}
      defaultTimeZone="UTC"
      defaultView="scrolling-month"
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
  ));
  return screen.container;
}

test("a scrolling month shows six weeks from the week of its month's first day", async () => {
  const onView = vi.fn<(view: string) => void>();
  const container = await show(onView);
  const rows = [
    ...container.querySelectorAll('[data-slot="scrolling-month-viewport"] [role="row"]'),
  ];
  const visible = rows.filter((row) => row.closest("[aria-hidden]") === null);

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("October 2026");
  expect(container.querySelector('[role="grid"]')?.getAttribute("aria-label")).toBe("October 2026");
  expect(rows).toHaveLength(18);
  expect(visible.map((row) => row.querySelector("[data-date]")?.getAttribute("data-date"))).toEqual(
    ["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"],
  );

  await click(container.querySelector('button[aria-label="Thursday, October 8, 2026"]'));
  // Dates open the day view unless `dayView` names another.
  expect(onView).toHaveBeenCalledWith("day", expect.anything());
});

test("weeks scrolled away give the tab stop back to the visible weeks", async () => {
  const container = await show();
  const cell = container.querySelector<HTMLElement>('[data-date="2026-09-28"]')!.parentElement!;
  await focus(cell);
  expect(cell.tabIndex).toBe(0);

  // A swipe comes to rest on November, leaving September 28's week rendered but out of view.
  calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-11-14"));
  await settled();

  expect(cell.closest('[aria-hidden="true"]')).not.toBeNull();
  expect(cell.tabIndex).toBe(-1);
  expect(container.querySelectorAll('[aria-hidden="true"] [tabindex="0"]')).toHaveLength(0);
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});

test("weeks scrolled back into view take their days back into the roving focus", async () => {
  const container = await show();
  const cell = container.querySelector<HTMLElement>('[data-date="2026-10-29"]')!.parentElement!;
  await focus(cell);

  calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-12-14"));
  await settled();
  expect(cell.tabIndex).toBe(-1);
  calendarActions!.setAnchorDate(Temporal.PlainDate.from("2026-10-14"));
  await settled();

  // The same element, kept as the week scrolled away and back, is the tab stop again.
  expect(cell.isConnected).toBe(true);
  expect(cell.closest('[aria-hidden="true"]')).toBeNull();
  expect(cell.tabIndex).toBe(0);
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
});
