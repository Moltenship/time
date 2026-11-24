// @vitest-environment jsdom

import { defineEventAdapter } from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { createAgent, registerTools } from "@ui-sdk/react/agent";
import { Button } from "@ui-sdk/react/button";
import { Profiler, act, useState, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, test } from "vite-plus/test";

import { createCalendar, defineCalendarView } from "../src/index";
import "./setup";

// One bridge for the file: it hears components as they are made, so it exists before any renders.
const agent = createAgent();

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly start: Temporal.Instant;
  readonly title: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => ({ end: event.end, kind: "timed", start: event.start }),
  getResourceIds: () => [],
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
      getTitle: (range, _environment, options) => `${options.label} ${range.start.toString()}`,
      navigate: (anchor, delta, options) => anchor.add({ days: delta * options.days }),
      project: () => null,
    },
  });
}

const Calendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [dayRangeView("week", 7, "Week"), dayRangeView("agenda", 1, "Agenda")],
});

const review: Meeting = {
  end: Temporal.Instant.from("2026-08-15T10:00:00Z"),
  id: "meeting-1",
  start: Temporal.Instant.from("2026-08-15T09:00:00Z"),
  title: "Architecture review",
};

const mountedRoots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

type RootProps = Partial<ComponentProps<typeof Calendar.Root>>;

const rootDefaults = {
  defaultAnchorDate: Temporal.PlainDate.from("2026-08-15"),
  defaultTimeZone: "UTC",
  defaultView: "week",
  label: "Team calendar",
  locale: "en-GB",
  now: Temporal.Instant.from("2026-08-14T08:00:00Z"),
  weekRules: { firstDay: 1, minimalDays: 4, weekend: [6, 7] },
} as const;

async function render(element: ReactNode): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => root.render(element));
  return container;
}

function mount(props: RootProps = {}): Promise<HTMLElement> {
  // The props make a union, which a partial of it can't be spread over; these are complete.
  const all = { ...rootDefaults, events: [review], ...props } as ComponentProps<
    typeof Calendar.Root
  >;
  return render(
    <Calendar.Root {...all}>
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
          <Calendar.Title />
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>,
  );
}

function calendarOf() {
  const found = agent
    .snapshot()
    .filter((component) => component.component === "calendar" && component.offPage !== true);
  expect(found).toHaveLength(1);
  return found[0]!;
}

async function run(action: string, ...args: unknown[]) {
  let outcome: Awaited<ReturnType<typeof agent.act>> | undefined;
  await act(async () => {
    // By its name, as an agent finds it: the label stays put while the title changes.
    outcome = await agent.act({ steps: [{ action, args, ref: "Team calendar" }] });
  });
  return outcome!;
}

/** The value an action returned to the agent, from its one step. */
async function value<T>(action: string, ...args: unknown[]): Promise<T> {
  const outcome = await run(action, ...args);
  expect(outcome.error).toBeUndefined();
  return outcome.steps[0]!.result as T;
}

const changeActions = ["createEvent", "updateEvent", "moveEvent", "resizeEvent"];
const readActions = [
  "describeCalendar",
  "getChange",
  "goToDate",
  "listEvents",
  "navigateNext",
  "navigatePrevious",
  "navigateToday",
  "selectEvent",
  "setTimeZone",
  "setView",
];

test("the snapshot lists the calendar with its name, its state and the actions it takes now", async () => {
  await mount();
  const calendar = calendarOf();

  expect(calendar.label).toBe("Team calendar");
  expect(calendar.view).toBe("week");
  expect(calendar.timeZone).toBe("UTC");
  expect(String(calendar.anchorDate)).toBe("2026-08-15");
  expect(calendar.selection).toBeNull();
  // Read-only, so no event changes; and no delete without `allowAgentDelete`.
  expect(calendar.actions.toSorted()).toEqual(readActions.toSorted());
});

test("a root that takes changes offers them, and delete only where it allows it", async () => {
  await mount({ onEventChange: () => undefined });
  expect(calendarOf().actions.toSorted()).toEqual([...readActions, ...changeActions].toSorted());

  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  await mount({ allowAgentDelete: true, onEventChange: () => undefined });
  expect(calendarOf().actions).toContain("deleteEvent");
});

test("without a label the calendar is named by its title", async () => {
  await mount({ label: undefined });

  expect(calendarOf().label).toBe("Week 2026-08-15");
});

test("an agent reads the calendar and its events as JSON", async () => {
  await mount({ onEventChange: () => undefined });

  const described = await value<Record<string, unknown>>("describeCalendar");
  expect(described).toMatchObject({
    canDelete: false,
    now: "2026-08-14T08:00:00+00:00",
    readOnly: false,
    timeZone: "UTC",
    today: "2026-08-14",
    view: "week",
    views: ["week", "agenda"],
    visibleRange: { end: "2026-08-22", start: "2026-08-15" },
  });
  expect(Object.keys(described.actions as object).toSorted()).toEqual(
    calendarOf().actions.toSorted(),
  );

  expect(await value("listEvents")).toEqual([
    {
      end: "2026-08-15T10:00:00+00:00",
      id: "meeting-1",
      kind: "timed",
      resourceIds: [],
      start: "2026-08-15T09:00:00+00:00",
      title: "Architecture review",
    },
  ]);
  expect(await value("listEvents", { end: "2026-08-15", start: "2026-08-08" })).toEqual([]);
});

test("an agent navigates and switches views, and the app's handlers see the agent as the source", async () => {
  const anchorChanges: { readonly reason: string; readonly source: string }[] = [];
  const viewChanges: { readonly reason: string; readonly source: string }[] = [];
  const container = await mount({
    onAnchorDateChange: (_value, detail) =>
      anchorChanges.push({ reason: detail.reason, source: detail.source }),
    onViewChange: (_value, detail) =>
      viewChanges.push({ reason: detail.reason, source: detail.source }),
  });
  const title = () => container.querySelector("[data-calendar-part='title']")?.textContent;

  const next = await run("navigateNext");
  expect(next.ok).toBe(true);
  expect(title()).toBe("Week 2026-08-22");
  expect(String(calendarOf().anchorDate)).toBe("2026-08-22");

  const goTo = await run("goToDate", { date: "2026-09-01" });
  expect(goTo.ok).toBe(true);
  expect(title()).toBe("Week 2026-09-01");

  const switched = await run("setView", { view: "agenda" });
  expect(switched.ok).toBe(true);
  expect(container.querySelector("[data-active-view]")?.textContent).toBe("agenda");
  expect(calendarOf().view).toBe("agenda");

  expect(anchorChanges).toEqual([
    { reason: "imperative", source: "agent" },
    { reason: "imperative", source: "agent" },
  ]);
  expect(viewChanges).toEqual([{ reason: "imperative", source: "agent" }]);

  // The same command from the page is not the agent's: a script's click reads as programmatic.
  await act(async () => {
    container.querySelector<HTMLButtonElement>("[data-calendar-part='next-trigger']")!.click();
  });
  expect(anchorChanges.at(-1)).toEqual({ reason: "next-press", source: "programmatic" });
});

test("a positional argument fails the step with what the action takes", async () => {
  await mount();

  const outcome = await run("goToDate", "2026-09-01");

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toBe(
    'calendar-agent-invalid-arguments: goToDate takes { date: ISO date }; got "2026-09-01"',
  );
});

test("a state change commits Root once, and the calendar's projection is current in it", async () => {
  let commits = 0;
  const container = await render(
    <Profiler id="calendar" onRender={() => (commits += 1)}>
      <Calendar.Root {...rootDefaults} events={[review]}>
        <Calendar.Frame>
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
          <Calendar.Title />
        </Calendar.Frame>
      </Calendar.Root>
    </Profiler>,
  );
  commits = 0;

  await act(async () => {
    container.querySelector<HTMLButtonElement>("[data-calendar-part='next-trigger']")!.click();
  });
  expect(commits).toBe(1);
  expect(String(calendarOf().anchorDate)).toBe("2026-08-22");

  commits = 0;
  await run("navigateNext");
  expect(commits).toBe(1);
  expect(String(calendarOf().anchorDate)).toBe("2026-08-29");
});

test("a handler that cancels keeps the calendar where it was", async () => {
  const container = await mount({
    onViewChange: (_value, detail) => {
      if (detail.source === "agent") detail.cancel();
    },
  });

  const outcome = await run("setView", { view: "agenda" });

  expect(outcome.ok).toBe(true);
  expect(container.querySelector("[data-active-view]")?.textContent).toBe("week");
  expect(calendarOf().view).toBe("week");
});

test("an unknown view fails the step with the registered views", async () => {
  await mount();

  const outcome = await run("setView", { view: "year" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('"year" is not a registered view');
  expect(outcome.error?.message).toContain('Views: "week", "agenda"');
  expect(calendarOf().view).toBe("week");
});

/** A root whose application applies the agent's changes to its own events, titles included. */
function Editable({
  log,
  onEventChangeResult,
}: {
  readonly log: { latest: readonly Meeting[]; readonly inputs: string[] };
  readonly onEventChangeResult?: ComponentProps<typeof Calendar.Root>["onEventChangeResult"];
}) {
  const [events, setEvents] = useState<readonly Meeting[]>([review]);
  log.latest = events;
  return (
    <Calendar.Root
      {...rootDefaults}
      events={events}
      onEventChange={(change, detail) => {
        log.inputs.push(`${change.cause}:${detail.input}`);
        const title = typeof detail.fields?.title === "string" ? detail.fields.title : undefined;
        if (change.cause === "create" && change.proposed !== null) {
          const { end, start } = change.proposed;
          setEvents((current) => [
            ...current,
            {
              end: end as Temporal.Instant,
              id: `meeting-${current.length + 1}`,
              start: start as Temporal.Instant,
              title: title ?? "",
            },
          ]);
          return;
        }
        setEvents((current) =>
          current.map((event) =>
            event.id === change.eventId && change.proposed !== null
              ? {
                  ...event,
                  end: change.proposed.end as Temporal.Instant,
                  start: change.proposed.start as Temporal.Instant,
                  title: title ?? event.title,
                }
              : event,
          ),
        );
      }}
      onEventChangeResult={onEventChangeResult}
    >
      <Calendar.Frame>
        <Calendar.Title />
      </Calendar.Frame>
    </Calendar.Root>
  );
}

test("an agent creates an event with a title, updates and moves it, and selects it", async () => {
  const log = { inputs: [] as string[], latest: [] as readonly Meeting[] };
  const results: string[] = [];
  await render(
    <Editable
      log={log}
      onEventChangeResult={(result, detail) => results.push(`${result.status}:${detail.input}`)}
    />,
  );

  expect(calendarOf().items).toEqual([
    {
      label: "Architecture review · 2026-08-15T09:00 to 2026-08-15T10:00 (UTC)",
      value: "meeting-1",
    },
  ]);

  const created = await value<Record<string, unknown>>("createEvent", {
    end: "2026-08-17T11:00",
    start: "2026-08-17T10:00",
    title: "Planning",
  });
  expect(created).toMatchObject({ cause: "create", eventId: null, status: "saved" });
  expect(log.latest.at(-1)).toMatchObject({ id: "meeting-2", title: "Planning" });

  const updated = await value("updateEvent", { eventId: "meeting-2", title: "Sprint planning" });
  expect(updated).toMatchObject({ cause: "update", eventId: "meeting-2", status: "saved" });
  expect(
    await value("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" }),
  ).toMatchObject({ cause: "move", status: "saved" });

  expect(await value("listEvents")).toEqual([
    expect.objectContaining({ id: "meeting-1", start: "2026-08-16T14:00:00+00:00" }),
    expect.objectContaining({ id: "meeting-2", title: "Sprint planning" }),
  ]);
  // The length is kept when the agent gives only a start.
  expect(log.latest[0]!.end.toString()).toBe("2026-08-16T15:00:00Z");

  await run("selectEvent", { eventId: "meeting-2" });
  expect(calendarOf().selection).toEqual({ eventId: "meeting-2", kind: "event" });
  expect(await value("describeCalendar")).toMatchObject({ selectedEventId: "meeting-2" });

  expect(log.inputs).toEqual(["create:agent", "update:agent", "move:agent"]);
  expect(results).toEqual(["committed:agent", "committed:agent", "committed:agent"]);
});

test("a handler that rejects a change fails the agent's step with its reason", async () => {
  await mount({
    onEventChange: () => {
      throw new Error("The room is booked");
    },
  });

  const outcome = await run("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toBe(
    "calendar-event-change-rejected: handler-error (The room is booked)",
  );
});

test("a policy's refusal fails the step at once and reaches onEventChangeResult once", async () => {
  const saved: string[] = [];
  const results: string[] = [];
  let checks = 0;
  await mount({
    onEventChange: (_change, detail) => void saved.push(detail.input),
    onEventChangeResult: (result, detail) =>
      results.push(
        `${result.status}:${result.status === "rejected" ? result.reason : ""}:${detail.input}`,
      ),
    policies: [
      (_change, { detail }) => {
        checks += 1;
        return detail?.input === "agent"
          ? { reason: "agents-may-not-move", type: "reject" }
          : { type: "accept" };
      },
    ],
  });

  const outcome = await run("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toBe("calendar-event-change-rejected: agents-may-not-move");
  expect(saved).toEqual([]);
  expect(checks).toBe(1);
  expect(results).toEqual(["rejected:agents-may-not-move:agent"]);
});

test("a save that takes a while returns where it is, and the result comes after", async () => {
  let finish: (() => void) | undefined;
  const results: string[] = [];
  await mount({
    onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
  });

  const outcome = await run("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(true);
  const change = outcome.steps[0]!.result as { readonly changeId: string; readonly status: string };
  expect(change.status).toBe("saving");
  expect(results).toEqual([]);
  await act(async () => finish?.());
  expect(results).toEqual(["committed:agent"]);
  expect(await value("getChange", { changeId: change.changeId })).toMatchObject({
    status: "saved",
  });
});

test("a save that fails late leaves no unhandled rejection, and the agent can read why", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => void unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    let fail: ((error: Error) => void) | undefined;
    const results: string[] = [];
    await mount({
      onEventChange: () => new Promise<void>((_resolve, reject) => (fail = reject)),
      onEventChangeResult: (result) => results.push(result.status),
    });

    const change = await value<{ readonly changeId: string; readonly status: string }>(
      "moveEvent",
      { eventId: "meeting-1", start: "2026-08-16T14:00" },
    );
    expect(change.status).toBe("saving");
    await act(async () => fail?.(new Error("offline")));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(await value("getChange", { changeId: change.changeId })).toMatchObject({
      reason: "handler-error",
      status: "rejected",
    });
    expect(results).toEqual(["rejected"]);
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("an unknown event fails the step with the events there are", async () => {
  await mount({ onEventChange: () => undefined });

  const outcome = await run("moveEvent", { eventId: "meeting-404", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('no event has the ID "meeting-404"');
  expect(outcome.error?.message).toContain('"meeting-1"');
});

test("an agent deletes only where the root lets it", async () => {
  const deleted: string[] = [];
  const onEventChange = (change: { readonly cause: string }, detail: { readonly input: string }) =>
    void deleted.push(`${change.cause}:${detail.input}`);
  await mount({ onEventChange });

  const refused = await run("deleteEvent", { eventId: "meeting-1" });

  // The bridge doesn't offer an action the calendar hides.
  expect(refused.ok).toBe(false);
  expect(deleted).toEqual([]);

  await act(async () => {
    for (const root of mountedRoots.splice(0)) root.unmount();
  });
  await mount({ allowAgentDelete: true, onEventChange });

  const allowed = await run("deleteEvent", { eventId: "meeting-1" });

  expect(allowed.ok).toBe(true);
  expect(deleted).toEqual(["delete:agent"]);
});

/** The application's own button, a ui-sdk one an agent can press, that deletes the review. */
function RemoveButton() {
  const actions = Calendar.useCalendarActions();
  return (
    <Button
      onClick={() => void actions.proposeEventChange({ cause: "delete", eventId: "meeting-1" })}
    >
      Remove review
    </Button>
  );
}

function mountWithButton(props: RootProps) {
  const all = { ...rootDefaults, events: [review], ...props } as ComponentProps<
    typeof Calendar.Root
  >;
  return render(
    <Calendar.Root {...all}>
      <RemoveButton />
      <Calendar.Frame>
        <Calendar.Title />
      </Calendar.Frame>
    </Calendar.Root>,
  );
}

async function press(ref: string) {
  let outcome: Awaited<ReturnType<typeof agent.act>> | undefined;
  await act(async () => {
    outcome = await agent.act({ steps: [{ action: "press", ref }] });
  });
  return outcome!;
}

test("a change an agent causes by pressing the application's button is the agent's", async () => {
  const seen: string[] = [];
  const results: string[] = [];
  const deleted: string[] = [];
  await mountWithButton({
    allowAgentDelete: true,
    onEventChange: (change, detail) => void deleted.push(`${change.cause}:${detail.input}`),
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
    policies: [
      (_change, { detail }) => {
        seen.push(detail?.input ?? "none");
        return { type: "accept" };
      },
    ],
  });

  const pressed = await press("Remove review");
  expect(pressed.ok).toBe(true);
  // The probe that learns the source is no change of its own.
  expect(pressed.steps[0]!.changes).toBeUndefined();

  expect(seen).toEqual(["agent"]);
  expect(deleted).toEqual(["delete:agent"]);
  expect(results).toEqual(["committed:agent"]);
});

test("an agent's press can't delete where the root doesn't let agents delete", async () => {
  const deleted: string[] = [];
  const results: string[] = [];
  await mountWithButton({
    onEventChange: (change) => void deleted.push(change.cause),
    onEventChangeResult: (result, detail) =>
      results.push(
        `${result.status}:${result.status === "rejected" ? result.reason : ""}:${detail.input}`,
      ),
  });

  await press("Remove review");
  await act(async () => undefined);

  expect(deleted).toEqual([]);
  expect(results).toEqual(["rejected:agent-delete-not-allowed:agent"]);

  // A person's click on the same button still deletes.
  await act(async () => {
    document.querySelector("button")!.click();
  });
  expect(deleted).toEqual(["delete"]);
});

test("query lists the visible events within the calendar, labelled as the root formats them", async () => {
  await mount({ formatAgentEventLabel: (event) => `${event.title} (${event.start})` });

  const found = await agent.query({ within: calendarOf().ref });

  expect(found).toEqual([
    expect.objectContaining({
      items: [{ label: "Architecture review (2026-08-15T09:00:00+00:00)", value: "meeting-1" }],
    }),
  ]);
});

test("registerTools hands the browser's agent three tools", async () => {
  const tools = new Map<string, unknown>();
  Object.assign(document, {
    modelContext: {
      registerTool: async (tool: { readonly name: string }) => {
        tools.set(tool.name, tool);
      },
    },
  });
  try {
    const unregister = registerTools(agent, { allow: () => true });
    await Promise.resolve();
    expect([...tools.keys()].toSorted()).toEqual(["act", "query", "snapshot"]);
    unregister();
  } finally {
    delete (document as { modelContext?: unknown }).modelContext;
  }
});
