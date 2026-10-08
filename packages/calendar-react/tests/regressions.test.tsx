// @vitest-environment jsdom

import { defineEventAdapter } from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { Activity, act, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createCalendar,
  createCalendarStore,
  defineCalendarView,
  useNow,
  type CalendarDiagnostic,
} from "@moltenship/calendar-react";

import {
  buildGateEvent,
  createTestCalendarClock,
  gateAnchorDate,
  gateEvents,
  gateTimeZone,
  gateWeekRules,
  type GateEvent,
  type GateFocus,
  type GateSelection,
} from "./harness/builders";
import { GateCalendar, gateProjections, type GateView } from "./harness/custom-view-fixture";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

const harnesses: ReactRootHarness[] = [];

async function render(element: ReactNode): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

async function click(container: ParentNode, selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`missing-test-button:${selector}`);
  await act(async () => button.click());
}

function NavigateTwice() {
  const actions = GateCalendar.useCalendarActions();
  return (
    <button
      data-navigate-twice
      onClick={() => {
        actions.navigateNext();
        actions.navigateNext();
      }}
    >
      {GateCalendar.useCalendarState().anchorDate.toString()}
    </button>
  );
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("render stability", () => {
  test("inline events with onDiagnosticsChange={setState} settle without a render loop", async () => {
    const rows = [
      { end: "2026-08-15T10:00:00Z", id: 1, start: "2026-08-15T09:00:00Z" },
      { end: "2026-08-15T09:00:00Z", id: 2, start: "2026-08-15T10:00:00Z" },
    ] as const;
    let parentRenders = 0;

    function Application() {
      parentRenders += 1;
      if (parentRenders > 20) throw new Error("render-loop");
      const [diagnostics, setDiagnostics] = useState<
        readonly CalendarDiagnostic<GateEvent, string>[]
      >([]);
      return (
        <GateCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={rows.map((row) =>
            buildGateEvent({
              end: Temporal.Instant.from(row.end),
              id: `event-${row.id}`,
              start: Temporal.Instant.from(row.start),
            }),
          )}
          locale="en-GB"
          onDiagnosticsChange={setDiagnostics}
          weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
        >
          <output data-diagnostics>{diagnostics.map(({ code }) => code).join(",")}</output>
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);

    expect(harness.container.querySelector("[data-diagnostics]")?.textContent).toBe(
      "invalid-event",
    );
    expect(parentRenders).toBeLessThanOrEqual(3);
  });

  test("an inline copy of unchanged events reuses the snapshot and projection", async () => {
    const snapshots = new Set<unknown>();

    function Probe() {
      snapshots.add(GateCalendar.useCalendarMeta().eventSnapshot);
      return null;
    }

    function Application() {
      const [revision, setRevision] = useState(0);
      return (
        <GateCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={[...gateEvents]}
          locale="en-GB"
          weekRules={gateWeekRules}
        >
          <Probe />
          <button data-rerender onClick={() => setRevision(revision + 1)}>
            {revision}
          </button>
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    const projectionsBefore = gateProjections.value;
    await click(harness.container, "[data-rerender]");
    await click(harness.container, "[data-rerender]");

    expect(snapshots.size).toBe(1);
    expect(gateProjections.value).toBe(projectionsBefore);
  });

  test("default resources and inline weekRules, now, and locale keep meta stable", async () => {
    const metas = new Set<unknown>();

    function Probe() {
      metas.add(GateCalendar.useCalendarMeta());
      return null;
    }

    function Application() {
      const [revision, setRevision] = useState(0);
      return (
        <GateCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          locale={new Intl.Locale("en-GB")}
          now={Temporal.Instant.from("2026-08-15T08:30:00Z")}
          weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
        >
          <Probe />
          <button data-rerender onClick={() => setRevision(revision + 1)}>
            {revision}
          </button>
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    await click(harness.container, "[data-rerender]");
    await click(harness.container, "[data-rerender]");

    expect(metas.size).toBe(1);
  });

  test("a controlled anchorDate recreated in render keeps state identity", async () => {
    const states = new Set<unknown>();

    function Probe() {
      states.add(GateCalendar.useCalendarState());
      return null;
    }

    function Application() {
      const [revision, setRevision] = useState(0);
      return (
        <GateCalendar.Root
          anchorDate={Temporal.PlainDate.from("2026-08-15")}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          expandedResourceIds={["resource-1"]}
          locale="en-GB"
          weekRules={gateWeekRules}
        >
          <Probe />
          <button data-rerender onClick={() => setRevision(revision + 1)}>
            {revision}
          </button>
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    await click(harness.container, "[data-rerender]");
    await click(harness.container, "[data-rerender]");

    expect(states.size).toBe(1);
  });

  test("an inline selector subscribes once across parent renders", async () => {
    const store = createCalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>({
      defaultAnchorDate: gateAnchorDate,
      defaultTimeZone: gateTimeZone,
      defaultView: "month",
    });
    const subscribe = vi.spyOn(store, "subscribe");

    function ViewProbe() {
      return <output data-view>{GateCalendar.useCalendarSelector((state) => state.view)}</output>;
    }

    function Application() {
      const [revision, setRevision] = useState(0);
      return (
        <GateCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          locale="en-GB"
          store={store}
          weekRules={gateWeekRules}
        >
          <ViewProbe />
          <button data-rerender onClick={() => setRevision(revision + 1)}>
            {revision}
          </button>
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    const subscriptionsAfterMount = subscribe.mock.calls.length;
    await click(harness.container, "[data-rerender]");
    await click(harness.container, "[data-rerender]");
    await act(async () => store.actions.setView("agenda"));

    expect(subscribe.mock.calls.length).toBe(subscriptionsAfterMount);
    expect(harness.container.querySelector("[data-view]")?.textContent).toBe("agenda");
  });
});

describe("commands", () => {
  test("store actions honor a root's controlled view and change handler", async () => {
    const store = createCalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>({
      defaultAnchorDate: gateAnchorDate,
      defaultTimeZone: gateTimeZone,
      defaultView: "month",
    });
    const onViewChange = vi.fn();

    function Application() {
      const [view, setView] = useState<GateView>("month");
      return (
        <GateCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          locale="en-GB"
          onViewChange={(next, detail) => {
            onViewChange(next, detail);
            setView(next);
          }}
          store={store}
          view={view}
          weekRules={gateWeekRules}
        >
          <GateCalendar.ActiveView />
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    await act(async () => store.actions.setView("agenda"));

    expect(onViewChange).toHaveBeenCalledExactlyOnceWith("agenda", {
      controlled: true,
      previous: "month",
      slice: "view",
    });
    expect(store.getSnapshot().view).toBe("month");
    expect(
      harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view"),
    ).toBe("agenda");
  });

  test.each(["uncontrolled", "controlled"] as const)(
    "two navigations in one %s handler both apply",
    async (mode) => {
      function Application() {
        const [anchorDate, setAnchorDate] = useState(gateAnchorDate);
        const anchorProps =
          mode === "controlled"
            ? { anchorDate, onAnchorDateChange: setAnchorDate }
            : { defaultAnchorDate: gateAnchorDate };
        return (
          <GateCalendar.Root
            {...anchorProps}
            defaultTimeZone={gateTimeZone}
            events={gateEvents}
            locale="en-GB"
            weekRules={gateWeekRules}
          >
            <NavigateTwice />
          </GateCalendar.Root>
        );
      }

      const harness = await render(<Application />);
      await click(harness.container, "[data-navigate-twice]");

      expect(harness.container.querySelector("[data-navigate-twice]")?.textContent).toBe(
        "2026-08-29",
      );
    },
  );

  test("Today works with the system clock when neither now nor clock is passed", async () => {
    const harness = await render(
      <GateCalendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2001-01-01")}
        defaultTimeZone={gateTimeZone}
        events={gateEvents}
        locale="en-GB"
        weekRules={gateWeekRules}
      >
        <GateCalendar.ActiveView />
        <GateCalendar.TodayTrigger>Today</GateCalendar.TodayTrigger>
      </GateCalendar.Root>,
    );
    const today = harness.container.querySelector<HTMLButtonElement>(
      '[data-calendar-part="today-trigger"]',
    );

    expect(today?.disabled).toBe(false);
    await click(harness.container, '[data-calendar-part="today-trigger"]');
    expect(
      harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-anchor"),
    ).toBe(Temporal.Now.plainDateISO(gateTimeZone).toString());
  });
});

describe("ownership", () => {
  test("a factory's hooks and parts resolve its own root inside another factory's root", async () => {
    const otherView = defineCalendarView({
      name: "other",
      strategy: {
        getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
        getTitle: () => "Other",
        navigate: (anchor, delta) => anchor.add({ days: delta }),
        project: () => null,
      },
      Renderer: () => null,
    });
    const OtherCalendar = createCalendar<{ readonly id: string }>()({
      eventAdapter: defineEventAdapter<{ readonly id: string }>()({
        getId: (event) => event.id,
        getInterval: () => ({
          end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
          kind: "timed",
          start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
        }),
        getResourceIds: () => [],
        getTitle: (event) => event.id,
      }),
      views: [otherView],
    });

    function Probe() {
      const gate = GateCalendar.useCalendarState();
      const other = OtherCalendar.useCalendarState();
      return (
        <output data-views>
          {gate.view}:{gate.anchorDate.toString()}/{other.view}:{other.anchorDate.toString()}
        </output>
      );
    }

    const harness = await render(
      <GateCalendar.Root
        defaultAnchorDate={gateAnchorDate}
        defaultTimeZone={gateTimeZone}
        events={gateEvents}
        locale="en-GB"
        weekRules={gateWeekRules}
      >
        <OtherCalendar.Root
          defaultAnchorDate={gateAnchorDate}
          defaultTimeZone={gateTimeZone}
          events={[]}
          locale="en-GB"
          weekRules={gateWeekRules}
        >
          <Probe />
          <GateCalendar.NextTrigger>Next</GateCalendar.NextTrigger>
        </OtherCalendar.Root>
      </GateCalendar.Root>,
    );

    expect(harness.container.querySelector("[data-views]")?.textContent).toBe(
      "month:2026-08-15/other:2026-08-15",
    );
    await click(harness.container, '[data-calendar-part="next-trigger"]');
    expect(harness.container.querySelector("[data-views]")?.textContent).toBe(
      "month:2026-08-22/other:2026-08-15",
    );
  });

  test("roots sharing a store keep their own controlled handlers, even after one unmounts", async () => {
    const store = createCalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>({
      defaultAnchorDate: gateAnchorDate,
      defaultTimeZone: gateTimeZone,
      defaultView: "month",
    });
    const handlers = { first: vi.fn(), second: vi.fn() };

    function ControlledRoot({ label }: { readonly label: keyof typeof handlers }) {
      const [anchorDate, setAnchorDate] = useState(gateAnchorDate);
      return (
        <GateCalendar.Root
          anchorDate={anchorDate}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          locale="en-GB"
          onAnchorDateChange={(next) => {
            handlers[label](next.toString());
            setAnchorDate(next);
          }}
          store={store}
          weekRules={gateWeekRules}
        >
          <GateCalendar.NextTrigger>Next</GateCalendar.NextTrigger>
        </GateCalendar.Root>
      );
    }

    const first = await render(<ControlledRoot label="first" />);
    const second = await render(<ControlledRoot label="second" />);
    await click(first.container, '[data-calendar-part="next-trigger"]');
    await second.unmount();
    await click(first.container, '[data-calendar-part="next-trigger"]');

    expect(handlers.first.mock.calls).toEqual([["2026-08-22"], ["2026-08-29"]]);
    expect(handlers.second).not.toHaveBeenCalled();
    expect(store.getSnapshot().anchorDate.toString()).toBe("2026-08-15");
  });

  test("a command after a synchronous owner correction starts from the committed value", async () => {
    const requested: string[] = [];

    function Application() {
      const [anchorDate, setAnchorDate] = useState(gateAnchorDate);
      return (
        <GateCalendar.Root
          anchorDate={anchorDate}
          defaultTimeZone={gateTimeZone}
          events={gateEvents}
          locale="en-GB"
          onAnchorDateChange={(next) => {
            requested.push(next.toString());
            const corrected = requested.length === 1 ? next.add({ days: 7 }) : next;
            flushSync(() => setAnchorDate(corrected));
          }}
          weekRules={gateWeekRules}
        >
          <NavigateTwice />
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    await click(harness.container, "[data-navigate-twice]");

    expect(requested).toEqual(["2026-08-22", "2026-09-05"]);
    expect(harness.container.querySelector("[data-navigate-twice]")?.textContent).toBe(
      "2026-09-05",
    );
  });

  test("an unrelated synchronous commit keeps an uncommitted controlled request", async () => {
    const store = createCalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>({
      defaultAnchorDate: gateAnchorDate,
      defaultTimeZone: gateTimeZone,
      defaultView: "month",
    });
    const requested: string[] = [];

    function Application() {
      const [anchorDate, setAnchorDate] = useState(gateAnchorDate);
      return (
        <GateCalendar.Root
          anchorDate={anchorDate}
          events={gateEvents}
          locale="en-GB"
          onAnchorDateChange={(next) => {
            requested.push(next.toString());
            flushSync(() => store.actions.setSelection({ eventId: "event-1" }));
            setAnchorDate(next);
          }}
          store={store}
          timeZone={gateTimeZone}
          weekRules={gateWeekRules}
        >
          <NavigateTwice />
        </GateCalendar.Root>
      );
    }

    const harness = await render(<Application />);
    await click(harness.container, "[data-navigate-twice]");

    expect(requested).toEqual(["2026-08-22", "2026-08-29"]);
    expect(harness.container.querySelector("[data-navigate-twice]")?.textContent).toBe(
      "2026-08-29",
    );
  });

  test("useNow resamples the clock when a hidden Activity is revealed", async () => {
    const clock = createTestCalendarClock(Temporal.Instant.from("2026-08-15T08:30:00Z"));

    function NowProbe() {
      return <time data-now>{useNow()?.toString()}</time>;
    }

    function Application({ mode }: { readonly mode: "hidden" | "visible" }) {
      return (
        <Activity mode={mode}>
          <GateCalendar.Root
            clock={clock}
            defaultAnchorDate={gateAnchorDate}
            defaultTimeZone={gateTimeZone}
            events={gateEvents}
            locale="en-GB"
            weekRules={gateWeekRules}
          >
            <NowProbe />
          </GateCalendar.Root>
        </Activity>
      );
    }

    const harness = await render(<Application mode="visible" />);
    await harness.render(<Application mode="hidden" />);
    clock.set(Temporal.Instant.from("2026-08-16T08:30:00Z"));
    await harness.render(<Application mode="visible" />);

    expect(harness.container.querySelector("[data-now]")?.textContent).toBe("2026-08-16T08:30:00Z");
  });
});
