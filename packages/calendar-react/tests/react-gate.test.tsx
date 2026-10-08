// @vitest-environment jsdom

import {
  Profiler,
  Suspense,
  act,
  startTransition,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { createCalendarStore, type CalendarStore } from "@moltenship/calendar-react";

import {
  createTestCalendarClock,
  gateAnchorDate,
  gateEvents,
  gateResources,
  gateTimeZone,
  gateWeekRules,
  type GateFocus,
  type GateSelection,
} from "./harness/builders";
import { createCommitCounter, createSelectorCounter, createTestCounter } from "./harness/counters";
import { GateCalendar, type GateView } from "./harness/custom-view-fixture";
import {
  createSuspensionGate,
  hydrateWithHarness,
  renderWithHarness,
  type ReactRootHarness,
} from "./harness/render-harness";
import { controlledStateMatrix, type ControlledStateMatrixCase } from "./harness/state-matrix";
import "./setup";

type GateStore = CalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>;
type GateState = ReturnType<GateStore["getSnapshot"]>;

const harnesses: ReactRootHarness[] = [];

function makeStore(): GateStore {
  return createCalendarStore<GateView, GateSelection, GateFocus, `resource-${number}`>({
    defaultAnchorDate: gateAnchorDate,
    defaultTimeZone: gateTimeZone,
    defaultView: "month",
  });
}

function track<THarness extends ReactRootHarness>(harness: THarness): THarness {
  harnesses.push(harness);
  return harness;
}

async function click(container: ParentNode, selector: string): Promise<void> {
  const button = container.querySelector<HTMLButtonElement>(selector);
  if (button === null) throw new Error(`missing-test-button:${selector}`);
  await act(async () => button.click());
}

function GateRoot(
  props: Partial<ComponentProps<typeof GateCalendar.Root>> & { readonly children?: ReactNode },
) {
  return (
    <GateCalendar.Root
      defaultAnchorDate={gateAnchorDate}
      defaultTimeZone={gateTimeZone}
      events={gateEvents}
      locale="en-GB"
      resources={gateResources}
      weekRules={gateWeekRules}
      {...props}
    />
  );
}

function ControlledStateProbe({
  renderHistory,
  scenario,
}: {
  readonly renderHistory: string[];
  readonly scenario: ControlledStateMatrixCase;
}) {
  const [controlled, setControlled] = useState(scenario.controlled);

  function Probe() {
    const actions = GateCalendar.useCalendarActions();
    const value = scenario.read(GateCalendar.useCalendarState());
    renderHistory.push(value);
    return (
      <button data-state-action={scenario.name} onClick={() => scenario.apply(actions)}>
        {value}
      </button>
    );
  }

  return (
    <GateRoot {...controlled} {...scenario.createHandlers(setControlled)}>
      <Probe />
    </GateRoot>
  );
}

function GateViewTrigger({ target }: { readonly target: GateView }) {
  const actions = GateCalendar.useCalendarActions();
  return (
    <button data-gate-view-trigger onClick={() => actions.setView(target)}>
      {target}
    </button>
  );
}

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("controlled state regression matrix", () => {
  for (const scenario of controlledStateMatrix) {
    test(`${scenario.name} is current in every Strict Mode render after its action`, async () => {
      const renderHistory: string[] = [];
      const harness = track(
        await renderWithHarness(
          <ControlledStateProbe renderHistory={renderHistory} scenario={scenario} />,
          { strictMode: true },
        ),
      );
      const renderCountBeforeAction = renderHistory.length;

      expect(harness.container.querySelector("button")?.textContent).toBe(scenario.initial);
      await click(harness.container, `[data-state-action="${scenario.name}"]`);

      expect(harness.container.querySelector("button")?.textContent).toBe(scenario.next);
      expect(renderHistory.slice(renderCountBeforeAction)).not.toContain(scenario.initial);
      expect(renderHistory.slice(renderCountBeforeAction)).toContain(scenario.next);
      expect(harness.recoverableErrors).toEqual([]);
    });
  }
});

test("a suspended controlled transition rebases around an urgent update without stale state", async () => {
  interface ConcurrentRender {
    readonly calendarView: GateView;
    readonly controlledView: GateView;
    readonly urgentRevision: number;
  }

  const renderHistory: ConcurrentRender[] = [];
  const commits = createCommitCounter();
  const suspension = createSuspensionGate();

  function ConcurrentProbe({
    controlledView,
    urgentRevision,
  }: {
    readonly controlledView: GateView;
    readonly urgentRevision: number;
  }) {
    const calendar = GateCalendar.useCalendar();
    renderHistory.push({ calendarView: calendar.state.view, controlledView, urgentRevision });
    if (calendar.state.view === "agenda") suspension.read();

    return (
      <div>
        <output data-concurrent-view>
          {calendar.state.view}:{urgentRevision}
        </output>
        <button data-transition onClick={() => calendar.actions.setView("agenda")}>
          Start transition
        </button>
      </div>
    );
  }

  function ConcurrentHarness() {
    const [view, setView] = useState<GateView>("month");
    const [urgentRevision, setUrgentRevision] = useState(0);

    return (
      <>
        <button data-urgent onClick={() => setUrgentRevision((revision) => revision + 1)}>
          Urgent update
        </button>
        <Suspense fallback={<output data-concurrent-fallback>fallback</output>}>
          <GateRoot onViewChange={(next) => startTransition(() => setView(next))} view={view}>
            <ConcurrentProbe controlledView={view} urgentRevision={urgentRevision} />
          </GateRoot>
        </Suspense>
      </>
    );
  }

  const harness = track(
    await renderWithHarness(
      <Profiler id="concurrent-controlled" onRender={commits.onRender}>
        <ConcurrentHarness />
      </Profiler>,
      { strictMode: true },
    ),
  );
  const rendersBeforeAction = renderHistory.length;
  commits.counter.reset();

  await click(harness.container, "[data-transition]");

  expect(suspension.pending).toBe(true);
  expect(harness.container.querySelector("[data-concurrent-view]")?.textContent).toBe("month:0");
  expect(harness.container.querySelector("[data-concurrent-fallback]")).toBeNull();
  expect(renderHistory.slice(rendersBeforeAction)).toContainEqual({
    calendarView: "agenda",
    controlledView: "agenda",
    urgentRevision: 0,
  });

  await click(harness.container, "[data-urgent]");

  expect(harness.container.querySelector("[data-concurrent-view]")?.textContent).toBe("month:1");
  expect(harness.container.querySelector("[data-concurrent-fallback]")).toBeNull();

  await act(async () => {
    suspension.release();
    await Promise.resolve();
  });

  expect(harness.container.querySelector("[data-concurrent-view]")?.textContent).toBe("agenda:1");
  expect(
    renderHistory
      .slice(rendersBeforeAction)
      .every(({ calendarView, controlledView }) => calendarView === controlledView),
  ).toBe(true);
  expect(commits.counter.value).toBeGreaterThanOrEqual(2);
  expect(harness.recoverableErrors).toEqual([]);
});

test("selector evaluation does not turn unrelated state changes into React commits", async () => {
  const store = makeStore();
  const viewSelector = createSelectorCounter<GateState, GateView>((state) => state.view);
  const anchorSelector = createSelectorCounter<GateState, Temporal.PlainDate>(
    (state) => state.anchorDate,
  );
  const viewCommits = createCommitCounter();
  const anchorCommits = createCommitCounter();

  function ViewProbe() {
    return (
      <output data-view-selector>{GateCalendar.useCalendarSelector(viewSelector.select)}</output>
    );
  }

  function AnchorProbe() {
    const anchor = GateCalendar.useCalendarSelector(anchorSelector.select);
    return <output data-anchor-selector>{anchor.toString()}</output>;
  }

  const harness = track(
    await renderWithHarness(
      <GateRoot store={store}>
        <Profiler id="view-selector" onRender={viewCommits.onRender}>
          <ViewProbe />
        </Profiler>
        <Profiler id="anchor-selector" onRender={anchorCommits.onRender}>
          <AnchorProbe />
        </Profiler>
      </GateRoot>,
      { strictMode: true },
    ),
  );

  viewCommits.counter.reset();
  anchorCommits.counter.reset();
  viewSelector.counter.reset();
  anchorSelector.counter.reset();
  await act(async () => store.actions.setSelection({ eventId: "event-1" }));

  expect(viewSelector.counter.value).toBeGreaterThan(0);
  expect(anchorSelector.counter.value).toBeGreaterThan(0);
  expect(viewCommits.counter.value).toBe(0);
  expect(anchorCommits.counter.value).toBe(0);

  await act(async () => store.actions.setAnchorDate(Temporal.PlainDate.from("2026-08-16")));

  expect(viewCommits.counter.value).toBe(0);
  expect(anchorCommits.counter.value).toBe(1);
  expect(harness.container.querySelector("[data-view-selector]")?.textContent).toBe("month");
  expect(harness.container.querySelector("[data-anchor-selector]")?.textContent).toBe("2026-08-16");
});

test("the public custom-view fixture uses deterministic builders and an injected clock", async () => {
  const clock = createTestCalendarClock();
  const harness = track(
    await renderWithHarness(
      <GateRoot clock={clock} defaultView="month">
        <GateCalendar.ActiveView />
        <GateCalendar.TodayTrigger data-gate-today>Today</GateCalendar.TodayTrigger>
      </GateRoot>,
    ),
  );

  expect(harness.container.querySelector("[data-gate-view]")?.textContent).toBe("month:7:1");
  expect(
    harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-event-count"),
  ).toBe("1");

  clock.set(Temporal.Instant.from("2026-08-21T08:30:00Z"));
  await click(harness.container, "[data-gate-today]");

  expect(
    harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-anchor"),
  ).toBe("2026-08-21");
});

test("the hydrate harness reports stable markup, no warnings, interaction, and clean unmount", async () => {
  const clock = createTestCalendarClock();
  const consoleErrors = vi.spyOn(console, "error").mockImplementation(() => undefined);

  function HydrationApplication() {
    const [view, setView] = useState<GateView>("month");
    return (
      <GateRoot clock={clock} onViewChange={setView} view={view}>
        <GateCalendar.Frame>
          <GateCalendar.Title />
          <GateCalendar.ActiveView />
          <GateViewTrigger target="agenda" />
        </GateCalendar.Frame>
      </GateRoot>
    );
  }

  const harness = track(
    await hydrateWithHarness(<HydrationApplication />, {
      identifierPrefix: "react-gate-",
      strictMode: true,
    }),
  );

  expect(harness.hydratedWithoutMutation).toBe(true);
  expect(harness.recoverableErrors).toEqual([]);
  expect(consoleErrors).not.toHaveBeenCalled();
  expect(harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view")).toBe(
    "month",
  );

  await click(harness.container, "[data-gate-view-trigger]");
  expect(harness.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view")).toBe(
    "agenda",
  );

  await harness.unmount();
  expect(harness.container.childNodes).toHaveLength(0);
  expect(harness.unmounted).toBe(true);
});

test("two physical React roots keep independently owned calendar state isolated", async () => {
  function Fixture({ id }: { readonly id: string }) {
    return (
      <GateRoot id={id}>
        <GateCalendar.ActiveView />
        <GateViewTrigger target="agenda" />
      </GateRoot>
    );
  }

  const first = track(await renderWithHarness(<Fixture id="first-calendar" />));
  const second = track(await renderWithHarness(<Fixture id="second-calendar" />));

  await click(first.container, "[data-gate-view-trigger]");

  expect(first.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view")).toBe(
    "agenda",
  );
  expect(second.container.querySelector("[data-gate-view]")?.getAttribute("data-gate-view")).toBe(
    "month",
  );
});

test("unmount disconnects one root while a caller-owned store remains usable", async () => {
  const store = makeStore();
  const renders = { first: createTestCounter(), second: createTestCounter() };

  function StoreProbe({ label }: { readonly label: keyof typeof renders }) {
    renders[label].increment();
    return <output data-store-probe={label}>{GateCalendar.useCalendarState().view}</output>;
  }

  const first = track(
    await renderWithHarness(
      <GateRoot store={store}>
        <StoreProbe label="first" />
      </GateRoot>,
    ),
  );
  const second = track(
    await renderWithHarness(
      <GateRoot store={store}>
        <StoreProbe label="second" />
      </GateRoot>,
    ),
  );

  await first.unmount();
  renders.first.reset();
  renders.second.reset();
  await act(async () => store.actions.setView("agenda"));

  expect(first.container.childNodes).toHaveLength(0);
  expect(renders.first.value).toBe(0);
  expect(renders.second.value).toBe(1);
  expect(second.container.querySelector("[data-store-probe]")?.textContent).toBe("agenda");
  expect(store.getSnapshot().view).toBe("agenda");
});
