// @vitest-environment jsdom

import { plainDateInterval } from "@moltenship/calendar-temporal";
import {
  defineEventAdapter,
  type CalendarEnvironment,
  type CalendarViewStrategy,
} from "@moltenship/calendar-core";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { createCalendar, type CalendarDiagnostic, type CalendarPartRefs } from "../src/index.js";
import "./setup.js";

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

interface ViewOptions {
  readonly days: number;
  readonly label: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: (event) => event.roomIds,
  getTitle: (event) => event.title,
});
const Calendar = createCalendar<Meeting, Room>({
  capabilities: ["calendar:testing"],
  eventAdapter: adapter,
});

function viewStrategy(name: string, days: number) {
  return {
    getInteractionGeometry: (input: number) => input,
    getRange: (anchor: Temporal.PlainDate) => plainDateInterval(anchor, anchor.add({ days })),
    getSpatialNavigation: (input: string) => input,
    getTitle: (
      range: ReturnType<typeof plainDateInterval>,
      _environment: CalendarEnvironment,
      options: ViewOptions,
    ) => `${options.label}:${range.start.toString()}`,
    name,
    navigate: (anchor: Temporal.PlainDate, direction: -1 | 1) =>
      anchor.add({ days: direction * days }),
    project: (input: number) => input,
  } satisfies CalendarViewStrategy<
    string,
    ViewOptions,
    number,
    number,
    string,
    string,
    number,
    number
  >;
}

const monthView = Calendar.defineView({
  capabilities: ["view:month-grid"],
  defaultOptions: { days: 7, label: "Month" },
  Renderer({ calendar }) {
    return <output data-active-view>{calendar.state.view}</output>;
  },
  strategy: viewStrategy("month", 7),
});
const agendaView = Calendar.defineView({
  capabilities: ["view:agenda-list"],
  defaultOptions: { days: 1, label: "Agenda" },
  Renderer({ calendar }) {
    return <output data-active-view>{calendar.state.view}</output>;
  },
  strategy: viewStrategy("agenda", 1),
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
          {anchorDate.toString()}:{String(meta.capabilities.has("calendar:testing"))}
        </button>
        <button
          data-selection-control
          onClick={() => actions.setSelection("meeting-1")}
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
      locale="en-GB"
      now={Temporal.Instant.from("2026-08-20T08:00:00Z")}
      resources={resources}
      views={[monthView, agendaView]}
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
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-15:true");
  expect(titleRef.current?.textContent).toBe("Month:2026-08-15");
  expect(nextRef.current?.getAttribute("aria-controls")).toBe(viewportRef.current?.id);
  expect(frameRef.current?.id).toMatch(/^calendar-.+-frame$/u);

  const renderCountBeforeUnrelatedSelection = outsideControlRenderCount;
  await act(async () =>
    container.querySelector<HTMLButtonElement>("[data-selection-control]")?.click(),
  );
  expect(outsideControlRenderCount).toBe(renderCountBeforeUnrelatedSelection);

  await act(async () =>
    container.querySelector<HTMLButtonElement>("[data-outside-control]")?.click(),
  );
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-22:true");

  await act(async () =>
    container.querySelector<HTMLButtonElement>('[data-calendar-part="today-trigger"]')?.click(),
  );
  expect(container.querySelector("[data-outside-control]")?.textContent).toBe("2026-08-20:true");

  const switcher = container.querySelector<HTMLSelectElement>(
    '[data-calendar-part="view-switcher"]',
  );
  if (switcher === null) throw new Error("view-switcher-not-rendered");
  switcher.value = "agenda";
  await act(async () => switcher.dispatchEvent(new Event("change", { bubbles: true })));
  expect(container.querySelector("[data-active-view]")?.textContent).toBe("agenda");
  expect(titleRef.current?.textContent).toBe("Agenda:2026-08-20");
});

test("registration, event validation, capabilities, and diagnostics stay structured", async () => {
  const onDiagnosticsChange =
    vi.fn<(diagnostics: readonly CalendarDiagnostic<Meeting, string>[]) => void>();
  let observedCodes: readonly string[] = [];

  function Probe() {
    const meta = Calendar.useCalendarMeta();
    observedCodes = meta.diagnostics.map((diagnostic) => diagnostic.code);
    return <output>{meta.viewRegistry.size}</output>;
  }

  const duplicateEvents = [events[0], events[0]].filter(
    (event): event is Meeting => event !== undefined,
  );
  const container = await mount(
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="Asia/Tbilisi"
      defaultView="missing"
      events={duplicateEvents}
      locale="en-GB"
      onDiagnosticsChange={onDiagnosticsChange}
      views={[monthView, monthView]}
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Probe />
      <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
    </Calendar.Root>,
  );

  expect(container.querySelector("output")?.textContent).toBe("1");
  expect(observedCodes).toEqual([
    "duplicate-view-name",
    "unregistered-active-view",
    "invalid-event",
  ]);
  expect(onDiagnosticsChange).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({ code: "duplicate-view-name", severity: "warning" }),
      expect.objectContaining({ code: "unregistered-active-view", severity: "error" }),
      expect.objectContaining({ code: "invalid-event", severity: "error" }),
    ]),
  );
  expect(
    container.querySelector<HTMLButtonElement>('[data-calendar-part="today-trigger"]')?.disabled,
  ).toBe(true);
});
