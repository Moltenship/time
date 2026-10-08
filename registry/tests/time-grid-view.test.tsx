// @vitest-environment jsdom

import {
  createCalendar,
  createFixedClock,
  defineEventAdapter,
  type CalendarEventInterval,
} from "@moltenship/calendar";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, expect, test } from "vite-plus/test";

import type { CalendarEventColor } from "../calendar-theme/event-colors";
import { createDayView, createWeekView } from "../time-grid-view/time-grid-view";
import { click, render } from "./render";

interface Meeting {
  readonly color?: CalendarEventColor;
  readonly id: string;
  readonly interval: CalendarEventInterval;
  readonly readOnly?: boolean;
}

function timed(id: string, start: string, end: string, extra: Partial<Meeting> = {}): Meeting {
  return {
    id,
    interval: {
      end: Temporal.Instant.from(end),
      kind: "timed",
      start: Temporal.Instant.from(start),
    },
    ...extra,
  };
}

function allDay(id: string, start: string, end: string): Meeting {
  return {
    id,
    interval: {
      end: Temporal.PlainDate.from(end),
      kind: "all-day",
      start: Temporal.PlainDate.from(start),
    },
  };
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getInterval: (meeting) => meeting.interval,
  getResourceIds: () => [],
  getTitle: (meeting) => `Meeting ${meeting.id}`,
  isReadOnly: (meeting) => meeting.readOnly === true,
});

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter,
  views: [
    createWeekView<Meeting>({ dayView: "day", getEventColor: (meeting) => meeting.color }),
    createDayView<Meeting>(),
  ],
});

// Thursday 2026-10-08 in New York; the week starts on Monday the 5th.
const meetings = [
  timed("a", "2026-10-08T13:00Z", "2026-10-08T14:00Z", { color: "green" }),
  timed("b", "2026-10-08T13:30Z", "2026-10-08T14:30Z"),
  timed("c", "2026-10-08T14:00Z", "2026-10-08T15:00Z"),
  timed("overnight", "2026-10-10T02:00Z", "2026-10-10T06:00Z"),
  timed("locked", "2026-10-06T14:00Z", "2026-10-06T15:00Z", { readOnly: true }),
  allDay("holiday", "2026-10-06", "2026-10-07"),
  ...["w1", "w2", "w3", "w4"].map((id) => allDay(id, "2026-10-07", "2026-10-08")),
];

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function renderCalendar(
  view: "day" | "week",
  anchor: string,
  events: readonly Meeting[] = meetings,
) {
  const result = await render(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from(anchor)}
      defaultTimeZone="America/New_York"
      defaultView={view}
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T16:30Z")}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = result.unmount;
  return result.container;
}

const columnDates = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-slot="time-grid-body"] [data-date]')].map((column) =>
    column.getAttribute("data-date"),
  );
const event = (container: HTMLElement, id: string) =>
  container.querySelectorAll<HTMLElement>(`[data-event-id="${id}"]`);

test("renders a week of day columns with headers, hour labels, and today highlighted", async () => {
  const container = await renderCalendar("week", "2026-10-08");

  expect(columnDates(container)).toEqual([
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ]);
  expect(container.querySelector('[aria-current="date"]')?.getAttribute("aria-label")).toBe(
    "Thursday, October 8, 2026",
  );
  const labels = [
    ...container.querySelectorAll('[data-slot="time-grid-body"] [aria-hidden] > span'),
  ];
  expect(labels.map((label) => label.textContent)).toHaveLength(23);
  expect(labels[0]?.textContent).toBe("1 AM");
  expect(labels.at(-1)?.textContent).toBe("11 PM");
});

test("places overlapping events side by side and back-to-back events in a shared lane", async () => {
  const container = await renderCalendar("week", "2026-10-08");
  const position = (id: string) => {
    const { left, top, width } = event(container, id)[0]!.style;
    return [top, left, width];
  };

  expect(position("a")).toEqual([`${(9 / 24) * 100}%`, "0%", "50%"]);
  expect(position("b")).toEqual([`${(9.5 / 24) * 100}%`, "50%", "50%"]);
  expect(position("c")).toEqual([`${(10 / 24) * 100}%`, "0%", "50%"]);
  expect(event(container, "a")[0]!.getAttribute("data-color")).toBe("green");
  expect(event(container, "a")[0]!.textContent).toBe("Meeting a9:00\u2009–\u200910:00 AM");
});

test("marks resize edges only where an editable fragment starts or ends", async () => {
  const container = await renderCalendar("week", "2026-10-08");
  const handles = (element: HTMLElement) =>
    [...element.querySelectorAll("[data-resize]")].map((handle) =>
      handle.getAttribute("data-resize"),
    );
  const [friday, saturday] = event(container, "overnight");

  expect(handles(event(container, "a")[0]!)).toEqual(["start", "end"]);
  expect(handles(friday!)).toEqual(["start"]);
  expect(handles(saturday!)).toEqual(["end"]);
  expect(handles(event(container, "locked")[0]!)).toEqual([]);
});

test("labels an overnight event with the weekday its end falls on", async () => {
  const container = await renderCalendar("week", "2026-10-08");
  const [friday, saturday] = event(container, "overnight");

  // 22:00 Friday to 02:00 Saturday in New York; both fragments show the event's own range.
  for (const fragment of [friday!, saturday!]) {
    expect(fragment.textContent?.replace(/\s/gu, " ")).toBe(
      "Meeting overnight10:00 PM – Sat 2:00 AM",
    );
  }
});

test("draws the now-line in today's column only", async () => {
  const container = await renderCalendar("week", "2026-10-08");
  const lines = container.querySelectorAll<HTMLElement>('[data-slot="time-grid-now"]');

  expect(lines).toHaveLength(1);
  expect(lines[0]!.closest("[data-date]")?.getAttribute("data-date")).toBe("2026-10-08");
  expect(lines[0]!.style.top).toBe(`${(12.5 / 24) * 100}%`);
});

test("collapses a busy all-day row to +N more and expands it", async () => {
  const container = await renderCalendar("week", "2026-10-08");
  const visible = () =>
    ["w1", "w2", "w3", "w4"].filter((id) => event(container, id).length > 0).length;
  const more = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith("+"),
  );

  expect(container.querySelectorAll("[data-all-day][data-date]")).toHaveLength(7);
  expect(event(container, "holiday")).toHaveLength(1);
  expect(visible()).toBe(2);
  expect(more?.textContent).toBe("+2 more");

  await click(more!);
  expect(visible()).toBe(4);
  expect(container.querySelector('[aria-label="Show fewer all-day events"]')).not.toBeNull();
});

test("opens the day view from a week header date", async () => {
  const container = await renderCalendar("week", "2026-10-08");

  await click(container.querySelector('[aria-label="Open Tuesday, October 6, 2026"]'));

  expect(columnDates(container)).toEqual(["2026-10-06"]);
  expect(event(container, "locked")).toHaveLength(1);
});

test("hatches the skipped hour of a spring-forward day", async () => {
  const container = await renderCalendar("day", "2026-03-08", [
    timed("night", "2026-03-08T06:00Z", "2026-03-08T08:00Z"),
  ]);
  const gap = container.querySelector<HTMLElement>('[title="Skipped: clocks moved forward"]');

  const hours = (value: string | undefined) => (Number.parseFloat(value ?? "") / 100) * 24;
  const night = event(container, "night")[0]!.style;

  expect(hours(gap?.style.top)).toBeCloseTo(2, 9);
  expect(hours(gap?.style.height)).toBeCloseTo(1, 9);
  expect(hours(night.top)).toBeCloseTo(1, 9);
  expect(hours(night.height)).toBeCloseTo(3, 9);
});

test("keeps header dates static when the week has no day view to open", async () => {
  const WeekOnly = createCalendar<Meeting, never>()({
    eventAdapter,
    views: [createWeekView<Meeting>()],
  });
  const { container, unmount } = await render(
    <WeekOnly.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={meetings}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <WeekOnly.ActiveView />
    </WeekOnly.Root>,
  );
  cleanup = unmount;

  expect(container.querySelector('[aria-label^="Open "]')).toBeNull();
  expect(columnDates(container)).toHaveLength(7);
});

test("opens on the current time once a hydrated clock reports it", async () => {
  const sizes = { clientHeight: 600, scrollHeight: 1_440 };
  const originals = Object.keys(sizes).map(
    (key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)] as const,
  );
  for (const [key, value] of Object.entries(sizes)) {
    Object.defineProperty(HTMLElement.prototype, key, { configurable: true, get: () => value });
  }
  const element = (
    <Calendar.Root
      clock={createFixedClock(Temporal.Instant.from("2026-10-08T16:30Z"))}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="day"
      events={[]}
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.append(container);

  try {
    const root = await act(async () => hydrateRoot(container, element));
    cleanup = async () => {
      await act(async () => root.unmount());
      container.remove();
    };
    const body = container.querySelector('[data-slot="time-grid-body"]');

    expect(container.querySelector('[data-slot="time-grid-now"]')).not.toBeNull();
    expect(body?.scrollTop).toBe(0.6875 * 1_440 - 600 / 3);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, key);
      else Object.defineProperty(HTMLElement.prototype, key, descriptor);
    }
  }
});

test("dims an event while its change is being saved", async () => {
  let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;
  function CaptureActions() {
    actions = Calendar.useCalendarActions();
    return null;
  }
  const { container, unmount } = await render(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="America/New_York"
      events={meetings}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T16:30Z")}
      onEventChange={() => new Promise<void>(() => {})}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <CaptureActions />
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = unmount;

  await act(async () => {
    void actions!.proposeEventChange({
      cause: "move",
      eventId: "c",
      proposed: {
        end: Temporal.Instant.from("2026-10-08T19:00Z"),
        kind: "timed",
        start: Temporal.Instant.from("2026-10-08T18:00Z"),
      },
    });
  });
  const [moved] = event(container, "c");

  expect(moved!.hasAttribute("data-pending")).toBe(true);
  expect(moved!.style.top).toBe(`${(14 / 24) * 100}%`);
  expect(event(container, "a")[0]!.hasAttribute("data-pending")).toBe(false);
});
