// @vitest-environment jsdom

import { defineEventAdapter } from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { act, createRef, useLayoutEffect, useState, type Ref, type RefCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  type CalendarDiagnostic,
  type CalendarFrameProps,
  type CalendarPartRefs,
  type CalendarTitleProps,
  type CalendarViewportProps,
} from "../src/index";
import "./setup";

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly roomIds: readonly string[];
  readonly start: Temporal.Instant;
  readonly title: string;
}

interface Room {
  readonly id: string;
  readonly title: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.title,
});

function dayRangeView<const TName extends string>(name: TName, days: number, label: string) {
  return defineCalendarView({
    defaultOptions: { days, label },
    name,
    Renderer: () => <output data-active-view>{name}</output>,
    strategy: {
      getRange: (anchor, _environment, options) =>
        plainDateInterval(anchor, anchor.add({ days: options.days })),
      getTitle: (range, _environment, options) => `${options.label}:${range.start.toString()}`,
      navigate: (anchor, delta, options) => anchor.add({ days: delta * options.days }),
      project: () => null,
    },
  });
}

const monthView = dayRangeView("month", 7, "Month");
const agendaView = dayRangeView("agenda", 1, "Agenda");
const Calendar = createCalendar<Meeting, Room>()({
  eventAdapter: adapter,
  views: [monthView, agendaView],
});

const events: readonly Meeting[] = [
  {
    end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
    id: "meeting-1",
    roomIds: ["room-1"],
    start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
    title: "Architecture review",
  },
];
const resources: readonly Room[] = [{ id: "room-1", title: "Orchid" }];
const mountedRoots: Root[] = [];
const selectAnchorDate = (state: { readonly anchorDate: Temporal.PlainDate }) => state.anchorDate;
let observedPartRefs: CalendarPartRefs | undefined;
let outsideControlRenderCount = 0;

async function mount(element: React.ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  observedPartRefs = undefined;
  vi.restoreAllMocks();
  outsideControlRenderCount = 0;
});

test("compound controls work anywhere under Root with direct React 19 refs", async () => {
  const frameRef = createRef<HTMLElement>();
  const toolbarRef = createRef<HTMLElement>();
  const viewportRef = createRef<HTMLDivElement>();
  const titleRef = createRef<HTMLSpanElement>();
  const nextRef = createRef<HTMLButtonElement>();
  const switcherRef = createRef<HTMLSelectElement>();

  function OutsideControl() {
    outsideControlRenderCount += 1;
    const actions = Calendar.useCalendarActions();
    const anchorDate = Calendar.useCalendarSelector(selectAnchorDate);
    const meta = Calendar.useCalendarMeta();
    observedPartRefs = meta.refs;
    return (
      <div>
        <button data-outside-control onClick={() => actions.navigateNext()} type="button">
          {anchorDate.toString()}
        </button>
        <button
          data-selection-control
          onClick={() => actions.setSelection({ eventId: "meeting-1", kind: "event" })}
          type="button"
        >
          Select
        </button>
      </div>
    );
  }

  const container = await mount(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="Asia/Tbilisi"
      defaultView="month"
      events={events}
      id="team-calendar"
      locale="en-GB"
      now={Temporal.Instant.from("2026-08-20T08:00:00Z")}
      resources={resources}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <OutsideControl />
      <Calendar.Frame ref={frameRef}>
        <Calendar.Toolbar ref={toolbarRef}>
          <Calendar.Title ref={titleRef} />
          <Calendar.NextTrigger ref={nextRef}>Next</Calendar.NextTrigger>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.ViewSwitcher getViewLabel={(name) => name} ref={switcherRef} />
        </Calendar.Toolbar>
        <Calendar.Viewport ref={viewportRef}>
          <Calendar.ActiveView />
          <Calendar.Event eventId="meeting-1">
            {({ event }) => <span data-event>{event.title}</span>}
          </Calendar.Event>
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>,
  );

  expect(frameRef.current?.tagName).toBe("SECTION");
  expect(toolbarRef.current?.tagName).toBe("HEADER");
  expect(viewportRef.current?.tagName).toBe("DIV");
  expect(titleRef.current?.tagName).toBe("SPAN");
  expect(nextRef.current?.tagName).toBe("BUTTON");
  expect(switcherRef.current?.tagName).toBe("SELECT");
  expect(observedPartRefs?.frame.current).toBe(frameRef.current);
  expect(observedPartRefs?.toolbar.current).toBe(toolbarRef.current);
  expect(observedPartRefs?.viewport.current).toBe(viewportRef.current);
  expect(observedPartRefs?.title.current).toBe(titleRef.current);
  expect(container.querySelector("[data-event]")?.textContent).toBe("Architecture review");
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-15");
  expect(titleRef.current?.textContent).toBe("Month:2026-08-15");
  expect(frameRef.current?.id).toBe("team-calendar-frame");
  expect(frameRef.current?.getAttribute("aria-labelledby")).toBe("team-calendar-title");
  expect(titleRef.current?.id).toBe("team-calendar-title");
  expect(viewportRef.current?.id).toBe("team-calendar-viewport");
  expect(nextRef.current?.getAttribute("aria-controls")).toBe("team-calendar-viewport");
  expectTypeOf<"id" extends keyof CalendarFrameProps ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<"id" extends keyof CalendarTitleProps ? true : false>().toEqualTypeOf<false>();
  expectTypeOf<"id" extends keyof CalendarViewportProps ? true : false>().toEqualTypeOf<false>();

  const renderCountBeforeUnrelatedSelection = outsideControlRenderCount;
  await act(async () =>
    container.querySelector<HTMLButtonElement>("[data-selection-control]")?.click(),
  );
  expect(outsideControlRenderCount).toBe(renderCountBeforeUnrelatedSelection);

  await act(async () =>
    container.querySelector<HTMLButtonElement>("[data-outside-control]")?.click(),
  );
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-22");

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-calendar-part="today-trigger"]')?.click(),
  );
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-20");

  const switcher = container.querySelector<HTMLSelectElement>(
    '[data-calendar-part="view-switcher"]',
  );
  if (switcher === null) throw new Error("view-switcher-not-rendered");
  switcher.value = "agenda";
  await act(async () => switcher.dispatchEvent(new Event("change", { bubbles: true })));
  expect(container.querySelector("[data-active-view]")?.textContent).toBe("agenda");
  expect(titleRef.current?.textContent).toBe("Agenda:2026-08-20");
});

test("composed callback refs preserve React 19 cleanup on replacement and unmount", async () => {
  const firstCleanup = vi.fn();
  const firstLegacyDetach = vi.fn();
  const secondCleanup = vi.fn();
  const secondLegacyDetach = vi.fn();
  let partRefs: CalendarPartRefs | undefined;
  const firstRef: RefCallback<HTMLElement> = (node) => {
    if (node === null) {
      firstLegacyDetach();
      return;
    }
    return firstCleanup;
  };
  const secondRef: RefCallback<HTMLElement> = (node) => {
    if (node === null) {
      secondLegacyDetach();
      return;
    }
    return secondCleanup;
  };

  function Probe() {
    partRefs = Calendar.useCalendarMeta().refs;
    return null;
  }

  function renderCalendar(frameRef: Ref<HTMLElement>) {
    return (
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
        defaultTimeZone="Asia/Tbilisi"
        defaultView="month"
        events={events}
        locale="en-GB"
        resources={resources}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <Probe />
        <Calendar.Frame ref={frameRef} />
      </Calendar.Root>
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(renderCalendar(firstRef)));
  expect(partRefs?.frame.current).toBeInstanceOf(HTMLElement);

  await act(async () => root.render(renderCalendar(secondRef)));
  expect(firstCleanup).toHaveBeenCalledOnce();
  expect(firstLegacyDetach).not.toHaveBeenCalled();
  expect(partRefs?.frame.current).toBeInstanceOf(HTMLElement);

  mountedRoots.pop();
  await act(async () => root.unmount());
  expect(secondCleanup).toHaveBeenCalledOnce();
  expect(secondLegacyDetach).not.toHaveBeenCalled();
  expect(partRefs?.frame.current).toBeNull();
});

test("descendant layout effects navigate with the latest committed view and handler", async () => {
  const actionHistory: ReturnType<typeof Calendar.useCalendarActions>[] = [];
  const navigationCommits: string[] = [];

  function NavigateFromLayout({ revision }: { readonly revision: number }) {
    const actions = Calendar.useCalendarActions();
    actionHistory.push(actions);
    useLayoutEffect(() => {
      if (revision > 0) actions.navigateNext();
    }, [actions, revision]);
    return null;
  }

  function Harness({
    revision,
    view,
  }: {
    readonly revision: number;
    readonly view: "agenda" | "month";
  }) {
    const [anchorDate, setAnchorDate] = useState(Temporal.PlainDate.from("2026-08-15"));
    return (
      <Calendar.Root
        anchorDate={anchorDate}
        defaultTimeZone="Asia/Tbilisi"
        events={events}
        locale="en-GB"
        onAnchorDateChange={(next) => {
          navigationCommits.push(`${view}:${next.toString()}`);
          setAnchorDate(next);
        }}
        resources={resources}
        view={view}
        weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
      >
        <NavigateFromLayout revision={revision} />
        <output data-anchor>{anchorDate.toString()}</output>
      </Calendar.Root>
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(<Harness revision={0} view="month" />));
  const initialActions = actionHistory.at(-1);

  await act(async () => root.render(<Harness revision={1} view="agenda" />));

  expect(actionHistory.at(-1)).toBe(initialActions);
  expect(navigationCommits).toEqual(["agenda:2026-08-16"]);
  expect(container.querySelector("[data-anchor]")?.textContent).toBe("2026-08-16");
});

test("an unregistered view and invalid events surface as structured diagnostics", async () => {
  const onDiagnosticsChange =
    vi.fn<(diagnostics: readonly CalendarDiagnostic<Meeting, string>[]) => void>();
  let observedCodes: readonly string[] = [];

  function Probe() {
    const meta = Calendar.useCalendarMeta();
    observedCodes = meta.diagnostics.map((diagnostic) => diagnostic.code);
    return <output data-view-count>{meta.views.length}</output>;
  }

  const duplicateEvents = [events[0], events[0]].filter(
    (event): event is Meeting => event !== undefined,
  );
  const container = await mount(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="Asia/Tbilisi"
      events={duplicateEvents}
      locale="en-GB"
      onDiagnosticsChange={onDiagnosticsChange}
      // @ts-expect-error a view name outside the registered union is rejected by the types.
      view="missing"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Probe />
      <Calendar.ActiveView fallback={<p data-fallback>View unavailable</p>} />
      <Calendar.NextTrigger>Next</Calendar.NextTrigger>
    </Calendar.Root>,
  );

  expect(container.querySelector("[data-view-count]")?.textContent).toBe("2");
  expect(observedCodes).toEqual(["unregistered-active-view", "invalid-event"]);
  expect(onDiagnosticsChange).toHaveBeenCalledOnce();
  expect(onDiagnosticsChange).toHaveBeenCalledWith([
    expect.objectContaining({ code: "unregistered-active-view", viewName: "missing" }),
    expect.objectContaining({
      code: "invalid-event",
      issue: expect.objectContaining({ code: "duplicate-event-id", index: 1 }),
    }),
  ]);
  expect(container.querySelector("[data-fallback]")).not.toBeNull();
  expect(
    container.querySelector<HTMLButtonElement>('[data-calendar-part="next-trigger"]')?.disabled,
  ).toBe(true);
});

test("a factory rejects two views with the same name", () => {
  expect(() =>
    createCalendar<Meeting>()({ eventAdapter: adapter, views: [monthView, monthView] }),
  ).toThrow("calendar-duplicate-view-name:month");
});
