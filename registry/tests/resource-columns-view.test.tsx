// @vitest-environment jsdom

import type { CalendarEventChange, CalendarFocus, CalendarResource } from "@moltenship/calendar";
import { act } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { drag, layOut } from "./pointer";
import { click, render } from "./render";
import {
  people,
  ResourceCalendar,
  ResourceWeekCalendar,
  shift,
  shiftAllDay,
  type StaffEvent,
} from "./resource-fixtures";
import { ariaLabel, text } from "./view-fixtures";

type Change = CalendarEventChange<StaffEvent, string, string>;

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

interface CalendarOptions {
  readonly direction?: "ltr" | "rtl";
  readonly events?: readonly StaffEvent[];
  readonly expanded?: readonly string[];
  /** Controls the calendar's focus when set. */
  readonly focus?: CalendarFocus | null;
  readonly onEventChange?: (change: Change) => void;
  readonly unassigned?: "bucket" | "hide";
}

function calendar(
  resources: readonly CalendarResource<null>[],
  {
    direction,
    events = [],
    expanded = [],
    focus,
    onEventChange,
    unassigned = "hide",
  }: CalendarOptions = {},
) {
  return (
    <ResourceCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultExpandedResourceIds={expanded}
      defaultTimeZone="America/New_York"
      defaultView="resources"
      direction={direction}
      events={events}
      focus={focus}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T16:30Z")}
      onEventChange={onEventChange}
      resources={resources}
      viewOptions={{ resources: { unassigned } }}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <ResourceCalendar.ActiveView />
    </ResourceCalendar.Root>
  );
}

async function renderResources(
  resources: readonly CalendarResource<null>[],
  options?: CalendarOptions,
) {
  const result = await render(calendar(resources, options));
  cleanup = result.unmount;
  return result.container;
}

const body = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-slot="resource-columns-body"]')!;
const renderedResources = (container: HTMLElement) =>
  [...body(container).querySelectorAll("[data-resource-id]")].map((column) =>
    column.getAttribute("data-resource-id"),
  );
const rows = (container: HTMLElement) => [...container.querySelectorAll('[role="row"]')];
const headers = (container: HTMLElement) =>
  [...rows(container)[0]!.querySelectorAll('[role="columnheader"]')]
    .slice(1)
    .map((header) => text(header.querySelector("[title]")));

async function scrollTo(element: HTMLElement, left: number) {
  Object.defineProperty(element, "scrollLeft", { configurable: true, value: left });
  await act(async () => {
    element.dispatchEvent(new Event("scroll"));
  });
}

test("renders only the resource columns in view out of 200", async () => {
  const container = await renderResources(people(200));
  const rendered = renderedResources(container);

  // 960px before the browser measures, at 128px a column, plus two either side.
  expect(rendered).toEqual(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
  expect(headers(container)).toEqual(rendered.map((id) => `Person ${id?.slice(1)}`));
  expect(body(container).firstElementChild).toHaveProperty("style.width", `${200 * 128}px`);
  expect(container.querySelector('[role="grid"]')?.getAttribute("aria-colcount")).toBe("201");
});

test("scrolling sideways renders the columns in view and moves the headers with them", async () => {
  const container = await renderResources(people(200));

  await scrollTo(body(container), 100 * 128);

  expect(renderedResources(container)).toEqual(
    Array.from({ length: 12 }, (_, index) => `p${99 + index}`),
  );
  const canvas = rows(container)[0]!.querySelector<HTMLElement>(
    '[role="columnheader"] + div > div',
  );
  expect(canvas?.style.transform).toBe(`translateX(${-100 * 128}px)`);
  expect(headers(container)[0]).toBe("Person 99");
  expect(
    [...body(container).querySelectorAll('[role="gridcell"]')].map((cell) =>
      cell.getAttribute("aria-colindex"),
    )[0],
  ).toBe("100");
});

test("a few resources share the width", async () => {
  const container = await renderResources(people(3));
  const columns = [...body(container).querySelectorAll<HTMLElement>("[data-resource-id]")];

  expect(columns.map((column) => [column.style.insetInlineStart, column.style.width])).toEqual([
    ["0px", "320px"],
    ["320px", "320px"],
    ["640px", "320px"],
  ]);
});

test("shows each event in the column of every resource it books, named with that resource", async () => {
  const container = await renderResources(people(3), {
    events: [
      shift("standup", ["p1", "p3"], "2026-10-08T13:00Z", "2026-10-08T13:30Z"),
      shift("review", ["p2"], "2026-10-08T15:00Z", "2026-10-08T16:00Z"),
      shiftAllDay("leave", ["p2"], "2026-10-08", "2026-10-09"),
    ],
  });
  const copies = (id: string) => [...container.querySelectorAll(`[data-event-id="${id}"]`)];
  const resourceOf = (element: Element) =>
    element.closest("[data-resource-id]")?.getAttribute("data-resource-id");

  expect(copies("standup").map(resourceOf)).toEqual(["p1", "p3"]);
  expect(copies("standup").map(ariaLabel)).toEqual([
    "standup, Thursday, October 8, 9:00 – 9:30 AM, Person 1",
    "standup, Thursday, October 8, 9:00 – 9:30 AM, Person 3",
  ]);
  expect(copies("review").map(resourceOf)).toEqual(["p2"]);
  expect(copies("leave").map(resourceOf)).toEqual(["p2"]);
  expect(ariaLabel(copies("leave")[0]?.closest('[role="gridcell"]'))).toBe(
    "Person 2, Thursday, October 8, 2026, 1 all-day event",
  );
  expect(container.querySelectorAll('[data-slot="time-grid-now"]')).toHaveLength(3);
});

test("is a grid of resource headers, an all-day row, and a timed row", async () => {
  const container = await renderResources(people(2));
  const [header, allDay, timed] = rows(container);
  const cells = (row: Element | undefined, role: string) => [
    ...(row?.querySelectorAll(`[role="${role}"]`) ?? []),
  ];

  expect(ariaLabel(container.querySelector('[role="grid"]'))).toBe("October 8, 2026");
  expect(cells(header, "columnheader").map(text)).toEqual(["GMT-4", "Person 1", "Person 2"]);
  expect(cells(allDay, "gridcell").map((cell) => cell.getAttribute("aria-colindex"))).toEqual([
    "2",
    "3",
  ]);
  expect(cells(timed, "gridcell").map((cell) => cell.getAttribute("data-date"))).toEqual([
    "2026-10-08",
    "2026-10-08",
  ]);
});

test("groups child resources under a band named for their parent, and collapses them", async () => {
  const container = await renderResources(
    [
      { data: null, id: "rooms", title: "Rooms" },
      { data: null, id: "aurora", parentId: "rooms", title: "Aurora" },
      { data: null, id: "borealis", parentId: "rooms", title: "Borealis" },
      { data: null, id: "ada", title: "Ada" },
    ],
    { expanded: ["rooms"] },
  );
  const headerCells = () => [...rows(container)[0]!.querySelectorAll('[role="columnheader"]')];
  const toggle = headerCells()[1]?.querySelector("button");

  expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  expect(ariaLabel(toggle)).toBe("Collapse Rooms");
  expect(headerCells().slice(1).map(text)).toEqual([
    "Rooms",
    "Aurora, Rooms",
    "Borealis, Rooms",
    "Ada",
  ]);

  await click(toggle!);

  expect(renderedResources(container)).toEqual(["rooms", "ada"]);
  expect(ariaLabel(headerCells()[1]?.querySelector("button"))).toBe("Expand Rooms");
});

test("an Unassigned column holds events without resources", async () => {
  const container = await renderResources(people(1), {
    events: [shift("lunch", [], "2026-10-08T16:00Z", "2026-10-08T17:00Z")],
    unassigned: "bucket",
  });

  expect(headers(container)).toEqual(["Person 1", "Unassigned"]);
  expect(
    container.querySelector('[data-event-id="lunch"]')?.closest("[data-resource-id]"),
  ).toHaveProperty("dataset.resourceId", "");
});

test("dragging an event to another resource's column swaps that resource in", async () => {
  const onEventChange = vi.fn<(change: Change) => void>();
  const container = await renderResources(people(3), {
    events: [shift("standup", ["p1", "x"], "2026-10-08T13:00Z", "2026-10-08T14:00Z")],
    onEventChange,
  });

  // 100px columns, 100px an hour, from y = 0 at midnight.
  const event = container.querySelector('[data-event-id="standup"]')!;
  const columns = [...body(container).querySelectorAll("[data-date]")];
  const hour = (hours: number) => hours * 100;
  layOut([
    [event, { height: 100, width: 100, x: 0, y: hour(9) }],
    ...columns.map(
      (column, index) => [column, { height: 2400, width: 100, x: index * 100, y: 0 }] as const,
    ),
  ]);

  drag(event, [
    [50, hour(9.5)],
    [150, hour(9.5)],
    [250, hour(10.5)],
  ]);

  expect(onEventChange).toHaveBeenCalledOnce();
  const change = onEventChange.mock.calls[0]![0];
  expect(change.cause).toBe("move");
  expect(change.proposed?.resourceIds).toEqual(["p3", "x"]);
  expect(change.proposed?.start.toString()).toBe("2026-10-08T14:00:00Z");
});

test("a focused event keeps its column and DOM focus while it is scrolled out of view", async () => {
  const container = await renderResources(people(200), {
    events: [shift("standup", ["p1"], "2026-10-08T13:00Z", "2026-10-08T13:30Z")],
  });
  const standup = () => container.querySelector<HTMLElement>('[data-event-id="standup"]');
  const element = standup();

  await act(async () => element!.focus());
  await scrollTo(body(container), 100 * 128);

  // p1 renders beside the columns in view, so focus never falls back to the page.
  expect(renderedResources(container)).toEqual([
    "p1",
    ...Array.from({ length: 12 }, (_, index) => `p${99 + index}`),
  ]);
  expect(standup()).toBe(element);
  expect(document.activeElement).toBe(element);
});

/** jsdom has no layout: give the body a visible width and record where it is scrolled to. */
function scrollable(element: HTMLElement, width: number): number[] {
  let left = 0;
  const writes: number[] = [];
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width },
    scrollLeft: {
      configurable: true,
      get: () => left,
      set: (value: number) => {
        left = value;
        writes.push(value);
      },
    },
  });
  return writes;
}

const slot = (resourceId: string, date = "2026-10-08"): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  kind: "slot",
  resourceId,
  time: Temporal.PlainTime.from("09:00"),
});

test.each(["ltr", "rtl"] as const)(
  "focus on a resource out of view scrolls its column in (%s)",
  async (direction) => {
    const result = await render(calendar(people(200), { direction, focus: slot("p2") }));
    cleanup = result.unmount;
    const writes = scrollable(body(result.container), 960);

    await result.rerender(calendar(people(200), { direction, focus: slot("p150") }));

    // Just far enough to show p150, which spans 149 × 128 to 150 × 128; RTL scrolls negative.
    expect(writes).toEqual([(direction === "rtl" ? -1 : 1) * (150 * 128 - 960)]);
  },
);

test("focus on another day of a resource wider than the view scrolls to that day", async () => {
  const week = (focus: CalendarFocus | null) => (
    <ResourceWeekCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="America/New_York"
      defaultView="resources"
      events={[]}
      focus={focus}
      locale="en-US"
      resources={people(1)}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <ResourceWeekCalendar.ActiveView />
    </ResourceWeekCalendar.Root>
  );
  const result = await render(week(null));
  cleanup = result.unmount;
  // The resource's seven days take 960px; only 400px show.
  const writes = scrollable(body(result.container), 400);

  await result.rerender(week(slot("p1", "2026-10-14")));
  await result.rerender(
    week({ date: Temporal.PlainDate.from("2026-10-08"), kind: "day", resourceId: "p1" }),
  );
  // Moving within the view's own range scrolls nothing more.
  await result.rerender(week(slot("p1", "2026-10-09")));

  expect(writes).toHaveLength(2);
  expect(writes[0]).toBeCloseTo(960 - 400);
  expect(writes[1]).toBe(0);
});
