// @vitest-environment jsdom

import { createComponent } from "@solidjs/web";
import { createAgent, registerTools } from "@ui-sdk/solid/agent";
import { Button } from "@ui-sdk/solid/button";
import { createSignal, merge } from "solid-js";
import { afterEach, expect, test } from "vite-plus/test";

import {
  Calendar,
  CalendarRoot,
  Chrome,
  review,
  type Meeting,
  type RootProps,
} from "./fixtures/calendar";
import { cleanup, mount, settled } from "./harness/render";
import "./setup";

// One bridge for the file: it hears components as they are made, so it exists before any renders.
const agent = createAgent();

afterEach(() => {
  Reflect.deleteProperty(document, "modelContext");
});

function render(props: RootProps = {}) {
  const view = mount(() =>
    createComponent(
      CalendarRoot,
      merge(props, {
        get children() {
          return createComponent(Chrome, {});
        },
      }),
    ),
  );
  const part = (name: string) =>
    view.container.querySelector<HTMLElement>(`[data-calendar-part='${name}']`)!;
  return { ...view, part };
}

function calendarOf() {
  const found = agent
    .snapshot()
    .filter((component) => component.component === "calendar" && component.offPage !== true);
  expect(found).toHaveLength(1);
  return found[0]!;
}

async function run(action: string, ...args: unknown[]) {
  // By its name, as an agent finds it: the label stays put while the title changes.
  const outcome = await agent.act({ steps: [{ action, args, ref: "Team calendar" }] });
  await settled();
  return outcome;
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
  render();
  // The calendar hides what it doesn't take once its instance is made, a microtask after.
  await settled();
  const calendar = calendarOf();

  expect(calendar.label).toBe("Team calendar");
  expect(calendar.view).toBe("week");
  expect(calendar.timeZone).toBe("UTC");
  expect(String(calendar.anchorDate)).toBe("2026-08-15");
  expect(calendar.selection).toBeNull();
  // Read-only, so no event changes; and no delete without `allowAgentDelete`.
  expect(calendar.actions.toSorted()).toEqual(readActions.toSorted());
  expect(calendar.items).toEqual([
    {
      label: "Architecture review · 2026-08-15T09:00 to 2026-08-15T10:00 (UTC)",
      value: "meeting-1",
    },
  ]);
});

test("a root that takes changes offers them, and delete only where it allows it", async () => {
  render({ onEventChange: () => undefined });
  await settled();
  expect(calendarOf().actions.toSorted()).toEqual([...readActions, ...changeActions].toSorted());

  cleanup();
  render({ allowAgentDelete: true, onEventChange: () => undefined });
  await settled();
  expect(calendarOf().actions).toContain("deleteEvent");
});

test("without a label the calendar is named by its title", () => {
  render({ label: undefined });

  expect(calendarOf().label).toBe("Week 2026-08-15");
});

test("an agent reads the calendar and its events as JSON", async () => {
  render({ onEventChange: () => undefined });

  const described = await value<Record<string, unknown>>("describeCalendar");
  expect(described).toMatchObject({
    canDelete: false,
    readOnly: false,
    timeZone: "UTC",
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

test("an agent navigates, goes to a date, switches views and time zones, each as the agent's", async () => {
  const changes: string[] = [];
  const { container, part } = render({
    onAnchorDateChange: (next, detail) =>
      changes.push(`anchorDate ${next.toString()} ${detail.reason} ${detail.source}`),
    onTimeZoneChange: (next, detail) => changes.push(`timeZone ${next} ${detail.source}`),
    onViewChange: (next, detail) => changes.push(`view ${next} ${detail.reason} ${detail.source}`),
  });

  expect((await run("navigateNext")).ok).toBe(true);
  expect(part("title").textContent).toBe("Week 2026-08-22");
  expect(String(calendarOf().anchorDate)).toBe("2026-08-22");

  expect((await run("navigatePrevious")).ok).toBe(true);
  expect(part("title").textContent).toBe("Week 2026-08-15");

  expect((await run("navigateToday")).ok).toBe(true);
  expect(part("title").textContent).toBe("Week 2026-08-14");

  expect((await run("goToDate", { date: "2026-09-01" })).ok).toBe(true);
  expect(part("title").textContent).toBe("Week 2026-09-01");

  expect((await run("setView", { view: "agenda" })).ok).toBe(true);
  expect(container.querySelector("[data-active-view]")!.textContent).toBe("agenda 2026-09-01");
  expect(calendarOf().view).toBe("agenda");

  expect((await run("setTimeZone", { timeZone: "Europe/Berlin" })).ok).toBe(true);
  expect(calendarOf().timeZone).toBe("Europe/Berlin");

  expect(changes).toEqual([
    "anchorDate 2026-08-22 imperative agent",
    "anchorDate 2026-08-15 imperative agent",
    "anchorDate 2026-08-14 imperative agent",
    "anchorDate 2026-09-01 imperative agent",
    "view agenda imperative agent",
    "timeZone Europe/Berlin agent",
  ]);

  // The same command from the page is not the agent's: a script's click reads as programmatic.
  part("next-trigger").click();
  await settled();
  expect(changes.at(-1)).toBe("anchorDate 2026-09-02 next-press programmatic");
});

test("a positional argument fails the step with what the action takes", async () => {
  render();

  const outcome = await run("goToDate", "2026-09-01");

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toBe(
    'calendar-agent-invalid-arguments: goToDate takes { date: ISO date }; got "2026-09-01"',
  );
});

test("a controlled calendar follows an agent only through its owner", async () => {
  const [view, setView] = createSignal<"agenda" | "week">("week");
  let accept = false;
  render({
    get view() {
      return view();
    },
    onViewChange: (next) => {
      if (accept) setView(next);
    },
  });

  expect((await run("setView", { view: "agenda" })).ok).toBe(true);
  expect(calendarOf().view).toBe("week");

  accept = true;
  expect((await run("setView", { view: "agenda" })).ok).toBe(true);
  expect(calendarOf().view).toBe("agenda");
});

test("a handler that cancels keeps the calendar where it was", async () => {
  const { container } = render({
    onViewChange: (_value, detail) => {
      if (detail.source === "agent") detail.cancel();
    },
  });

  const outcome = await run("setView", { view: "agenda" });

  expect(outcome.ok).toBe(true);
  expect(container.querySelector("[data-active-view]")!.textContent).toBe("week 2026-08-15");
  expect(calendarOf().view).toBe("week");
});

test("an unknown view fails the step with the registered views", async () => {
  render();

  const outcome = await run("setView", { view: "year" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('"year" is not a registered view');
  expect(outcome.error?.message).toContain('Views: "week", "agenda"');
  expect(calendarOf().view).toBe("week");
});

/** A root whose application applies the agent's changes to its own events, titles included. */
function renderEditable(props: RootProps = {}) {
  const [events, setEvents] = createSignal<readonly Meeting[]>([review]);
  const inputs: string[] = [];
  const results: string[] = [];
  const view = render({
    get events() {
      return events();
    },
    onEventChange: (change, detail) => {
      inputs.push(`${change.cause}:${detail.input}`);
      const title = typeof detail.fields?.title === "string" ? detail.fields.title : undefined;
      if (change.cause === "delete") {
        setEvents((current) => current.filter((event) => event.id !== change.eventId));
      } else if (change.cause === "create") {
        setEvents((current) => [
          ...current,
          { id: `created-${current.length}`, interval: change.proposed, title: title ?? "" },
        ]);
      } else {
        setEvents((current) =>
          current.map((event) =>
            event.id === change.eventId
              ? { ...event, interval: change.proposed, title: title ?? event.title }
              : event,
          ),
        );
      }
    },
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
    ...props,
  });
  return { ...view, events, inputs, results };
}

test("an agent creates an event with a title, updates, moves and resizes it, and selects it", async () => {
  const { events, inputs, results } = renderEditable();

  const created = await value<Record<string, unknown>>("createEvent", {
    end: "2026-08-18",
    start: "2026-08-17",
    title: "Offsite",
  });
  expect(created).toMatchObject({
    cause: "create",
    eventId: null,
    proposed: { end: "2026-08-18", kind: "all-day", start: "2026-08-17" },
    status: "saved",
  });
  expect(events()[1]).toMatchObject({ id: "created-1", title: "Offsite" });

  expect(await value("updateEvent", { eventId: "created-1", title: "Team offsite" })).toMatchObject(
    { cause: "update", status: "saved" },
  );
  expect(
    await value("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" }),
  ).toMatchObject({ cause: "move", status: "saved" });
  expect(
    await value("resizeEvent", { end: "2026-08-16T16:30", eventId: "meeting-1" }),
  ).toMatchObject({ cause: "resize-end", status: "saved" });

  expect(await value("listEvents")).toEqual([
    expect.objectContaining({ id: "created-1", kind: "all-day", title: "Team offsite" }),
    expect.objectContaining({
      end: "2026-08-16T16:30:00+00:00",
      id: "meeting-1",
      start: "2026-08-16T14:00:00+00:00",
    }),
  ]);
  expect(calendarOf().items).toHaveLength(2);

  expect((await run("selectEvent", { eventId: "created-1" })).ok).toBe(true);
  expect(calendarOf().selection).toEqual({ eventId: "created-1", kind: "event" });
  expect(await value("describeCalendar")).toMatchObject({ selectedEventId: "created-1" });

  expect(inputs).toEqual(["create:agent", "update:agent", "move:agent", "resize-end:agent"]);
  expect(results).toEqual([
    "committed:agent",
    "committed:agent",
    "committed:agent",
    "committed:agent",
  ]);
});

test("a handler that rejects a change fails the agent's step with its reason", async () => {
  render({
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
  render({
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

test("a read-only calendar doesn't offer an agent its changes", async () => {
  render();

  const outcome = await run("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(false);
  expect(await value("describeCalendar")).toMatchObject({ readOnly: true });
});

test("a save that takes a while returns where it is, and the result comes after", async () => {
  let finish: (() => void) | undefined;
  const results: string[] = [];
  render({
    onEventChange: () => new Promise<void>((resolve) => (finish = resolve)),
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
  });

  const outcome = await run("moveEvent", { eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(true);
  const change = outcome.steps[0]!.result as { readonly changeId: string; readonly status: string };
  expect(change.status).toBe("saving");
  expect(results).toEqual([]);
  finish?.();
  // The save's promise settles over a few microtasks; a task later it has.
  await new Promise((resolve) => setTimeout(resolve, 0));
  await settled();
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
    render({
      onEventChange: () => new Promise<void>((_resolve, reject) => (fail = reject)),
      onEventChangeResult: (result) => results.push(result.status),
    });

    const change = await value<{ readonly changeId: string; readonly status: string }>(
      "moveEvent",
      { eventId: "meeting-1", start: "2026-08-16T14:00" },
    );
    expect(change.status).toBe("saving");
    fail?.(new Error("offline"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await settled();

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
  render({ onEventChange: () => undefined });

  const outcome = await run("moveEvent", { eventId: "meeting-404", start: "2026-08-16T14:00" });

  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toContain('no event has the ID "meeting-404"');
  expect(outcome.error?.message).toContain('"meeting-1"');
});

test("an agent deletes only where the root lets it", async () => {
  const refusing = renderEditable();

  const refused = await run("deleteEvent", { eventId: "meeting-1" });

  // The bridge doesn't offer an action the calendar hides.
  expect(refused.ok).toBe(false);
  expect(refusing.inputs).toEqual([]);

  cleanup();
  const allowing = renderEditable({ allowAgentDelete: true });

  const allowed = await run("deleteEvent", { eventId: "meeting-1" });

  expect(allowed.ok).toBe(true);
  expect(allowing.inputs).toEqual(["delete:agent"]);
  expect(allowing.events()).toEqual([]);
  // The bridge leaves out an empty item list.
  expect(calendarOf().items ?? []).toEqual([]);
});

/** The application's own button, a ui-sdk one an agent can press, that deletes the review. */
function RemoveButton() {
  const actions = Calendar.useCalendarActions();
  return createComponent(Button, {
    children: "Remove review",
    onClick: () => void actions.proposeEventChange({ cause: "delete", eventId: "meeting-1" }),
  });
}

function renderWithButton(props: RootProps) {
  return mount(() =>
    createComponent(
      CalendarRoot,
      merge(props, {
        get children() {
          return [createComponent(RemoveButton, {}), createComponent(Chrome, {})];
        },
      }),
    ),
  );
}

async function press(ref: string) {
  const outcome = await agent.act({ steps: [{ action: "press", ref }] });
  await settled();
  return outcome;
}

test("a change an agent causes by pressing the application's button is the agent's", async () => {
  const seen: string[] = [];
  const results: string[] = [];
  renderWithButton({
    allowAgentDelete: true,
    onEventChange: () => undefined,
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
    policies: [
      (_change, { detail }) => {
        seen.push(detail?.input ?? "none");
        return { type: "accept" };
      },
    ],
  });

  expect((await press("Remove review")).ok).toBe(true);

  expect(seen).toEqual(["agent"]);
  expect(results).toEqual(["committed:agent"]);
});

test("an agent's press can't delete where the root doesn't let agents delete", async () => {
  const deleted: string[] = [];
  const results: string[] = [];
  const view = renderWithButton({
    onEventChange: (change) => void deleted.push(change.cause),
    onEventChangeResult: (result, detail) =>
      results.push(
        `${result.status}:${result.status === "rejected" ? result.reason : ""}:${detail.input}`,
      ),
  });

  await press("Remove review");

  expect(deleted).toEqual([]);
  expect(results).toEqual(["rejected:agent-delete-not-allowed:agent"]);

  // A person's click on the same button still deletes.
  view.container.querySelector("button")!.click();
  await settled();
  expect(deleted).toEqual(["delete"]);
});

test("query lists the visible events within the calendar, labelled as the root formats them", async () => {
  render({ formatAgentEventLabel: (event) => `${event.title} (${event.start})` });

  const found = await agent.query({ within: calendarOf().ref });

  expect(found).toEqual([
    expect.objectContaining({
      items: [{ label: "Architecture review (2026-08-15T09:00:00+00:00)", value: "meeting-1" }],
    }),
  ]);
});

test("a calendar that leaves the page leaves the snapshot", () => {
  const view = render();
  expect(calendarOf().label).toBe("Team calendar");

  view.dispose();

  expect(
    agent
      .snapshot()
      .filter((component) => component.component === "calendar" && component.offPage !== true),
  ).toEqual([]);
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
  const unregister = registerTools(agent, { allow: () => true });
  await Promise.resolve();
  expect([...tools.keys()].toSorted()).toEqual(["act", "query", "snapshot"]);
  unregister();
});
