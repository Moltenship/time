// @vitest-environment jsdom

import { createSignal } from "solid-js";
import { expect, test } from "vite-plus/test";

import { createMonthView } from "@registry/month-view/month-view";

import { click, render, settled } from "./render";
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

// The React month's tests (registry/tests/month-view.test.tsx), in Solid: the two months render
// the same roles, names, lanes and popover.

const Calendar = createTestCalendar(
  createMonthView<ColoredEvent>({ getEventColor: (event) => event.data.color }),
);

const events = [
  allDay("trip", "2026-10-06", "2026-10-09"),
  timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z", "orange"),
  timed("review", "2026-10-08T15:30Z", "2026-10-08T16:00Z"),
  timed("redeye", "2026-10-09T22:00Z", "2026-10-10T02:00Z", "purple"),
];

/** An event's visible parts (time, title), joined by spaces. */
function label(element: Element | undefined): string {
  return [...(element?.children ?? [])].map(text).filter(Boolean).join(" ");
}

function Month(props: { readonly events: readonly ColoredEvent[]; readonly firstDay?: 1 | 7 }) {
  return (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="month"
      events={props.events}
      locale="en-US"
      weekRules={{ firstDay: props.firstDay ?? 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

const renderMonth = (firstDay: 1 | 7 = 7) =>
  render(() => <Month events={events} firstDay={firstDay} />);

test("renders whole weeks of date cells from the configured week start", async () => {
  const { container, unmount } = await renderMonth();
  const cells = [...container.querySelectorAll("[data-date]")];

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("October 2026");
  expect(cells).toHaveLength(35);
  expect(cells[0]?.getAttribute("data-date")).toBe("2026-09-27");
  expect(container.querySelector('[aria-current="date"]')?.getAttribute("aria-label")).toBe(
    "Thursday, October 8, 2026",
  );
  // A month's first date shows "Oct 1", and its name contains what it shows.
  expect(text(container.querySelector('[aria-label="Thursday, Oct 1, 2026"]'))).toBe("Oct 1");

  unmount();
  const monday = await renderMonth(1);
  expect(monday.container.querySelector("[data-date]")?.getAttribute("data-date")).toBe(
    "2026-09-28",
  );
});

test("is a grid of weekday headers and week rows whose day cells hold the events starting there", async () => {
  const { container } = await renderMonth();
  const grid = container.querySelector('[role="grid"]');
  const [header, ...weeks] = [...(grid?.querySelectorAll('[role="row"]') ?? [])];
  const trip = container.querySelector('[data-event-id="trip"]');

  expect(grid?.getAttribute("aria-label")).toBe("October 2026");
  expect(
    [...(header?.querySelectorAll('[role="columnheader"]') ?? [])].map((cell) =>
      cell.getAttribute("aria-label"),
    ),
  ).toEqual(["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]);
  expect(weeks.map((week) => week.querySelectorAll('[role="gridcell"]').length)).toEqual([
    7, 7, 7, 7, 7,
  ]);
  expect(
    trip?.closest('[role="gridcell"]')?.querySelector("[data-date]")?.getAttribute("data-date"),
  ).toBe("2026-10-06");
  // Pointer hit-testing reads the cell under the pointer, never the cell a bar starts in.
  expect(trip?.closest("[data-date]")).toBeNull();
  expect(ariaLabel(trip)).toBe("trip, all day, Tuesday, October 6 – Thursday, October 8");
});

test("shows bars and items that fit and counts the rest per day", async () => {
  // jsdom has no layout, so rows fall back to their 80px minimum: two lanes.
  const { container } = await renderMonth();
  const visible = [...container.querySelectorAll("[data-event-id]")];

  expect(visible.map((element) => element.getAttribute("data-event-id"))).toEqual([
    "trip",
    "redeye",
  ]);
  expect(visible.map((element) => element.getAttribute("data-color"))).toEqual(["teal", "purple"]);
  expect(label(visible[1])).toBe("10 PM redeye");
  expect(
    container.querySelector('[aria-label="3 more events on Thursday, October 8, 2026"]'),
  ).not.toBeNull();
});

test("lists every event of an overflowing day in a popover", async () => {
  const { container } = await renderMonth();

  await click(container.querySelector('[aria-label^="3 more events"]'));
  await settled();
  const listed = [...document.querySelectorAll('[data-slot="popover-content"] [data-event-id]')];

  expect(listed.map(label)).toEqual(["trip", "9 AM standup", "12 PM lunch", "3:30 PM review"]);
});

test("opens the day view from a date number", async () => {
  const { container } = await renderMonth();

  await click(container.querySelector('[aria-label="Tuesday, October 13, 2026"]'));

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-13");
  expect(container.querySelector('[data-testid="day-view"]')).not.toBeNull();
});

test("keeps numeric and string IDs with the same text apart", async () => {
  const [shown, setShown] = createSignal<readonly ColoredEvent[]>([
    timed(1, "2026-10-20T09:00Z", "2026-10-20T10:00Z"),
    timed("1", "2026-10-20T09:00Z", "2026-10-20T10:00Z"),
  ]);
  const { container } = await render(() => <Month events={shown()} />);
  const ids = () =>
    [...container.querySelectorAll("[data-event-id]")].map((element) =>
      element.getAttribute("data-event-id"),
    );

  expect(ids()).toEqual(["1", "1"]);
  setShown([timed(3, "2026-10-20T09:00Z", "2026-10-20T10:00Z")]);
  await settled();
  expect(ids()).toEqual(["3"]);
});
