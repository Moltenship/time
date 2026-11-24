// @vitest-environment jsdom
import "./setup";

import { withSource } from "@ui-sdk/core/observe";
import { checkServer, mount } from "@ui-sdk/core/testing";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAgentActions, type CalendarPrimitiveOptions } from "../src/index";
import { calendar, host, type HostProps } from "./harness";

const markup = `<root aria-label="Team calendar">
  <toolbar>
    <previous-trigger>Previous</previous-trigger>
    <title>Week</title>
    <next-trigger>Next</next-trigger>
    <today-trigger>Today</today-trigger>
  </toolbar>
  <viewport></viewport>
</root>`;

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

/** A root driven by the framework-free host, with the primitive mounted over its markup. */
function setup(
  props: HostProps = {},
  extra: Pick<CalendarPrimitiveOptions, "allowAgentDelete" | "formatAgentEventLabel"> = {},
) {
  // The root and the primitive hear the same option, as Root passes it to both.
  const root = host(
    extra.allowAgentDelete === undefined
      ? props
      : { ...props, allowAgentDelete: extra.allowAgentDelete },
  );
  const view = mount(calendar, { ...extra, runtime: root.runtime, ...root.model.state }, markup);
  cleanups.push(
    () => view.unmount(),
    () => root.dispose(),
  );
  return { root, view };
}

test("renders on the server without reading browser globals", () => {
  const root = host();
  cleanups.push(() => root.dispose());

  const html = checkServer(calendar, { runtime: root.runtime, ...root.model.state }, markup);

  expect(html).toContain('data-slot="calendar"');
  expect(html).toContain('data-slot="calendar-next-trigger"');
});

test("the instance mirrors the state it is given and owns none of it", () => {
  const { root, view } = setup();

  expect(view.state).toMatchObject({ timeZone: "UTC", view: "week" });
  expect(view.state.anchorDate.toString()).toBe("2026-08-15");

  view.api.setView({ view: "agenda" });

  // The store changed; the instance waits for the adapter to pass the new state.
  expect(root.model.state.view).toBe("agenda");
  expect(view.state.view).toBe("week");
});

test("a trigger's press runs its command with the press's reason and source", async () => {
  const onAnchorDateChange = vi.fn();
  const { root, view } = setup({ handlers: { onAnchorDateChange } });

  await view.click(view.part("next-trigger")!);
  expect(root.model.state.anchorDate.toString()).toBe("2026-08-22");
  expect(onAnchorDateChange).toHaveBeenLastCalledWith(
    Temporal.PlainDate.from("2026-08-22"),
    expect.objectContaining({ reason: "next-press", source: "mouse" }),
  );

  await view.click(view.part("previous-trigger")!);
  await view.click(view.part("previous-trigger")!);
  expect(root.model.state.anchorDate.toString()).toBe("2026-08-08");
  expect(onAnchorDateChange).toHaveBeenLastCalledWith(
    Temporal.PlainDate.from("2026-08-08"),
    expect.objectContaining({ reason: "previous-press" }),
  );

  await view.click(view.part("today-trigger")!);
  expect(root.model.state.anchorDate.toString()).toBe("2026-08-14");
  expect(onAnchorDateChange).toHaveBeenLastCalledWith(
    Temporal.PlainDate.from("2026-08-14"),
    expect.objectContaining({ reason: "today-press" }),
  );
});

/** Lets the instance finish being made, after which unavailable actions hide. */
const made = () => Promise.resolve();

test("the agent's actions are the agent's, whatever calls them", () => {
  const sources: string[] = [];
  const { root, view } = setup({
    handlers: {
      onAnchorDateChange: (_value, detail) => sources.push(`anchorDate:${detail.source}`),
      onSelectionChange: (_value, detail) => sources.push(`selection:${detail.source}`),
      onTimeZoneChange: (_value, detail) => sources.push(`timeZone:${detail.source}`),
      onViewChange: (_value, detail) => sources.push(`view:${detail.source}`),
    },
  });

  view.api.navigateNext();
  view.api.goToDate({ date: "2026-09-01" });
  view.api.setView({ view: "agenda" });
  view.api.setTimeZone({ timeZone: "Europe/Berlin" });
  view.api.selectEvent({ eventId: "meeting-1" });

  expect(root.model.state).toMatchObject({
    selection: { eventId: "meeting-1", kind: "event" },
    timeZone: "Europe/Berlin",
    view: "agenda",
  });
  expect(root.model.state.anchorDate.toString()).toBe("2026-09-01");
  expect(sources).toEqual([
    "anchorDate:agent",
    "anchorDate:agent",
    "view:agent",
    "timeZone:agent",
    "selection:agent",
  ]);
  // The parts' own commands aren't agent actions.
  expect(calendarAgentActions).not.toContain("showNext");
  expect(calendarAgentActions).not.toContain("selectView");

  view.api.selectEvent({ eventId: null });
  expect(root.model.state.selection).toBeNull();
});

test("a date in another calendar than ISO is refused wherever an agent gives one", () => {
  const onAnchorDateChange = vi.fn();
  const onEventChange = vi.fn();
  const { root, view } = setup({ handlers: { onAnchorDateChange }, onEventChange });
  const refused = 'in the "hebrew" calendar';

  expect(() => view.api.goToDate({ date: "2026-08-20[u-ca=hebrew]" })).toThrow(
    `calendar-agent-unsupported-calendar: date is ${refused}`,
  );
  expect(() => view.api.listEvents({ end: "2026-08-21[!u-ca=hebrew]" })).toThrow(refused);
  expect(() =>
    view.api.createEvent!({ end: "2026-08-21[u-ca=hebrew]", start: "2026-08-20" }),
  ).toThrow(`end is ${refused}`);
  expect(() =>
    view.api.createEvent!({ end: "2026-08-20T11:00", start: "2026-08-20T10:00Z[u-ca=hebrew]" }),
  ).toThrow(`start is ${refused}`);
  expect(() =>
    view.api.moveEvent!({
      eventId: "meeting-1",
      start: "2026-08-20T10:00[Europe/Berlin][u-ca=hebrew]",
    }),
  ).toThrow(refused);
  expect(onAnchorDateChange).not.toHaveBeenCalled();
  expect(onEventChange).not.toHaveBeenCalled();

  // ISO, said out loud, is ISO; a wall-clock time stays in the calendar's zone.
  view.api.goToDate({ date: "2026-08-20[u-ca=iso8601]" });
  expect(root.model.state.anchorDate.calendarId).toBe("iso8601");
  expect(
    view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00[u-ca=iso8601]" }),
  ).toMatchObject({ proposed: { start: "2026-08-16T14:00:00+00:00" } });
});

test("an agent's resource IDs must be the calendar's, where it has resources", () => {
  const onEventChange = vi.fn();
  const { view } = setup({
    onEventChange,
    resources: [
      { id: "room-a", title: "Room A" },
      { id: 7, title: "Room 7" },
    ],
  });

  expect(() =>
    view.api.createEvent!({
      end: "2026-08-16T11:00",
      resourceIds: ["room-z"],
      start: "2026-08-16T10:00",
    }),
  ).toThrow(
    'calendar-agent-unknown-resource: no resource has the ID "room-z". Resources: "room-a", 7',
  );
  expect(() =>
    view.api.moveEvent!({
      eventId: "meeting-1",
      resourceIds: ["room-z"],
      start: "2026-08-16T14:00",
    }),
  ).toThrow("calendar-agent-unknown-resource");
  expect(() =>
    view.api.updateEvent!({ eventId: "meeting-1", resourceIds: ["room-a", "room-z"] }),
  ).toThrow("calendar-agent-unknown-resource");
  expect(onEventChange).not.toHaveBeenCalled();

  // A known ID, also a number given as a string, reaches the application as the calendar's.
  view.api.moveEvent!({ eventId: "meeting-1", resourceIds: ["7"], start: "2026-08-16T14:00" });
  expect(onEventChange.mock.calls[0]![0].proposed.resourceIds).toEqual([7]);
});

test("a calendar without resources takes the resource IDs an agent gives", () => {
  const onEventChange = vi.fn();
  const { view } = setup({ onEventChange });

  view.api.moveEvent!({ eventId: "meeting-1", resourceIds: ["room-z"], start: "2026-08-16T14:00" });

  expect(onEventChange.mock.calls[0]![0].proposed.resourceIds).toEqual(["room-z"]);
});

test("bad arguments fail with what was expected", () => {
  const { root, view } = setup({ onEventChange: vi.fn() });
  const api = view.api as unknown as Record<string, (...args: unknown[]) => unknown>;

  expect(() => view.api.setView({ view: "year" as "week" })).toThrow(
    'calendar-unknown-view: "year" is not a registered view. Views: "week", "agenda"',
  );
  expect(() => view.api.goToDate({ date: "next tuesday" })).toThrow("calendar-agent-invalid-date");
  expect(() => view.api.setTimeZone({ timeZone: "Mars/Olympus" })).toThrow(
    "calendar-agent-invalid-time-zone",
  );
  expect(() => view.api.moveEvent!({ eventId: "meeting-404", start: "2026-08-16T14:00" })).toThrow(
    'no event has the ID "meeting-404". Events: "meeting-1"',
  );
  // Positional arguments, as the 1.x actions took, say what the action takes now.
  expect(() => api.goToDate!("2026-09-01")).toThrow(
    'calendar-agent-invalid-arguments: goToDate takes { date: ISO date }; got "2026-09-01"',
  );
  expect(() => api.moveEvent!("meeting-1", "2026-08-16T14:00")).toThrow(
    "calendar-agent-invalid-arguments: moveEvent takes { eventId: ID, start:",
  );
  expect(() => api.setView!({ view: "week" }, "extra")).toThrow("not 2 arguments");
  expect(() => api.setView!({ name: "week" })).toThrow('it has no "name"');
  expect(() => api.createEvent!({ start: "2026-08-16" })).toThrow("end is missing");
  expect(() => api.selectEvent!({})).toThrow("eventId is missing");
  expect(() => api.goToDate!({ date: null })).toThrow("date can't be null");
  expect(() => api.navigateNext!("soon")).toThrow("navigateNext takes nothing");
  expect(() => api.navigateNext!({})).not.toThrow();
  expect(() => api.selectEvent!({ eventId: { id: 1 } })).toThrow("eventId must be an event's ID");
  expect(() => api.updateEvent!({ eventId: "meeting-1" })).toThrow("updateEvent changes something");
  expect(() =>
    api.resizeEvent!({
      end: "2026-08-15T11:00Z",
      eventId: "meeting-1",
      start: "2026-08-15T08:00Z",
    }),
  ).toThrow("resizeEvent takes one of start and end");
  expect(() => api.updateEvent!({ eventId: "meeting-1", title: 3 })).toThrow(
    "title must be a string, not 3",
  );
  expect(() =>
    api.updateEvent!({ eventId: "meeting-1", fields: { title: "A" }, title: "B" }),
  ).toThrow("not both");
  expect(() => api.updateEvent!({ eventId: "meeting-1", fields: ["A"] })).toThrow(
    "fields must be an object",
  );
  expect(() =>
    api.createEvent!({ end: "2026-08-17", resourceIds: "room", start: "2026-08-16" }),
  ).toThrow("calendar-agent-invalid-resources");
  expect(() => api.listEvents!({ end: "2026-08-10", start: "2026-08-12" })).toThrow(
    "calendar-agent-invalid-range",
  );
  expect(() => api.getChange!({ changeId: "nope" })).toThrow(
    'calendar-agent-unknown-change: no change has the ID "nope". Recent changes: none',
  );
  // A view switcher's stale option changes nothing.
  expect(view.api.selectView("year")).toBe(false);
  expect(root.model.state.view).toBe("week");
});

test("a policy's refusal fails the step at once, runs the policies once and reaches the result callback", () => {
  const saved = vi.fn();
  const results: string[] = [];
  const policy = vi.fn(
    (_change: unknown, { detail }: { readonly detail?: { readonly input?: string } }) =>
      detail?.input === "agent"
        ? ({ reason: "no-agents", type: "reject" } as const)
        : ({ type: "accept" } as const),
  );
  const { view } = setup({
    onEventChange: saved,
    onEventChangeResult: (result, detail) =>
      results.push(
        `${result.status}:${result.status === "rejected" ? result.reason : ""}:${detail.input}`,
      ),
    policies: [policy],
  });

  // Synchronous: the step fails with the reason, not with a promise the bridge can't wait for.
  expect(() => view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00" })).toThrow(
    "calendar-event-change-rejected: no-agents",
  );
  expect(saved).not.toHaveBeenCalled();
  expect(policy).toHaveBeenCalledTimes(1);
  expect(results).toEqual(["rejected:no-agents:agent"]);
});

test("an accepted change runs the policies once and is heard once", () => {
  const policy = vi.fn(() => ({ type: "accept" }) as const);
  const onEventChangeResult = vi.fn();
  const { view } = setup({ onEventChange: vi.fn(), onEventChangeResult, policies: [policy] });

  const change = view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00" });

  expect(change).toMatchObject({ cause: "move", eventId: "meeting-1", status: "saved" });
  expect(policy).toHaveBeenCalledTimes(1);
  expect(onEventChangeResult).toHaveBeenCalledTimes(1);
  expect(view.api.getChange({ changeId: change.changeId })).toEqual(change);
});

test("a read-only root hides the event changes, without a development warning", async () => {
  // The tests' setup makes ui-sdk's development warnings throw, so mounting proves there is none.
  const { view } = setup();
  await made();

  expect(view.api.createEvent).toBeUndefined();
  expect(view.api.updateEvent).toBeUndefined();
  expect(view.api.moveEvent).toBeUndefined();
  expect(view.api.resizeEvent).toBeUndefined();
  expect(view.api.deleteEvent).toBeUndefined();
  const description = view.api.describeCalendar();
  expect(description.readOnly).toBe(true);
  expect(Object.keys(description.actions)).not.toContain("createEvent");
  expect(Object.keys(description.actions)).toContain("listEvents");
});

test("an agent moves, resizes and creates events as the agent", () => {
  const saved: string[] = [];
  const { view } = setup({
    onEventChange: (change, detail) => {
      const placement =
        change.proposed === null
          ? ""
          : `${change.proposed.start.toString()}/${change.proposed.end.toString()}`;
      saved.push(`${change.cause}:${detail.input}:${placement}:${JSON.stringify(detail.fields)}`);
    },
  });

  view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00" });
  view.api.resizeEvent!({ end: "2026-08-15T12:00Z", eventId: "meeting-1" });
  view.api.resizeEvent!({ eventId: "meeting-1", start: "2026-08-15T08:00Z" });
  const created = view.api.createEvent!({
    end: "2026-08-19",
    fields: { location: "Room 4" },
    start: "2026-08-18",
    title: "Offsite",
  });

  expect(saved).toEqual([
    "move:agent:2026-08-16T14:00:00Z/2026-08-16T15:00:00Z:undefined",
    "resize-end:agent:2026-08-15T09:00:00Z/2026-08-15T12:00:00Z:undefined",
    "resize-start:agent:2026-08-15T08:00:00Z/2026-08-15T10:00:00Z:undefined",
    'create:agent:2026-08-18/2026-08-19:{"location":"Room 4","title":"Offsite"}',
  ]);
  expect(created).toEqual({
    cause: "create",
    changeId: expect.any(String),
    eventId: null,
    proposed: { end: "2026-08-19", kind: "all-day", resourceIds: [], start: "2026-08-18" },
    status: "saved",
  });
});

test("an update changes fields in place, or the placement too, as one update", () => {
  const saved: { readonly cause: string; readonly fields: unknown; readonly placement: string }[] =
    [];
  const { view } = setup({
    onEventChange: (change, detail) =>
      void saved.push({
        cause: change.cause,
        fields: detail.fields,
        placement:
          change.proposed === null
            ? ""
            : `${change.proposed.start.toString()}/${change.proposed.end.toString()}`,
      }),
  });

  view.api.updateEvent!({ eventId: "meeting-1", title: "Design review" });
  view.api.updateEvent!({ eventId: "meeting-1", start: "2026-08-15T11:00Z" });

  expect(saved).toEqual([
    {
      cause: "update",
      fields: { title: "Design review" },
      placement: "2026-08-15T09:00:00Z/2026-08-15T10:00:00Z",
    },
    { cause: "update", fields: undefined, placement: "2026-08-15T11:00:00Z/2026-08-15T12:00:00Z" },
  ]);
});

test("a late failure resolves the change as rejected, with no unhandled rejection", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => void unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const results: string[] = [];
    const { view } = setup({
      onEventChange: () => Promise.reject(new Error("The room is booked")),
      onEventChangeResult: (result) => results.push(result.status),
    });

    const change = view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00" });
    expect(change.status).toBe("saving");
    expect(view.api.describeCalendar().pendingChanges).toEqual([
      expect.objectContaining({ changeId: change.changeId, status: "saving" }),
    ]);
    expect(view.api.listEvents()).toEqual([expect.objectContaining({ pending: true })]);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(view.api.getChange({ changeId: change.changeId })).toMatchObject({
      reason: "handler-error",
      status: "rejected",
    });
    expect(results).toEqual(["rejected"]);
    expect(unhandled).toEqual([]);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("a handler that throws at once fails the step with its message", () => {
  const { view } = setup({
    onEventChange: () => {
      throw new Error("The room is booked");
    },
  });

  expect(() => view.api.moveEvent!({ eventId: "meeting-1", start: "2026-08-16T14:00" })).toThrow(
    "calendar-event-change-rejected: handler-error (The room is booked)",
  );
});

test("an agent deletes only where the root lets it", async () => {
  const saved: string[] = [];
  const onEventChange = (change: { readonly cause: string }, detail: { readonly input: string }) =>
    void saved.push(`${change.cause}:${detail.input}`);

  const refused = setup({ onEventChange });
  await made();
  expect(refused.view.api.deleteEvent).toBeUndefined();
  expect(refused.view.api.describeCalendar()).toMatchObject({ canDelete: false });
  expect(Object.keys(refused.view.api.describeCalendar().actions)).not.toContain("deleteEvent");

  const allowed = setup({ onEventChange }, { allowAgentDelete: true });
  await made();
  expect(allowed.view.api.describeCalendar()).toMatchObject({ canDelete: true });
  expect(allowed.view.api.deleteEvent!({ eventId: "meeting-1" })).toMatchObject({
    cause: "delete",
    proposed: null,
    status: "saved",
  });
  expect(saved).toEqual(["delete:agent"]);
});

test("deleteEvent refuses in its own body where the root doesn't allow it, however it was reached", () => {
  const saved: string[] = [];
  const results: string[] = [];
  const { view } = setup({
    onEventChange: (change) => void saved.push(change.cause),
    onEventChangeResult: (result, detail) =>
      results.push(
        `${result.status}:${result.status === "rejected" ? result.reason : ""}:${detail.input}`,
      ),
  });

  // Before the instance settles, the getter still hands the method out, as ui-sdk's check needs.
  const deleteEvent = view.api.deleteEvent!;

  expect(() => deleteEvent({ eventId: "meeting-1" })).toThrow(
    "calendar-event-change-rejected: agent-delete-not-allowed",
  );
  expect(saved).toEqual([]);
  expect(results).toEqual(["rejected:agent-delete-not-allowed:agent"]);
});

test("deleteEvent refuses in its own body where the policies would still let it through", () => {
  const onEventChange = vi.fn();
  // The root has turned deletes off and the runtime hasn't committed that yet, so the policies
  // still allow an agent's delete.
  const root = host({ allowAgentDelete: true, onEventChange });
  const view = mount(
    calendar,
    { allowAgentDelete: false, runtime: root.runtime, ...root.model.state },
    markup,
  );
  cleanups.push(
    () => view.unmount(),
    () => root.dispose(),
  );
  const deleteEvent = view.api.deleteEvent!;

  expect(() => deleteEvent({ eventId: "meeting-1" })).toThrow(
    "calendar-event-change-rejected: agent-delete-not-allowed",
  );
  expect(onEventChange).not.toHaveBeenCalled();
});

test("a delete proposed as the agent is refused without allowAgentDelete, and kept with it", async () => {
  const results: string[] = [];
  const onEventChangeResult = (
    result: { readonly status: string; readonly reason?: string },
    detail: { readonly input: string },
  ) => void results.push(`${result.status}:${result.reason ?? ""}:${detail.input}`);
  const refused = host({ onEventChange: vi.fn(), onEventChangeResult });
  const allowed = host({ allowAgentDelete: true, onEventChange: vi.fn(), onEventChangeResult });
  cleanups.push(
    () => refused.dispose(),
    () => allowed.dispose(),
  );
  const proposal = { cause: "delete", eventId: "meeting-1" } as const;

  await refused.model.actions.proposeEventChange(proposal, { input: "agent" });
  await refused.model.actions.proposeEventChange(proposal);
  await allowed.model.actions.proposeEventChange(proposal, { input: "agent" });

  expect(results).toEqual([
    "rejected:agent-delete-not-allowed:agent",
    "committed::api",
    "committed::agent",
  ]);
});

test("a proposal made while an agent's step runs is the agent's, with the rest of its detail", async () => {
  const seen: string[] = [];
  const root = host({
    onEventChange: vi.fn(),
    policies: [
      (_change, { detail }) => {
        seen.push(`${detail?.input}:${detail?.history ?? ""}`);
        return { type: "accept" };
      },
    ],
  });
  cleanups.push(() => root.dispose());
  const move = {
    cause: "move",
    eventId: "meeting-1",
    proposed: {
      end: Temporal.Instant.from("2026-08-15T12:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-08-15T11:00:00Z"),
    },
  } as const;

  // As the application's own button calls it when an agent presses it.
  await withSource("agent", () => root.model.actions.proposeEventChange(move));
  await withSource("agent", () =>
    root.model.actions.proposeEventChange(move, { history: "undo", input: "api" }),
  );
  withSource("agent", () => root.model.actions.checkEventChange(move));
  // A person's, or the application's own, stay as they were.
  await withSource("mouse", () => root.model.actions.proposeEventChange(move));
  await root.model.actions.proposeEventChange(move, { input: "keyboard" });

  expect(seen).toEqual(["agent:", "agent:undo", "agent:", "api:", "keyboard:"]);
});

test("describeCalendar gives today, the time zone, the views and the visible range", () => {
  const { view } = setup({ onEventChange: vi.fn() });

  view.api.setTimeZone({ timeZone: "Pacific/Kiritimati" });
  view.api.selectEvent({ eventId: "meeting-1" });

  // Read before the adapter renders again: the description follows the commands at once.
  expect(view.api.describeCalendar()).toEqual({
    actions: expect.objectContaining({
      createEvent: expect.stringContaining("title?: string"),
      listEvents: "nothing, or { start?: ISO date, end?: ISO date }",
    }),
    anchorDate: "2026-08-15",
    canDelete: false,
    conventions: expect.stringContaining("Ranges include start and exclude end"),
    locale: "en-GB",
    now: "2026-08-14T22:00:00+14:00",
    pendingChanges: [],
    readOnly: false,
    resources: [],
    selectedEventId: "meeting-1",
    timeZone: "Pacific/Kiritimati",
    today: "2026-08-14",
    view: "week",
    views: ["week", "agenda"],
    visibleRange: { end: "2026-08-22", start: "2026-08-15" },
  });
  view.api.setView({ view: "agenda" });
  expect(view.api.describeCalendar().visibleRange).toEqual({
    end: "2026-08-16",
    start: "2026-08-15",
  });
});

test("an agent reads what its commands asked for before the owner passes it", () => {
  // Controlled: the owner passes new values on its next render, which a test never gives it.
  const { root, view } = setup({ anchorDate: Temporal.PlainDate.from("2026-08-15"), view: "week" });

  view.api.setView({ view: "agenda" });
  view.api.navigateNext();

  expect(root.model.state.view).toBe("week");
  expect(view.api.describeCalendar()).toMatchObject({
    anchorDate: "2026-08-16",
    view: "agenda",
    visibleRange: { end: "2026-08-17", start: "2026-08-16" },
  });
  expect(view.api.listEvents()).toEqual([]);
});

test("listEvents gives events as JSON, in the visible range or the one asked for", () => {
  const { view } = setup();

  const review = {
    end: "2026-08-15T10:00:00+00:00",
    id: "meeting-1",
    kind: "timed",
    resourceIds: [],
    start: "2026-08-15T09:00:00+00:00",
    title: "Architecture review",
  };
  expect(view.api.listEvents()).toEqual([review]);
  expect(view.api.listEvents({ end: "2026-08-15", start: "2026-08-01" })).toEqual([]);
  expect(view.api.listEvents({ start: "2026-08-15" })).toEqual([review]);

  view.api.setTimeZone({ timeZone: "Europe/Berlin" });
  expect(view.api.listEvents()).toEqual([
    { ...review, end: "2026-08-15T12:00:00+02:00", start: "2026-08-15T11:00:00+02:00" },
  ]);
  view.api.navigateNext();
  expect(view.api.listEvents()).toEqual([]);
});

test("the agent's items are the visible events, labelled in ISO 8601 or as the root formats them", () => {
  const { root, view } = setup();

  expect(view.api.visibleEvents()).toEqual([
    {
      label: "Architecture review · 2026-08-15T09:00 to 2026-08-15T10:00 (UTC)",
      value: "meeting-1",
    },
  ]);

  view.api.navigateNext();
  // The api reads the runtime's latest state, so it follows the root's state.
  expect(root.model.state.anchorDate.toString()).toBe("2026-08-22");
  expect(view.api.visibleEvents()).toEqual([]);

  const formatted = setup(
    {},
    { formatAgentEventLabel: (event) => `${event.title} at ${event.start}` },
  );
  expect(formatted.view.api.visibleEvents()).toEqual([
    { label: "Architecture review at 2026-08-15T09:00:00+00:00", value: "meeting-1" },
  ]);
});
