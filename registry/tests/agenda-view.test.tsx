// @vitest-environment jsdom

import { afterEach, expect, test } from "vite-plus/test";

import { createAgendaView } from "../list-view/agenda-view";
import { click, render } from "./render";
import {
  allDay,
  anchorDate,
  clock,
  createTestCalendar,
  text,
  timed,
  type ColoredEvent,
} from "./view-fixtures";

const Calendar = createTestCalendar(
  createAgendaView<ColoredEvent>({ getEventColor: (event) => event.data.color }),
);

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

function agenda(events: readonly ColoredEvent[]) {
  return (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={events}
      locale="en-US"
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}

async function renderAgenda(events: readonly ColoredEvent[]) {
  const view = await render(agenda(events));
  cleanup = view.unmount;
  return view;
}

test("groups events by day with time ranges, all-day badges, and day k of n", async () => {
  const { container } = await renderAgenda([
    timed("redeye", "2026-10-09T22:00Z", "2026-10-10T02:00Z", "purple"),
    timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
    allDay("conference", "2026-10-07", "2026-10-09"),
  ]);
  const days = [...container.querySelectorAll("li[data-date]")].map((day) => ({
    date: day.getAttribute("data-date"),
    items: [...day.querySelectorAll("[data-event-id]")].map((item) => text(item)),
  }));

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 4 – 31, 2026");
  expect(days).toEqual([
    { date: "2026-10-07", items: ["All dayconferenceDay 1 of 2"] },
    { date: "2026-10-08", items: ["All dayconferenceDay 2 of 2", "9:00 – 9:30 AMstandup"] },
    { date: "2026-10-09", items: ["From 10:00 PMredeyeDay 1 of 2"] },
    { date: "2026-10-10", items: ["Until 2:00 AMredeyeDay 2 of 2"] },
  ]);
  expect(container.querySelector('[data-event-id="redeye"]')?.getAttribute("data-color")).toBe(
    "purple",
  );
  expect(container.querySelector('[aria-current="date"]')?.getAttribute("aria-label")).toBe(
    "Thursday, October 8, 2026",
  );
});

test("keeps numeric and string IDs with the same text apart", async () => {
  const view = await renderAgenda([
    timed(1, "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
    timed(2, "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
    timed("1", "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
    timed("2", "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
  ]);
  const count = () => view.container.querySelectorAll("[data-event-id]").length;

  expect(count()).toBe(4);
  await view.rerender(agenda([timed(3, "2026-10-08T09:00Z", "2026-10-08T10:00Z")]));
  expect(count()).toBe(1);
});

test("opens the day view from a date", async () => {
  const { container } = await renderAgenda([
    timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  ]);

  await click(container.querySelector('[aria-label="Thursday, October 8, 2026"]'));

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-08");
});

test("explains an empty range", async () => {
  const { container } = await renderAgenda([]);

  expect(text(container.querySelector("p + p"))).toBe("Nothing is scheduled for October 4 – 31.");
});
