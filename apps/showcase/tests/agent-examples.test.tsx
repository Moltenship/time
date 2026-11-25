// @vitest-environment jsdom

import type Anthropic from "@anthropic-ai/sdk";
import { createAgent } from "@ui-sdk/react/agent";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { agent } from "../content/examples/agent";
import { AgentReadyCalendar } from "../content/examples/agent-calendar";
import { AuditedCalendar } from "../content/examples/agent-audit";
import { agent as askingAgent, deleteRequest } from "../content/examples/agent-confirm";
import { RemoveMeeting } from "../content/examples/agent-delete-button";
import { applyChange } from "../content/examples/agent-save";
import { Calendar, meetings, weekRules } from "../content/examples/calendar";
import { ConfirmingCalendar } from "../content/examples/agent-confirm-calendar";
import { PrivateCalendar } from "../content/examples/agent-hidden";
import { agent as limitedAgent, setAgentAccess } from "../content/examples/agent-permissions";
import { SavedCalendar } from "../content/examples/agent-slow-save";
import { deleteEvent, stop } from "../content/examples/agent-stop";
import { runToolCall } from "../content/examples/agent-tool-call";
import { hasWebMcp, registerCalendarTools } from "../content/examples/agent-webmcp";
import { WeekOnlyForAgents } from "../content/examples/agent-week-only";
import { TrackedCalendar } from "../content/examples/state-change-detail";

// The agent guides' examples, driven the way the pages drive them: through the real bridge.

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

type Bridge = typeof agent;
type Outcome = Awaited<ReturnType<Bridge["act"]>>;

interface Entry {
  readonly actions?: readonly string[];
  /** A `Temporal.PlainDate` on the page, and an ISO date once the snapshot is sent as JSON. */
  readonly anchorDate?: Temporal.PlainDate;
  readonly component: string;
  readonly items?: readonly { readonly label: string; readonly value: string }[];
  readonly label?: string;
  readonly timeZone?: string;
  readonly view?: string;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // A wide screen, so the week view keeps its seven columns.
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
    },
  );
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  setAgentAccess("navigate");
});

async function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

/** The calendar on the page, as the bridge lists it. */
function calendar(bridge: Bridge = agent): Entry {
  const entries = bridge.snapshot() as readonly (Entry & { readonly offPage?: boolean })[];
  const found = entries.find((entry) => entry.component === "calendar" && entry.offPage !== true);
  if (found === undefined) throw new Error("The bridge lists no calendar.");
  return found;
}

// Node formats times with narrow no-break spaces, which read the same and compare differently.
const plain = (text: string | undefined) => text?.replace(/[\u00a0\u2009\u202f]/gu, " ");

const labelOf = (id: string, bridge?: Bridge) =>
  plain(calendar(bridge).items?.find((item) => item.value === id)?.label);

/** An action and the one object it takes, if it takes any. */
type Step = readonly [action: string, input?: Readonly<Record<string, unknown>>];

async function runOn(bridge: Bridge, ref: string, ...steps: readonly Step[]): Promise<Outcome> {
  let outcome: Outcome | undefined;
  await act(async () => {
    outcome = await bridge.act({
      steps: steps.map(([action, input]) => ({
        action,
        args: input === undefined ? [] : [input],
        ref,
      })),
    });
  });
  return outcome!;
}

const run = (bridge: Bridge, ...steps: readonly Step[]) => runOn(bridge, "Team calendar", ...steps);

/** What the call's last step returned: an action's own answer, such as a change or a list. */
const resultOf = (outcome: Outcome) => outcome.steps.at(-1)?.result;

const toFriday = ["moveEvent", { eventId: "review", start: "2026-10-09T10:00" }] as const;
const reviewAt = (start: string, end: string) =>
  `Design review · 2026-10-${start} to 2026-10-${end} (Europe/Berlin)`;

async function click(element: Element | null | undefined) {
  if (element === null || element === undefined) throw new Error("Nothing to click.");
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const button = (container: Element, text: string) =>
  [...container.querySelectorAll("button")].find((element) => element.textContent === text);

test("the bridge lists the calendar with its name, state, actions and visible events", async () => {
  await render(<AgentReadyCalendar />);

  expect(JSON.parse(JSON.stringify(calendar()))).toMatchObject({
    anchorDate: "2026-10-08",
    component: "calendar",
    label: "Team calendar",
    timeZone: "Europe/Berlin",
    view: "week",
  });
  // Every action but `deleteEvent`, which this calendar doesn't offer.
  expect(calendar().actions).toEqual([
    "createEvent",
    "describeCalendar",
    "getChange",
    "goToDate",
    "listEvents",
    "moveEvent",
    "navigateNext",
    "navigatePrevious",
    "navigateToday",
    "resizeEvent",
    "selectEvent",
    "setTimeZone",
    "setView",
    "updateEvent",
  ]);
  expect(labelOf("review")).toBe(reviewAt("08T15:00", "08T16:00"));
});

test("an agent reads the calendar's facts and its events before it changes anything", async () => {
  await render(<AgentReadyCalendar />);

  const described = resultOf(await run(agent, ["describeCalendar"]));
  expect(described).toMatchObject({
    canDelete: false,
    locale: "en-US",
    pendingChanges: [],
    readOnly: false,
    selectedEventId: null,
    timeZone: "Europe/Berlin",
    view: "week",
    views: ["week", "day", "month", "agenda"],
    visibleRange: { end: "2026-10-12", start: "2026-10-05" },
  });
  const { actions, today } = described as {
    readonly actions: Readonly<Record<string, string>>;
    readonly today: string;
  };
  // Each action the calendar offers, with what it takes: what the bridge's tools can't say.
  expect(Object.keys(actions).toSorted()).toEqual(calendar().actions);
  expect(actions.moveEvent).toBe(
    "{ eventId: ID, start: ISO date or date-time, end?: same, resourceIds?: ID[] }",
  );
  expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/u);

  expect(resultOf(await run(agent, ["listEvents"]))).toContainEqual({
    end: "2026-10-08T16:00:00+02:00",
    id: "review",
    kind: "timed",
    resourceIds: [],
    start: "2026-10-08T15:00:00+02:00",
    title: "Design review",
  });
  // A range of its own, out of view: Friday only.
  const friday = resultOf(
    await run(agent, ["listEvents", { end: "2026-10-10", start: "2026-10-09" }]),
  );
  expect(friday).toMatchObject([{ id: "one-on-one" }]);
});

test("an agent's steps navigate, move a meeting, name a new one and rename another", async () => {
  await render(<AgentReadyCalendar />);

  const navigated = await run(agent, ["navigateNext"], ["setView", { view: "month" }]);
  expect(navigated.ok).toBe(true);
  expect(String(calendar().anchorDate)).toBe("2026-10-15");
  expect(calendar().view).toBe("month");

  await run(agent, ["setView", { view: "week" }], ["goToDate", { date: "2026-10-08" }]);
  // The app saved at once, so the step returns the change as saved.
  expect(resultOf(await run(agent, toFriday))).toEqual({
    cause: "move",
    changeId: expect.any(String),
    eventId: "review",
    proposed: {
      end: "2026-10-09T11:00:00+02:00",
      kind: "timed",
      resourceIds: [],
      start: "2026-10-09T10:00:00+02:00",
    },
    status: "saved",
  });
  expect(labelOf("review")).toBe(reviewAt("09T10:00", "09T11:00"));

  // The title reaches the app as `detail.fields.title`, and the app's handler stores it.
  const created = await run(agent, [
    "createEvent",
    { end: "2026-10-06T15:00", start: "2026-10-06T14:00", title: "Customer call" },
  ]);
  expect(resultOf(created)).toMatchObject({ cause: "create", eventId: null, status: "saved" });
  expect(calendar().items?.map(({ label }) => label)).toContain(
    "Customer call · 2026-10-06T14:00 to 2026-10-06T15:00 (Europe/Berlin)",
  );

  const renamed = await run(agent, [
    "updateEvent",
    { eventId: "lunch", title: "Team lunch at the canteen" },
  ]);
  expect(resultOf(renamed)).toMatchObject({ cause: "update", eventId: "lunch", status: "saved" });
  expect(labelOf("lunch")).toBe(
    "Team lunch at the canteen · 2026-10-07T12:30 to 2026-10-07T13:30 (Europe/Berlin)",
  );

  // A change the agent asks about later is still there by its ID.
  const { changeId } = resultOf(renamed) as { readonly changeId: string };
  expect(resultOf(await run(agent, ["getChange", { changeId }]))).toEqual(resultOf(renamed));
});

test("positional arguments fail with what the action takes", async () => {
  await render(<AgentReadyCalendar />);

  let outcome: Outcome | undefined;
  await act(async () => {
    outcome = await agent.act({
      steps: [{ action: "moveEvent", args: ["review", "2026-10-09T10:00"], ref: "Team calendar" }],
    });
  });

  expect(outcome?.error?.message).toBe(
    "calendar-agent-invalid-arguments: moveEvent takes { eventId: ID, start: ISO date or date-time, end?: same, resourceIds?: ID[] }; it takes one object, not 2 arguments",
  );
});

test("a calendar that doesn't let agents delete has no deleteEvent action", async () => {
  await render(<AgentReadyCalendar />);

  const outcome = await run(agent, ["deleteEvent", { eventId: "lunch" }]);

  expect(calendar().actions).not.toContain("deleteEvent");
  expect(outcome.ok).toBe(false);
  expect(outcome.error?.message).toMatch(/^calendar c\d+ takes no deleteEvent now\. It takes: /u);
  expect(labelOf("lunch")).toBeDefined();
});

test("allow decides each step from the access the person chose", async () => {
  await render(<AgentReadyCalendar />);
  const shownWeek = ["goToDate", { date: "2026-10-08" }] as const;

  // The default: navigate, not edit.
  expect((await run(limitedAgent, ["navigateNext"], shownWeek)).ok).toBe(true);
  const refused = await run(limitedAgent, toFriday);
  expect(refused.error?.message).toMatch(/^The app refused moveEvent on c\d+\.$/u);
  expect(labelOf("review", limitedAgent)).toBe(reviewAt("08T15:00", "08T16:00"));

  setAgentAccess("read");
  expect((await run(limitedAgent, ["navigateNext"])).ok).toBe(false);
  // The reading actions are steps, and this bridge allows them at every level.
  expect((await run(limitedAgent, ["describeCalendar"], ["listEvents"])).ok).toBe(true);
  // The bridge's own snapshot isn't a step.
  expect(calendar(limitedAgent).items?.length).toBeGreaterThan(0);

  setAgentAccess("edit");
  await run(limitedAgent, shownWeek);
  expect(resultOf(await run(limitedAgent, toFriday))).toMatchObject({ status: "saved" });
  expect(labelOf("review", limitedAgent)).toBe(reviewAt("09T10:00", "09T11:00"));
  const zone = await run(limitedAgent, ["setTimeZone", { timeZone: "America/New_York" }]);
  expect(zone.ok).toBe(false);
  expect(calendar(limitedAgent).timeZone).toBe("Europe/Berlin");
});

test("the log names who made a change, a policy refuses the agent, and undo takes it back", async () => {
  const log: string[] = [];
  const container = await render(<AuditedCalendar onLog={(line) => log.push(line)} />);

  await run(agent, toFriday);
  expect(log).toEqual(["agent moved review"]);

  // Saturday. The step fails with the policy's reason, and the result handler hears it once.
  const refused = await run(agent, [
    "moveEvent",
    { eventId: "standup", start: "2026-10-10T09:00" },
  ]);
  expect(refused.error?.message).toBe("calendar-event-change-rejected: agents-book-weekdays-only");
  expect(labelOf("standup")).toBe("Standup · 2026-10-08T09:00 to 2026-10-08T09:15 (Europe/Berlin)");
  expect(log).toEqual(["agent moved review", "agent was refused: agents-book-weekdays-only"]);

  await run(agent, ["updateEvent", { eventId: "lunch", title: "Lunch" }]);
  expect(log.at(-1)).toBe("agent updated lunch");

  await run(agent, ["setView", { view: "month" }]);
  expect(log.at(-1)).toBe("agent switched to the month view");
  await run(agent, ["setView", { view: "week" }]);

  // The newest of the agent's changes first: the rename, then the move.
  await click(button(container, "Undo the agent"));
  expect(labelOf("lunch")).toContain("Team lunch · ");
  await click(button(container, "Undo the agent"));
  expect(labelOf("review")).toBe(reviewAt("08T15:00", "08T16:00"));
  // The undo is the app's own proposal, not the agent's.
  expect(log.at(-1)).toBe("api moved review");
});

test("a delete waits for the person, and their answer decides it", async () => {
  const container = await render(<ConfirmingCalendar />);
  const total = calendar(askingAgent).items?.length ?? 0;
  const ask = () => container.querySelector('[role="alertdialog"]');

  let first: Promise<Outcome> | undefined;
  await act(async () => {
    first = askingAgent.act({
      steps: [{ action: "deleteEvent", args: [{ eventId: "lunch" }], ref: "Team calendar" }],
    });
    await Promise.resolve();
  });
  expect(ask()?.textContent).toContain("Team lunch");
  await click(button(ask()!, "Keep it"));
  let kept: Outcome | undefined;
  await act(async () => {
    kept = await first;
  });
  expect(kept?.ok).toBe(false);
  expect(calendar(askingAgent).items).toHaveLength(total);
  expect(ask()).toBeNull();

  let second: Promise<Outcome> | undefined;
  await act(async () => {
    second = askingAgent.act({
      steps: [{ action: "deleteEvent", args: [{ eventId: "lunch" }], ref: "Team calendar" }],
    });
    await Promise.resolve();
  });
  await click(button(ask()!, "Delete"));
  let deleted: Outcome | undefined;
  await act(async () => {
    deleted = await second;
  });
  expect(deleted?.ok).toBe(true);
  expect(resultOf(deleted!)).toMatchObject({
    cause: "delete",
    eventId: "lunch",
    proposed: null,
    status: "saved",
  });
  expect(calendar(askingAgent).items).toHaveLength(total - 1);
  expect(labelOf("lunch", askingAgent)).toBeUndefined();
});

test("a calendar that doesn't let agents delete fails the step before anyone is asked", async () => {
  await render(<AgentReadyCalendar />);

  // This bridge asks the person about every delete, and holds the step until they answer.
  const outcome = await run(askingAgent, ["deleteEvent", { eventId: "lunch" }]);

  expect(outcome.error?.message).toMatch(/^calendar c\d+ takes no deleteEvent now\./u);
  expect(deleteRequest.getSnapshot()).toBeNull();
});

/** A calendar with the app's own delete button beside it, and what its handlers heard. */
function WithRemoveButton({
  allowAgentDelete,
  heard,
}: {
  readonly allowAgentDelete?: boolean;
  readonly heard: string[];
}) {
  const [current, setCurrent] = useState(meetings);
  const lunch = current.find((meeting) => meeting.id === "lunch");
  return (
    <Calendar.Root
      label="Team calendar"
      allowAgentDelete={allowAgentDelete}
      events={current}
      onEventChange={(change, detail) => {
        heard.push(`saved ${change.cause} as ${detail.input}`);
        setCurrent((now) => applyChange(now, change, detail));
      }}
      onEventChangeResult={(result, detail) => {
        if (result.status === "rejected") heard.push(`${result.reason} as ${detail.input}`);
      }}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Title />
        {lunch === undefined ? null : <RemoveMeeting meeting={lunch} />}
      </Calendar.Frame>
    </Calendar.Root>
  );
}

test("a delete button of the app's, pressed by an agent, deletes as the agent or not at all", async () => {
  const steps: string[] = [];
  const pressing = createAgent({
    allow: ({ action, component }) => {
      steps.push(`${action} on ${component}`);
      return true;
    },
  });
  const press = async () => {
    let outcome: Outcome | undefined;
    await act(async () => {
      outcome = await pressing.act({ steps: [{ action: "press", ref: "Remove Team lunch" }] });
    });
    return outcome!;
  };

  // Without `allowAgentDelete`: the press runs, and the calendar refuses the delete it proposes.
  const heard: string[] = [];
  const container = await render(<WithRemoveButton heard={heard} />);
  expect((await press()).ok).toBe(true);
  expect(steps).toEqual(["press on button"]);
  expect(heard).toEqual(["agent-delete-not-allowed as agent"]);
  expect(labelOf("lunch", pressing)).toContain("Team lunch · ");

  // A person's click on the same button deletes, as the app's own proposal.
  await click(button(container, "Remove Team lunch"));
  expect(heard.at(-1)).toBe("saved delete as api");
  expect(labelOf("lunch", pressing)).toBeUndefined();
  await cleanup?.();

  // With it, the press deletes, and the handler hears the agent.
  const allowed: string[] = [];
  await render(<WithRemoveButton allowAgentDelete heard={allowed} />);
  expect((await press()).ok).toBe(true);
  expect(allowed).toEqual(["saved delete as agent"]);
  expect(labelOf("lunch", pressing)).toBeUndefined();
});

test("registerTools hands a browser with WebMCP three tools, with an allow of their own", async () => {
  await render(<AgentReadyCalendar />);
  expect(hasWebMcp()).toBe(false);
  // Without WebMCP, registering does nothing and still returns a function.
  expect(registerCalendarTools()).toBeTypeOf("function");

  interface Tool {
    readonly annotations: Record<string, boolean>;
    readonly execute: (input: unknown) => Promise<Outcome>;
    readonly name: string;
  }
  const tools: Tool[] = [];
  Object.defineProperty(document, "modelContext", {
    configurable: true,
    value: {
      registerTool(tool: Tool) {
        tools.push(tool);
        return Promise.resolve();
      },
    },
  });
  try {
    expect(hasWebMcp()).toBe(true);
    const unregister = registerCalendarTools();

    expect(tools.map(({ name }) => name)).toEqual(["snapshot", "act", "query"]);
    expect(tools[1]!.annotations).toMatchObject({ consequentialHint: true, readOnlyHint: false });

    const step = (action: string, input?: Readonly<Record<string, unknown>>) => ({
      steps: [{ action, args: input === undefined ? [] : [input], ref: "Team calendar" }],
    });
    let navigated: Outcome | undefined;
    let zone: Outcome | undefined;
    await act(async () => {
      navigated = await tools[1]!.execute(step("navigateNext"));
      zone = await tools[1]!.execute(step("setTimeZone", { timeZone: "America/New_York" }));
    });
    expect(navigated?.ok).toBe(true);
    expect(String(calendar().anchorDate)).toBe("2026-10-15");
    expect(zone?.error?.message).toMatch(/^The app refused setTimeZone on c\d+\.$/u);
    expect(calendar().timeZone).toBe("Europe/Berlin");
    unregister();
  } finally {
    delete (document as { modelContext?: unknown }).modelContext;
  }
});

test("runToolCall runs a model's tool call on the page and wraps the result", async () => {
  await render(<AgentReadyCalendar />);
  const call = (name: string, input: unknown, id: string) =>
    ({ id, input, name, type: "tool_use" }) as Anthropic.ToolUseBlock;

  let read: Anthropic.ToolResultBlockParam | undefined;
  let moved: Anthropic.ToolResultBlockParam | undefined;
  let unknown: Anthropic.ToolResultBlockParam | undefined;
  await act(async () => {
    read = await runToolCall(call("snapshot", {}, "toolu_1"));
    moved = await runToolCall(
      call(
        "act",
        {
          steps: [
            {
              action: "moveEvent",
              args: [{ eventId: "review", start: "2026-10-09T10:00" }],
              ref: "Team calendar",
            },
          ],
        },
        "toolu_2",
      ),
    );
    unknown = await runToolCall(call("remove", {}, "toolu_3"));
  });

  expect(read).toMatchObject({ tool_use_id: "toolu_1", type: "tool_result" });
  // The toolbar's buttons and view select are listed too, so the calendar isn't always first.
  expect(JSON.parse(read!.content as string)).toContainEqual(
    expect.objectContaining({ component: "calendar" }),
  );
  // The model reads the change and its status in the tool result.
  expect(JSON.parse(moved!.content as string)).toMatchObject({
    ok: true,
    steps: [{ result: { cause: "move", eventId: "review", status: "saved" } }],
  });
  expect(labelOf("review")).toBe(reviewAt("09T10:00", "09T11:00"));
  expect(unknown).toMatchObject({ is_error: true, tool_use_id: "toolu_3" });
});

test("a calendar inside data-agent-hidden is kept from agents", async () => {
  await render(<PrivateCalendar />);

  const listed = (agent.snapshot() as readonly Entry[]).filter(
    (entry) => entry.label === "Private calendar",
  );
  expect(listed).toEqual([]);
  const outcome = await runOn(agent, "Private calendar", ["navigateNext"]);
  expect(outcome.error?.message).toBe(
    '"Private calendar" isn\'t available to agents here. Ask the person.',
  );
});

test("a cancelled state change leaves the step ok, with no change in it", async () => {
  await render(<WeekOnlyForAgents />);

  const month = await run(agent, ["setView", { view: "month" }]);
  expect(month).toMatchObject({ ok: true });
  expect(month.steps[0]).not.toHaveProperty("changes");
  expect(calendar().view).toBe("week");

  const day = await run(agent, ["setView", { view: "day" }]);
  expect(day.steps[0]).toMatchObject({ changes: [{ key: "view", value: "day" }] });
});

test("a save that takes a while returns the change as saving, and getChange says how it ended", async () => {
  let settle: { readonly fail: (error: Error) => void; readonly land: () => void } | undefined;
  const failed: string[] = [];
  await render(
    <SavedCalendar
      onAgentSaveFailed={(change) => failed.push(String(change.eventId))}
      save={() =>
        new Promise<void>((land, fail) => {
          settle = { fail, land };
        })
      }
    />,
  );
  // This calendar has a name of its own, since it shares a page with the audited one.
  const run = (bridge: Bridge, ...steps: readonly Step[]) => runOn(bridge, "Bookings", ...steps);
  const statusOf = async (changeId: string) =>
    resultOf(await run(agent, ["getChange", { changeId }]));

  const moved = resultOf(await run(agent, toFriday)) as { readonly changeId: string };
  expect(moved).toMatchObject({ cause: "move", eventId: "review", status: "saving" });
  // While it saves, the calendar's description lists it and the event reads as pending.
  expect(resultOf(await run(agent, ["describeCalendar"]))).toMatchObject({
    pendingChanges: [{ changeId: moved.changeId, status: "saving" }],
  });
  expect(resultOf(await run(agent, ["listEvents"]))).toContainEqual(
    expect.objectContaining({ id: "review", pending: true, start: "2026-10-09T10:00:00+02:00" }),
  );

  await act(async () => settle?.land());
  expect(await statusOf(moved.changeId)).toMatchObject({ status: "saved" });
  expect(labelOf("review")).toBe(reviewAt("09T10:00", "09T11:00"));
  expect(failed).toEqual([]);

  // A save that fails after the step returned: the agent reads why, and so does the app.
  const second = resultOf(
    await run(agent, ["moveEvent", { eventId: "standup", start: "2026-10-09T08:00" }]),
  ) as { readonly changeId: string };
  await act(async () => settle?.fail(new Error("The server is down")));
  expect(await statusOf(second.changeId)).toMatchObject({
    reason: "handler-error",
    status: "rejected",
  });
  expect(labelOf("standup")).toBe("Standup · 2026-10-08T09:00 to 2026-10-08T09:15 (Europe/Berlin)");
  expect(failed).toEqual(["standup"]);
});

test("stopping the turn ends a delete that waits for the person", async () => {
  const container = await render(<ConfirmingCalendar />);
  const total = calendar(askingAgent).items?.length ?? 0;

  let waiting: Promise<Outcome> | undefined;
  await act(async () => {
    waiting = deleteEvent("lunch");
    await Promise.resolve();
  });
  expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

  let stopped: Outcome | undefined;
  await act(async () => {
    stop();
    stopped = await waiting;
  });
  expect(stopped?.error?.message).toMatch(/^deleteEvent on c\d+ was cancelled\.$/u);
  expect(container.querySelector('[role="alertdialog"]')).toBeNull();
  expect(calendar(askingAgent).items).toHaveLength(total);
});

test("a state handler hears why a value changed and who asked", async () => {
  const entries: string[] = [];
  const container = await render(<TrackedCalendar track={(entry) => entries.push(entry)} />);

  await click(container.querySelector('[data-calendar-part="next-trigger"]'));
  await run(agent, ["goToDate", { date: "2026-11-02" }], ["setView", { view: "month" }]);

  // A click a script dispatches isn't a person's, so it reads "programmatic"; a real one reads
  // "mouse", "touch" or "pen".
  expect(entries).toEqual([
    "next-press by programmatic to 2026-10-15",
    "imperative by agent to 2026-11-02",
  ]);
  // The handler cancelled the agent's switch to the month view.
  expect(calendar().view).toBe("week");
});
