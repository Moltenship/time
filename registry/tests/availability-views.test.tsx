// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  type CalendarAvailability,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarFocus,
  type CalendarResource,
} from "@moltenship/calendar";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { createMonthView } from "../month-view/month-view";
import { createResourceColumnsView } from "../resource-columns-view/resource-columns-view";
import {
  createTimelineDayView,
  createTimelineWeekView,
} from "../resource-timeline-view/resource-timeline-view";
import { createWeekView } from "../time-grid-view/time-grid-view";
import type { UnavailableTimeRender } from "../calendar/unavailable-time";
import { drag, layOut } from "./pointer";
import { render } from "./render";
import { StubResizeObserver } from "./timeline-fixtures";
import { ariaLabel, text } from "./view-fixtures";

type Shift = CalendarEvent<null, string, string>;

const time = (value: string) => Temporal.PlainTime.from(value);
/** Weekdays 09:00 to 17:00, and an offsite that closes Friday, October 9. */
const officeHours: CalendarAvailability = {
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
};
/** Two people in New York and one in London; the display time zone is New York. */
const team: readonly CalendarResource<null>[] = [
  { data: null, id: "ny", timeZone: "America/New_York", title: "Nia" },
  { data: null, id: "london", timeZone: "Europe/London", title: "Leo" },
  {
    data: null,
    id: "night",
    title: "Nadia",
    availability: { weekly: [{ days: [4], end: time("06:00"), start: time("22:00") }] },
  },
];

const Calendar = createCalendar<Shift, CalendarResource<null>>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [
    createWeekView<Shift>(),
    createMonthView<Shift>(),
    createResourceColumnsView<Shift>(),
    createTimelineDayView<Shift>(),
    createTimelineWeekView<Shift>(),
  ],
});

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.unstubAllGlobals();
});

async function renderView(
  view: (typeof Calendar.views)[number]["name"],
  {
    defaultFocus = null,
    events = [],
    onEventChange,
    now = Temporal.Instant.from("2026-10-08T16:30:00Z"),
    options,
  }: {
    readonly defaultFocus?: CalendarFocus | null;
    readonly events?: readonly Shift[];
    readonly onEventChange?: (change: CalendarEventChange<Shift, string, string>) => void;
    readonly now?: Temporal.Instant;
    /** Options for every view. */
    readonly options?: object;
  } = {},
) {
  const result = await render(
    <Calendar.Root
      availability={officeHours}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultFocus={defaultFocus}
      defaultTimeZone="America/New_York"
      defaultView={view}
      events={events}
      locale="en-US"
      now={now}
      onEventChange={onEventChange}
      resources={team}
      viewOptions={
        options === undefined
          ? undefined
          : Object.fromEntries(Calendar.views.map(({ name }) => [name, options]))
      }
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.ActiveView />
    </Calendar.Root>,
  );
  cleanup = result.unmount;
  return result.container;
}

/** A shaded element's extent along its axis, in hours of its day. */
function hours(element: Element): string {
  const { height, top } = (element as HTMLElement).style;
  const hour = (percent: number) => Math.round(percent * 0.24 * 100) / 100;
  return `${hour(parseFloat(top))}-${hour(parseFloat(top) + parseFloat(height))}`;
}

const shading = (scope: Element) =>
  [...scope.querySelectorAll('[data-slot="time-grid-unavailable"]')].map((band) => hours(band));

test("the week shades time outside working hours, and a focused slot says so", async () => {
  const container = await renderView("week", {
    defaultFocus: {
      date: Temporal.PlainDate.from("2026-10-08"),
      kind: "slot",
      time: time("08:45"),
    },
  });
  const day = (date: string) =>
    container.querySelector(`[data-date="${date}"]:not([data-all-day])`)!;

  expect(shading(day("2026-10-08"))).toEqual(["0-9", "17-24"]);
  // The offsite closes Friday, and the weekend is closed.
  expect(shading(day("2026-10-09"))).toEqual(["0-24"]);
  expect(shading(day("2026-10-10"))).toEqual(["0-24"]);
  expect(ariaLabel(day("2026-10-08").querySelector('[role="button"]'))).toBe(
    "Thursday, October 8 at 8:45 AM, outside working hours",
  );
});

test("the month mutes closed days and names them", async () => {
  const container = await renderView("month");
  const cell = (date: string) => container.querySelector(`[data-date="${date}"]`)!;

  expect(cell("2026-10-08").hasAttribute("data-closed")).toBe(false);
  expect(cell("2026-10-09").hasAttribute("data-closed")).toBe(true);
  expect(cell("2026-10-10").hasAttribute("data-closed")).toBe(true);
  expect(ariaLabel(cell("2026-10-09").closest('[role="gridcell"]'))).toBe(
    "Friday, October 9, 2026, Offsite, closed, no events",
  );
});

test("resource columns shade each resource's hours on its own clock and show its local time", async () => {
  const container = await renderView("resources");
  const column = (id: string) =>
    container.querySelector(`[data-slot="resource-columns-body"] [data-resource-id="${id}"]`)!;

  expect(shading(column("ny"))).toEqual(["0-9", "17-24"]);
  // 09:00–17:00 in London is 04:00–12:00 in New York; London's Friday offsite starts at 19:00.
  expect(shading(column("london"))).toEqual(["0-4", "12-19", "19-24"]);
  // Nadia's own night shift replaces the calendar's hours: Thursday 22:00 to Friday 06:00.
  expect(shading(column("night"))).toEqual(["0-22"]);

  const headerTimes = [...container.querySelectorAll('[data-slot="resource-time"]')].map(text);
  // 16:30 UTC is 5:30 PM in London; New York's own clock needs no local time.
  expect(headerTimes).toEqual([", local time 5:30 PM GMT+1"]);
});

test("moving an event to a resource in another time zone keeps its instant", async () => {
  const onEventChange = vi.fn();
  const container = await renderView("resources", {
    events: [
      {
        data: null,
        end: Temporal.Instant.from("2026-10-08T14:00:00Z"),
        id: "call",
        kind: "timed",
        resourceIds: ["ny"],
        start: Temporal.Instant.from("2026-10-08T13:00:00Z"),
        title: "Call",
      },
    ],
    onEventChange,
  });
  const event = container.querySelector('[data-event-id="call"]')!;
  const columns = [
    ...container.querySelectorAll('[data-slot="resource-columns-body"] [data-date]'),
  ];
  // 100px columns, 100px an hour, from y = 0 at midnight in New York; the call is at 09:00 there.
  const hour = (value: number) => value * 100;
  layOut([
    [event, { height: 100, width: 100, x: 0, y: hour(9) }],
    ...columns.map(
      (target, index) => [target, { height: 2400, width: 100, x: index * 100, y: 0 }] as const,
    ),
  ]);

  drag(event, [
    [50, hour(9.5)],
    [100, hour(9.5)],
    [150, hour(9.5)],
  ]);

  const [[change]] = onEventChange.mock.calls as [[CalendarEventChange<Shift, string, string>]];
  expect(change.proposed?.resourceIds).toEqual(["london"]);
  expect(change.proposed?.start.toString()).toBe("2026-10-08T13:00:00Z");
  expect(change.proposed?.end.toString()).toBe("2026-10-08T14:00:00Z");
});

test("timelines shade hour rows on each resource's clock and mute closed days", async () => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  const day = await renderView("timeline-day");
  const row = (id: string) => day.querySelector(`[role="row"][data-resource-id="${id}"]`)!;
  const stretches = (id: string) =>
    [...row(id).querySelectorAll<HTMLElement>('[data-slot="resource-timeline-unavailable"]')].map(
      ({ style }) => style.width,
    );

  // A 24-slot timeline: closed hours are 9 + 7 wide in New York, 4 + 7 + 5 in London, where
  // Friday's offsite starts at 19:00 New York time.
  const slot = parseFloat(stretches("ny")[0]!) / 9;
  const inSlots = (id: string) =>
    stretches(id).map((width) => Math.round((parseFloat(width) / slot) * 100) / 100);
  expect(inSlots("ny")).toEqual([9, 7]);
  expect(inSlots("london")).toEqual([4, 7, 5]);
  expect(ariaLabel(row("london").querySelector('[role="rowheader"]'))).toBe(
    "Leo, local time 5:30 PM GMT+1",
  );
  await cleanup?.();

  const week = await renderView("timeline-week");
  const cell = (id: string, date: string) =>
    week
      .querySelector(`[role="row"][data-resource-id="${id}"] [data-date="${date}"]`)!
      .closest('[role="gridcell"]')!;
  expect(cell("ny", "2026-10-08").hasAttribute("data-closed")).toBe(false);
  expect(cell("ny", "2026-10-09").hasAttribute("data-closed")).toBe(true);
  expect(ariaLabel(cell("ny", "2026-10-09"))).toMatch(/, closed, no events$/);
});

test("a timeline's keyboard targets say when their time or day is closed", async () => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  /** The names of a row's keyboard targets: the entry, and the focused cell. */
  const targets = (container: Element, id: string) =>
    [
      ...container.querySelectorAll(
        `[role="row"][data-resource-id="${id}"] [role="button"][tabindex]`,
      ),
    ].map(ariaLabel);

  const day = await renderView("timeline-day", {
    defaultFocus: {
      date: Temporal.PlainDate.from("2026-10-08"),
      kind: "slot",
      resourceId: "ny",
      time: time("08:30"),
    },
  });
  expect(targets(day, "ny")).toContainEqual(
    expect.stringMatching(/^Nia, .*8:30.*, outside working hours$/),
  );
  await cleanup?.();

  const week = await renderView("timeline-week", {
    defaultFocus: { date: Temporal.PlainDate.from("2026-10-09"), kind: "day", resourceId: "ny" },
  });
  expect(targets(week, "ny")).toContainEqual(expect.stringMatching(/^Nia, .*October 9.*, closed$/));
});

test("closed time says why, where open time meets it, and where it sits", async () => {
  const container = await renderView("week");
  const bands = (date: string) => [
    ...container.querySelectorAll<HTMLElement>(
      `[data-date="${date}"]:not([data-all-day]) [data-slot="time-grid-unavailable"]`,
    ),
  ];
  const [morning, evening] = bands("2026-10-08");

  expect(morning!.dataset).toMatchObject({ opensAfter: "", reason: "outside-hours" });
  expect(morning!.hasAttribute("data-opens-before")).toBe(false);
  expect(evening!.dataset).toMatchObject({ opensBefore: "", reason: "outside-hours" });
  expect(morning!.getAttribute("aria-hidden")).toBe("true");
  expect(evening!.style.getPropertyValue("--band-start")).toMatch(/^70\.83/);
  expect(evening!.style.getPropertyValue("--band-end")).toBe("100%");
  expect(bands("2026-10-09")[0]!.dataset).toMatchObject({ label: "Offsite", reason: "exception" });
  expect(bands("2026-10-10")[0]!.dataset).toMatchObject({ reason: "closed-day" });
});

test("closed days say why, in the month and along a timeline of days", async () => {
  const month = await renderView("month");
  const closed = [...month.querySelectorAll<HTMLElement>('[data-slot="month-closed"]')];
  // October's month grid starts on Monday, September 28; the first closed days are a weekend.
  expect(closed[0]!.dataset).toMatchObject({ opensBefore: "", reason: "closed-day" });
  const offsite = month.querySelector<HTMLElement>(
    '[role="gridcell"]:has([data-date="2026-10-09"]) [data-slot="month-closed"]',
  )!;
  expect(offsite.dataset).toMatchObject({ label: "Offsite", opensBefore: "", reason: "exception" });
  // The weekend follows the offsite, so open time meets neither side's edge between them.
  expect(offsite.hasAttribute("data-opens-after")).toBe(false);
  await cleanup?.();

  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  const week = await renderView("timeline-week");
  const stretches = [
    ...week.querySelectorAll<HTMLElement>(
      '[role="row"][data-resource-id="ny"] [data-slot="resource-timeline-unavailable"]',
    ),
  ].map(({ dataset }) => [dataset.reason, dataset.label]);
  // Monday to Sunday: the offsite on Friday, then the weekend.
  expect(stretches).toEqual([
    ["exception", "Offsite"],
    ["closed-day", undefined],
  ]);
});

test("a view's renderUnavailable replaces the shading, per resource", async () => {
  const renderUnavailable: UnavailableTimeRender = (props, { band, date, resource }) => (
    <div
      {...props}
      data-date-of={date.toString()}
      data-tint={resource?.id === "london" ? "abroad" : "home"}
      data-why={band.reason}
    />
  );
  const container = await renderView("resources", { options: { renderUnavailable } });
  const tints = (id: string) =>
    [
      ...container.querySelectorAll<HTMLElement>(
        `[data-slot="resource-columns-body"] [data-resource-id="${id}"] [data-slot="time-grid-unavailable"]`,
      ),
    ].map(({ dataset }) => `${dataset.tint} ${dataset.why} ${dataset.dateOf}`);

  expect(tints("ny")).toEqual(["home outside-hours 2026-10-08", "home outside-hours 2026-10-08"]);
  expect(tints("london")).toEqual([
    "abroad outside-hours 2026-10-08",
    "abroad outside-hours 2026-10-08",
    "abroad exception 2026-10-08",
  ]);
});

const lunch: Shift = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T17:30:00Z"),
  id: "lunch",
  kind: "timed",
  resourceIds: ["ny"],
  start: Temporal.Instant.from("2026-10-08T16:00:00Z"),
  title: "Lunch",
};

test("resource headers show each resource's status in words with resourceStatus", async () => {
  // 16:30 UTC is 12:30 PM in New York, 5:30 PM in London.
  const plain = await renderView("resources", { events: [lunch] });
  expect(plain.querySelector('[data-slot="resource-status"]')).toBeNull();
  await cleanup?.();

  const container = await renderView("resources", {
    events: [lunch],
    options: { resourceStatus: true },
  });
  const badges = [...container.querySelectorAll<HTMLElement>('[data-slot="resource-status"]')];
  expect(badges.map((badge) => [badge.dataset.state, text(badge)])).toEqual([
    ["busy", "Busy until 1:30 PM"],
    // London's Friday is the offsite and then the weekend: it opens Monday, 4 AM here.
    ["outside-hours", "Outside hours until Mon 4:00 AM"],
    ["outside-hours", "Outside hours until 10:00 PM"],
  ]);
  // The header's name says it, after the name and local time.
  expect(text(badges[1]!.closest('[role="columnheader"]')!)).toBe(
    "Leo, local time 5:30 PM GMT+1, Outside hours until Mon 4:00 AM",
  );
});

test("timeline row headers name each resource's status with resourceStatus", async () => {
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  const container = await renderView("timeline-day", {
    events: [lunch],
    options: { resourceStatus: true },
  });
  const header = (id: string) =>
    container.querySelector(`[role="row"][data-resource-id="${id}"] [role="rowheader"]`)!;

  expect(ariaLabel(header("ny"))).toBe("Nia, Busy until 1:30 PM");
  expect(ariaLabel(header("london"))).toBe(
    "Leo, local time 5:30 PM GMT+1, Outside hours until Mon 4:00 AM",
  );
  expect(text(header("ny").querySelector('[data-slot="resource-status"]')!)).toBe(
    "Busy until 1:30 PM",
  );
});

test("badges say free until the next event or closing, and closed days with their label", async () => {
  // 13:00 UTC on Thursday is 9:00 AM in New York: Nia is free until lunch, at noon.
  const container = await renderView("resources", {
    events: [lunch],
    now: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    options: { resourceStatus: true },
  });
  const words = () =>
    [...container.querySelectorAll<HTMLElement>('[data-slot="resource-status"]')].map((badge) => [
      badge.dataset.state,
      text(badge),
    ]);
  expect(words()[0]).toEqual(["free", "Free until 12:00 PM"]);
  await cleanup?.();

  // Friday is the offsite, so New York is closed all day.
  const friday = await renderView("resources", {
    now: Temporal.Instant.from("2026-10-09T15:00:00Z"),
    options: { resourceStatus: true },
  });
  expect(text(friday.querySelector('[data-slot="resource-status"]')!)).toBe(
    "Closed today, Offsite",
  );
});
