// @vitest-environment jsdom

import {
  defineEventAdapter,
  type EventId,
  type NormalizedCalendarEvent,
  type ResourceId,
} from "@moltenship/calendar-core";
import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";
import { Activity, act, useState } from "react";
import { afterEach, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  type CalendarViewActions,
  type CalendarVisibleRange,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { createTestCounter } from "./harness/counters";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

interface Shift {
  readonly color: "blue" | "green";
  readonly end: Temporal.Instant;
  readonly id: `shift-${number}`;
  readonly start: Temporal.Instant;
  readonly title: string;
}

type EventColor = "blue" | "green" | "neutral";

const shifts: readonly Shift[] = Object.freeze([
  {
    color: "green",
    end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: "shift-1",
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: "Morning",
  },
  {
    color: "blue",
    end: Temporal.Instant.from("2026-08-17T10:00:00Z"),
    id: "shift-2",
    start: Temporal.Instant.from("2026-08-17T09:00:00Z"),
    title: "Monday",
  },
]);

const projections = createTestCounter();
let rendererActions: CalendarViewActions | undefined;

// A complete custom view: range, navigation, title, projection, and renderer.
const daysView = defineCalendarView({
  defaultOptions: {
    days: 2,
    getEventColor: (_event: NormalizedCalendarEvent<unknown, EventId, ResourceId>): EventColor =>
      "neutral",
  },
  name: "days",
  strategy: {
    getRange: (anchor, _environment, { days }) => plainDateInterval(anchor, anchor.add({ days })),
    getTitle: (range, { locale }) =>
      range.start.toLocaleString(locale, { day: "numeric", month: "long" }),
    navigate: (anchor, delta, { days }) => anchor.add({ days: delta * days }),
    project({ instantRange, snapshot }) {
      projections.increment();
      return snapshot.queryTimed(instantRange);
    },
  },
  Renderer({ actions, options, projection, range }) {
    rendererActions = actions;
    return (
      <ol data-range={`${range.start.toString()}/${range.end.toString()}`}>
        {projection.map((event) => (
          <li data-color={options.getEventColor(event)} key={event.id}>
            {event.title}
          </li>
        ))}
      </ol>
    );
  },
});

const summaryView = defineCalendarView({
  name: "summary",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: ({ snapshot, today }) => ({ today, total: snapshot.size }),
  },
  Renderer: ({ projection }) => <output data-summary>{projection.total}</output>,
});

let loadedRange: PlainDateInterval | undefined;

// Shows two days from the anchor and projects two more on each side, as a scrolling view does.
const bufferedView = defineCalendarView({
  name: "buffered",
  strategy: {
    getLoadRange: (anchor) =>
      plainDateInterval(anchor.subtract({ days: 2 }), anchor.add({ days: 4 })),
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 2 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: 2 * delta }),
    project: ({ loadRange, snapshot }) => {
      loadedRange = loadRange;
      return snapshot.size;
    },
  },
  Renderer: ({ loadRange, range }) => (
    <output
      data-load-range={`${loadRange?.start.toString()}/${loadRange?.end.toString()}`}
      data-range={`${range.start.toString()}/${range.end.toString()}`}
    />
  ),
});

const ShiftCalendar = createCalendar<Shift>()({
  eventAdapter: defineEventAdapter<Shift>()({
    getId: (shift) => shift.id,
    getInterval: (shift) => ({ end: shift.end, kind: "timed", start: shift.start }),
    getResourceIds: () => [],
    getTitle: (shift) => shift.title,
  }),
  views: [daysView, summaryView, bufferedView],
});

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  projections.reset();
  rendererActions = undefined;
  loadedRange = undefined;
  vi.restoreAllMocks();
});

async function render(
  element: React.ReactNode,
  options?: { readonly strictMode?: boolean },
): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element, options);
  harnesses.push(harness);
  return harness;
}

async function click(container: ParentNode, selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`missing-test-button:${selector}`);
  await act(async () => button.click());
}

test("the active view renders its projection for the visible range", async () => {
  const harness = await render(
    <ShiftCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="UTC"
      events={shifts}
      locale="en-GB"
      weekRules={gateWeekRules}
    >
      <ShiftCalendar.Title />
      <ShiftCalendar.NextTrigger>Next</ShiftCalendar.NextTrigger>
      <ShiftCalendar.ActiveView />
    </ShiftCalendar.Root>,
  );

  expect(harness.container.querySelector("[data-range]")?.getAttribute("data-range")).toBe(
    "2026-08-15/2026-08-17",
  );
  expect(harness.container.querySelector("li")?.textContent).toBe("Morning");
  expect(harness.container.querySelector('[data-calendar-part="title"]')?.textContent).toBe(
    "15 August",
  );

  await click(harness.container, '[data-calendar-part="next-trigger"]');

  expect(harness.container.querySelector("li")?.textContent).toBe("Monday");
  expect(harness.container.querySelector('[data-calendar-part="title"]')?.textContent).toBe(
    "17 August",
  );
});

test("projection reruns only when its inputs change", async () => {
  function Application() {
    const [revision, setRevision] = useState(0);
    return (
      <ShiftCalendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
        defaultTimeZone="UTC"
        events={shifts}
        locale="en-GB"
        weekRules={gateWeekRules}
      >
        <ShiftCalendar.ActiveView />
        <button data-rerender onClick={() => setRevision(revision + 1)}>
          {revision}
        </button>
      </ShiftCalendar.Root>
    );
  }

  const harness = await render(<Application />);
  const initialActions = rendererActions;
  projections.reset();

  await click(harness.container, "[data-rerender]");
  await act(async () => rendererActions?.setAnchorDate(Temporal.PlainDate.from("2026-08-15")));
  expect(projections.value).toBe(0);
  expect(rendererActions).toBe(initialActions);

  await act(async () => rendererActions?.navigateNext());
  expect(projections.value).toBe(1);
});

test("root view options override a view's defaults", async () => {
  const harness = await render(
    <ShiftCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="UTC"
      events={shifts}
      locale="en-GB"
      viewOptions={{
        days: {
          days: 3,
          getEventColor: (event) =>
            shifts.find((shift) => shift.id === event.id)?.color ?? "neutral",
        },
      }}
      weekRules={gateWeekRules}
    >
      <ShiftCalendar.ActiveView />
    </ShiftCalendar.Root>,
  );

  expect([...harness.container.querySelectorAll("li")].map((item) => item.dataset.color)).toEqual([
    "green",
    "blue",
  ]);
});

test("hooks expose the visible range and a projection discriminated by view", async () => {
  const observed: { range?: PlainDateInterval | null; summary?: number } = {};

  function Probe() {
    observed.range = ShiftCalendar.useVisibleRange();
    const active = ShiftCalendar.useViewProjection();
    if (active?.view === "summary") {
      expectTypeOf(active.projection.today).toEqualTypeOf<Temporal.PlainDate | null>();
      observed.summary = active.projection.total;
    }
    if (active?.view === "days") {
      expectTypeOf(active.options.days).toEqualTypeOf<number>();
    }
    return null;
  }

  await render(
    <ShiftCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="UTC"
      defaultView="summary"
      events={shifts}
      locale="en-GB"
      now={Temporal.Instant.from("2026-08-15T08:30:00Z")}
      weekRules={gateWeekRules}
    >
      <Probe />
    </ShiftCalendar.Root>,
  );

  expect(observed.summary).toBe(2);
  expect(observed.range?.start.toString()).toBe("2026-08-15");
  expect(observed.range?.end.toString()).toBe("2026-08-16");
  expectTypeOf<ReturnType<typeof ShiftCalendar.useCalendarState>["view"]>().toEqualTypeOf<
    "buffered" | "days" | "summary"
  >();
});

test("a skipped local midnight starts the visible instants at the first valid instant", async () => {
  let instantStart: string | undefined;

  function Probe() {
    instantStart = ShiftCalendar.useViewProjection()?.instantRange.start.toString();
    return null;
  }

  await render(
    <ShiftCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2018-11-04")}
      defaultTimeZone="America/Sao_Paulo"
      defaultView="summary"
      events={shifts}
      locale="pt-BR"
      weekRules={gateWeekRules}
    >
      <Probe />
    </ShiftCalendar.Root>,
  );

  expect(instantStart).toBe("2018-11-04T03:00:00Z");
});

test("a view's load range is projected and reported with its visible range", async () => {
  const ranges = vi.fn<(range: CalendarVisibleRange<"buffered" | "days" | "summary">) => void>();
  function Application({ events }: { readonly events: readonly Shift[] }) {
    return (
      <ShiftCalendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
        defaultView="buffered"
        events={events}
        locale="en-GB"
        onVisibleRangeChange={ranges}
        timeZone="Asia/Tbilisi"
        weekRules={gateWeekRules}
      >
        <ShiftCalendar.NextTrigger>Next</ShiftCalendar.NextTrigger>
        <ShiftCalendar.ActiveView />
      </ShiftCalendar.Root>
    );
  }

  const harness = await render(<Application events={shifts} />);
  const output = harness.container.querySelector("output");

  expect(output?.getAttribute("data-range")).toBe("2026-08-15/2026-08-17");
  expect(output?.getAttribute("data-load-range")).toBe("2026-08-13/2026-08-19");
  expect(loadedRange?.start.toString()).toBe("2026-08-13");
  expect(ranges).toHaveBeenCalledOnce();
  const [first] = ranges.mock.calls[0]!;
  expect(first.view).toBe("buffered");
  expect(first.range.start.toString()).toBe("2026-08-15");
  expect(first.loadRange.end.toString()).toBe("2026-08-19");
  // Tbilisi is four hours ahead of UTC.
  expect(first.instantRange.start.toString()).toBe("2026-08-14T20:00:00Z");
  expect(first.loadInstantRange.start.toString()).toBe("2026-08-12T20:00:00Z");

  // New events don't change what the view shows, so nothing is reported.
  await harness.render(<Application events={shifts.slice(1)} />);
  expect(ranges).toHaveBeenCalledOnce();

  await click(harness.container, '[data-calendar-part="next-trigger"]');
  expect(ranges).toHaveBeenCalledTimes(2);
  expect(ranges.mock.calls[1]![0].loadRange.start.toString()).toBe("2026-08-15");
});

test("a view without a load range projects only its visible dates", async () => {
  const ranges = vi.fn<(range: CalendarVisibleRange) => void>();
  const harness = await render(
    <ShiftCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultView="summary"
      defaultTimeZone="UTC"
      events={shifts}
      locale="en-GB"
      onVisibleRangeChange={ranges}
      weekRules={gateWeekRules}
    >
      <ShiftCalendar.ActiveView />
    </ShiftCalendar.Root>,
  );

  expect(harness.container.querySelector("[data-summary]")).not.toBeNull();
  const [{ loadRange, range }] = ranges.mock.calls[0]!;
  expect(loadRange).toBe(range);
});

test("each range is reported once, under Strict Mode and across a hidden Activity", async () => {
  const ranges = vi.fn<(range: CalendarVisibleRange) => void>();
  function Application({ mode }: { readonly mode: "hidden" | "visible" }) {
    return (
      <Activity mode={mode}>
        <ShiftCalendar.Root
          defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
          defaultView="days"
          defaultTimeZone="UTC"
          events={shifts}
          locale="en-GB"
          onVisibleRangeChange={ranges}
          weekRules={gateWeekRules}
        >
          <ShiftCalendar.NextTrigger>Next</ShiftCalendar.NextTrigger>
          <ShiftCalendar.ActiveView />
        </ShiftCalendar.Root>
      </Activity>
    );
  }

  // Strict Mode runs effects twice when they mount; the range only showed once.
  const harness = await render(<Application mode="visible" />, { strictMode: true });
  expect(ranges).toHaveBeenCalledOnce();

  // Hiding and revealing the calendar shows the same dates again, so nothing new is reported.
  await harness.render(<Application mode="hidden" />);
  await harness.render(<Application mode="visible" />);
  expect(ranges).toHaveBeenCalledOnce();

  await click(harness.container, '[data-calendar-part="next-trigger"]');
  expect(ranges).toHaveBeenCalledTimes(2);
  expect(ranges.mock.calls[1]![0].range.start.toString()).toBe("2026-08-17");
});
