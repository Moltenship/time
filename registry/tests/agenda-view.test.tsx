// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, test } from "vite-plus/test";

import { createAgendaView } from "../list-view/agenda-view";
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

const Calendar = createTestCalendar(
  createAgendaView<ColoredEvent>({
    describeEvent: (event) => `${event.data.color} calendar`,
    getEventColor: (event) => event.data.color,
  }),
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

test("is a list of days, each listing its events by their full names", async () => {
  const { container } = await renderAgenda([
    timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
    allDay("conference", "2026-10-07", "2026-10-09"),
  ]);
  const list = container.querySelector('[data-slot="agenda-view"] > ol');

  expect(list?.tagName).toBe("OL");
  expect(ariaLabel(list)).toBe("Oct 4 – 31, 2026");
  expect(
    [...(list?.querySelectorAll(":scope > li > ul > li > [data-event-id]") ?? [])].map(ariaLabel),
  ).toEqual([
    "conference, all day, Wednesday, October 7 – Thursday, October 8, teal calendar",
    "conference, all day, Wednesday, October 7 – Thursday, October 8, teal calendar",
    "standup, Thursday, October 8, 9:00 – 9:30 AM, blue calendar",
  ]);
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

async function press(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
    );
    await Promise.resolve();
  });
}

test("is one tab stop whose arrow and page keys move between events and days", async () => {
  const { container } = await renderAgenda([
    timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
    timed("lunch", "2026-10-08T12:00Z", "2026-10-08T13:00Z"),
    timed("review", "2026-10-09T15:00Z", "2026-10-09T16:00Z"),
  ]);
  const focused = () => document.activeElement?.getAttribute("data-event-id");
  const stops = [...container.querySelectorAll('[data-slot="agenda-view"] [tabindex="0"]')];
  expect(stops.map((stop) => stop.getAttribute("data-event-id"))).toEqual(["standup"]);
  expect(
    container.querySelector('[aria-label="Thursday, October 8, 2026"]')?.getAttribute("tabindex"),
  ).toBe("-1");

  await act(async () => (stops[0] as HTMLElement).focus());
  await press("ArrowDown");
  expect(focused()).toBe("lunch");
  await press("PageDown");
  expect(focused()).toBe("review");
  await press("Home");
  expect(focused()).toBe("standup");
});

test("Shift+Enter on an event opens its day", async () => {
  const { container } = await renderAgenda([
    timed("review", "2026-10-09T15:00Z", "2026-10-09T16:00Z"),
  ]);
  await act(async () => container.querySelector<HTMLElement>('[data-event-id="review"]')!.focus());

  await press("Enter", { shiftKey: true });

  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Day 2026-10-09");
});

test("keyboard paging crosses an empty range and comes back", async () => {
  const { container } = await renderAgenda([
    timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
  ]);
  await act(async () => container.querySelector<HTMLElement>('[data-event-id="standup"]')!.focus());

  await press("ArrowDown");
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Nov 1 – 28, 2026");
  expect(document.activeElement?.getAttribute("role")).toBe("group");
  expect(text(document.activeElement)).toBe("No eventsNothing is scheduled for November 1 – 28.");
  expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

  // Space starts nothing here, so paging keeps working.
  await press(" ");
  await press(" ", { shiftKey: true });
  await press("ArrowDown");
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe(
    "Nov 29 – Dec 26, 2026",
  );
  expect(document.activeElement?.getAttribute("role")).toBe("group");

  await press("ArrowUp");
  await press("ArrowUp");
  expect(text(container.querySelector('[data-calendar-part="title"]'))).toBe("Oct 4 – 31, 2026");
  expect(document.activeElement?.getAttribute("data-event-id")).toBe("standup");
});

test("of 10,000 events over two years, renders only the days in view, numbered among all", async () => {
  const anchorWeek = Temporal.PlainDate.from("2026-10-04");
  const events = Array.from({ length: 10_000 }, (_, index) => {
    const start = anchorWeek
      .add({ days: index % 728 })
      .toZonedDateTime({ plainTime: { hour: 6 + Math.floor(index / 728) }, timeZone: "UTC" });
    const iso = (time: Temporal.ZonedDateTime) => time.toInstant().toString();
    return timed(`event-${index}`, iso(start), iso(start.add({ minutes: 30 })));
  });
  const view = await render(
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={events}
      locale="en-US"
      viewOptions={{ agenda: { weeks: 104 } }}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = view.unmount;
  const days = () => [...view.container.querySelectorAll("li[data-date]")];

  expect(text(view.container.querySelector('[data-calendar-part="title"]'))).toBe(
    "Oct 4, 2026 – Sep 30, 2028",
  );
  expect(days().length).toBeLessThan(12);
  expect(view.container.querySelectorAll("[data-event-id]").length).toBeLessThan(160);
  expect(days()[0]?.getAttribute("data-date")).toBe("2026-10-04");
  expect(days()[0]?.getAttribute("aria-posinset")).toBe("1");
  expect(days().every((day) => day.getAttribute("aria-setsize") === "728")).toBe(true);
});
