import "./setup";

import { afterEach, expect, test, vi } from "vite-plus/test";

import { createCalendarStore } from "../src/index";
import { host, review, weekRules, type Meeting, type View } from "./harness";

const hosts: ReturnType<typeof host>[] = [];
function mount(...args: Parameters<typeof host>) {
  const mounted = host(...args);
  hosts.push(mounted);
  return mounted;
}

afterEach(() => {
  for (const mounted of hosts.splice(0)) mounted.dispose();
});

const date = (value: string) => Temporal.PlainDate.from(value);

test("derives the active view, today and the visible range from the props and state", () => {
  const { model } = mount();

  expect(model.state.view).toBe("week");
  expect(model.activeView?.range.start.toString()).toBe("2026-08-15");
  expect(model.activeView?.range.start.toString()).toBe("2026-08-15");
  expect(model.activeView?.range.end.toString()).toBe("2026-08-22");
  expect(model.today?.toString()).toBe("2026-08-14");
  expect(model.visibleRange).toMatchObject({ view: "week" });
  expect(model.visibleEvents.size).toBe(1);
  expect(model.isReadOnly).toBe(true);
});

test("a render with equal props keeps every part of the model, the model included", () => {
  const mounted = mount();
  const first = mounted.model;

  // New arrays and objects with the same contents, as a component recreates them inline.
  const second = mounted.rerender({
    events: [{ ...review }].map(() => review),
    weekRules: { ...weekRules },
  });

  expect(second).toBe(first);
  expect(second.eventSnapshot).toBe(first.eventSnapshot);
  expect(second.environment).toBe(first.environment);
  expect(second.activeView).toBe(first.activeView);
  expect(second.actions).toBe(first.actions);
});

test("a change keeps the parts it doesn't touch", () => {
  const mounted = mount();
  const first = mounted.model;

  first.actions.navigateNext();
  const second = mounted.model;

  expect(second).not.toBe(first);
  expect(second.activeView).not.toBe(first.activeView);
  expect(second.activeView?.range.start.toString()).toBe("2026-08-22");
  expect(second.eventSnapshot).toBe(first.eventSnapshot);
  expect(second.environment).toBe(first.environment);
  expect(second.actions).toBe(first.actions);

  const moved: Meeting = { ...review, title: "Design review" };
  const third = mounted.rerender({ events: [moved] });
  expect(third.eventSnapshot).not.toBe(second.eventSnapshot);
  // The projection is new, its range isn't.
  expect(third.activeView).not.toBe(second.activeView);
  expect(third.activeView?.range).toBe(second.activeView?.range);
});

test("an uncontrolled slice changes in the store, and its handler hears it after", () => {
  const onViewChange = vi.fn();
  const mounted = mount({ handlers: { onViewChange } });
  onViewChange.mockImplementation(() => {
    // The handler reads the new state, as 1.x handlers did.
    expect(mounted.model.state.view).toBe("agenda");
  });

  mounted.model.actions.setView("agenda");

  expect(mounted.model.state.view).toBe("agenda");
  expect(onViewChange).toHaveBeenCalledTimes(1);
  expect(onViewChange).toHaveBeenCalledWith(
    "agenda",
    expect.objectContaining({
      canceled: false,
      controlled: false,
      previous: "week",
      reason: "imperative",
      slice: "view",
      source: "programmatic",
    }),
  );
});

test("a controlled slice asks its owner and changes only when the owner passes it", () => {
  const onViewChange = vi.fn();
  const mounted = mount({ handlers: { onViewChange }, view: "week" });

  mounted.model.actions.setView("agenda");

  expect(onViewChange).toHaveBeenCalledWith(
    "agenda",
    expect.objectContaining({ controlled: true, previous: "week" }),
  );
  expect(mounted.model.state.view).toBe("week");

  mounted.rerender({ view: "agenda" });
  expect(mounted.model.state.view).toBe("agenda");
});

test("commands compose: a second one starts from the value the first asked for", () => {
  const requested: string[] = [];
  const mounted = mount({
    anchorDate: date("2026-08-15"),
    handlers: { onAnchorDateChange: (value) => requested.push(value.toString()) },
  });

  // Both run before the owner commits; the second builds on the first's request.
  mounted.model.actions.navigateNext();
  mounted.model.actions.navigateNext();

  expect(requested).toEqual(["2026-08-22", "2026-08-29"]);
});

test("commands compose across slices: navigation steps by the view the first one asked for", () => {
  const requested: string[] = [];
  const mounted = mount({
    anchorDate: date("2026-08-15"),
    handlers: { onAnchorDateChange: (value) => requested.push(value.toString()) },
    view: "week",
  });

  mounted.model.actions.setView("agenda");
  mounted.model.actions.navigateNext();
  mounted.model.actions.navigateNext();

  // The agenda steps by a day; the week, still committed, by seven. The second step still
  // reads the view the first command asked for.
  expect(requested).toEqual(["2026-08-16", "2026-08-17"]);
});

test("a handler that cancels puts an uncontrolled slice back", () => {
  const mounted = mount({
    handlers: { onAnchorDateChange: (_value, detail) => detail.cancel() },
  });

  mounted.model.actions.navigateNext();

  expect(mounted.model.state.anchorDate.toString()).toBe("2026-08-15");
  expect(mounted.model.activeView?.range.start.toString()).toBe("2026-08-15");
});

test("a handler that cancels and writes another slice keeps both: its slice back, the other written", () => {
  let actions: (typeof mounted)["model"]["actions"] | undefined;
  const mounted = mount({
    handlers: {
      onViewChange: (_value, detail) => {
        detail.cancel();
        actions!.setAnchorDate(date("2026-08-20"));
      },
    },
  });
  actions = mounted.model.actions;

  mounted.model.actions.setView("agenda");

  expect(mounted.model.state.view).toBe("week");
  expect(mounted.model.state.anchorDate.toString()).toBe("2026-08-20");
});

test("a handler that cancels after moving its own slice on keeps where it moved to", () => {
  let actions: (typeof mounted)["model"]["actions"] | undefined;
  const mounted = mount({
    handlers: {
      onAnchorDateChange: (value, detail) => {
        if (value.toString() !== "2026-08-22") return;
        detail.cancel();
        actions!.setAnchorDate(date("2026-08-01"));
      },
    },
  });
  actions = mounted.model.actions;

  mounted.model.actions.navigateNext();

  expect(mounted.model.state.anchorDate.toString()).toBe("2026-08-01");
});

test("a command's reason and event reach the handler", () => {
  const onAnchorDateChange = vi.fn();
  const mounted = mount({ handlers: { onAnchorDateChange } });

  mounted.model.actions.navigateNext({ reason: "next-press" });

  expect(onAnchorDateChange).toHaveBeenCalledWith(
    date("2026-08-22"),
    expect.objectContaining({ reason: "next-press" }),
  );
});

test("a shared store follows the root that mounted last", () => {
  const store = createCalendarStore<View["name"], unknown, unknown, string>({
    defaultAnchorDate: date("2026-08-15"),
    defaultTimeZone: "UTC",
    defaultView: "week",
  });
  const mounted = mount({ store });

  store.actions.setView("agenda");

  expect(store.getSnapshot().view).toBe("agenda");
  expect(mounted.model.state.view).toBe("agenda");
});

test("event changes run as transactions without a framework", async () => {
  const changes: unknown[] = [];
  const results: string[] = [];
  const mounted = mount({
    // A save that resolves later keeps the change shown until the events include it.
    onEventChange: (change, detail) => {
      changes.push({ cause: change.cause, input: detail.input });
      return Promise.resolve();
    },
    onEventChangeResult: (result, detail) => results.push(`${result.status}:${detail.input}`),
  });
  expect(mounted.model.isReadOnly).toBe(false);
  const start = Temporal.Instant.from("2026-08-16T14:00:00Z");
  const end = Temporal.Instant.from("2026-08-16T15:00:00Z");

  const result = await mounted.model.actions.proposeEventChange(
    { cause: "move", eventId: "meeting-1", proposed: { end, kind: "timed", start } },
    { input: "agent" },
  );

  expect(result.status).toBe("committed");
  expect(changes).toEqual([{ cause: "move", input: "agent" }]);
  expect(results).toEqual(["committed:agent"]);
  expect([...mounted.runtime.pendingChanges.getSnapshot().values()]).toMatchObject([
    { phase: "awaiting-events" },
  ]);
  expect(mounted.model.visibleEvents.get("meeting-1")).toMatchObject({ isPending: true, start });

  mounted.rerender({ events: [{ ...review, end, start }] });
  expect(mounted.runtime.pendingChanges.getSnapshot().size).toBe(0);
  expect(mounted.model.visibleEvents.get("meeting-1")?.isPending).not.toBe(true);
});

test("a policy hears which input proposed a change", async () => {
  const mounted = mount({
    // Agents may delete here, so the root's own refusal doesn't answer first.
    allowAgentDelete: true,
    onEventChange: () => undefined,
    policies: [
      (_change, { detail }) =>
        detail?.input === "agent" ? { reason: "no-agents", type: "reject" } : { type: "accept" },
    ],
  });
  const proposal = { cause: "delete", eventId: "meeting-1" } as const;

  expect(mounted.model.actions.checkEventChange(proposal, { input: "agent" })).toMatchObject({
    reason: "no-agents",
    status: "rejected",
  });
  expect(mounted.model.actions.checkEventChange(proposal)?.status).toBe("accepted");
  expect(
    await mounted.model.actions.proposeEventChange(proposal, { input: "agent" }),
  ).toMatchObject({
    reason: "no-agents",
    status: "rejected",
  });
});

test("a root without onEventChange rejects every change", async () => {
  const mounted = mount();

  const result = await mounted.model.actions.proposeEventChange({
    cause: "delete",
    eventId: "meeting-1",
  });

  expect(result.status).toBe("rejected");
});

test("an unknown input reads as the API's", async () => {
  const inputs: string[] = [];
  const mounted = mount({ onEventChange: (_change, detail) => void inputs.push(detail.input) });

  await mounted.model.actions.proposeEventChange(
    { cause: "delete", eventId: "meeting-1" },
    { input: "telepathy" as "api" },
  );

  expect(inputs).toEqual(["api"]);
});

test("the visible range is reported once per range", () => {
  const onVisibleRangeChange = vi.fn();
  const mounted = mount({ onVisibleRangeChange });
  expect(onVisibleRangeChange).toHaveBeenCalledTimes(1);

  mounted.runtime.reportVisibleRange(mounted.model.visibleRange);
  mounted.rerender({});
  expect(onVisibleRangeChange).toHaveBeenCalledTimes(1);

  mounted.model.actions.navigateNext();
  expect(onVisibleRangeChange).toHaveBeenCalledTimes(2);
});

test("proposeNow answers at once when it can, and every proposal is heard once", async () => {
  const policy = vi.fn(() => ({ type: "accept" }) as const);
  const results: string[] = [];
  let save: Promise<void> | undefined;
  const mounted = mount({
    onEventChange: () => save,
    onEventChangeResult: (result) => results.push(result.status),
    policies: [policy],
  });
  const move = {
    cause: "move",
    eventId: "meeting-1",
    proposed: {
      end: Temporal.Instant.from("2026-08-16T15:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-08-16T14:00:00Z"),
    },
  } as const;

  expect(mounted.runtime.proposeNow(move)).toMatchObject({ status: "committed" });
  expect(results).toEqual(["committed"]);

  save = Promise.reject(new Error("offline"));
  const pending = mounted.runtime.proposeNow(move, { input: "agent" });
  expect(pending).toMatchObject({ phase: "saving", status: "pending" });
  // Heard when it settles, not before.
  expect(results).toEqual(["committed"]);
  await expect(pending.status === "pending" ? pending.result : undefined).resolves.toMatchObject({
    reason: "handler-error",
    status: "rejected",
  });
  expect(results).toEqual(["committed", "rejected"]);
  expect(policy).toHaveBeenCalledTimes(2);
});

test("latest gives the state and range the last command asked for, before the owner takes it", () => {
  // Controlled, with an owner that hasn't passed the new values yet: the committed model keeps
  // the old ones, and only `latest` has what the commands asked for.
  const { runtime } = mount({ anchorDate: date("2026-08-15"), view: "week" });

  runtime.committed()!.actions.setView("agenda");
  runtime.committed()!.actions.navigateNext();

  expect(runtime.committed()?.state.view).toBe("week");
  expect(runtime.latest()?.state).toMatchObject({ view: "agenda" });
  expect(runtime.latest()?.range?.start.toString()).toBe("2026-08-16");
  expect(runtime.latest()?.range?.end.toString()).toBe("2026-08-17");
});

test("a store's listener subscribed twice hears changes until its own subscription ends", () => {
  const store = createCalendarStore<View["name"], unknown, unknown, string>({
    defaultAnchorDate: date("2026-08-15"),
    defaultTimeZone: "UTC",
    defaultView: "week",
  });
  const listener = vi.fn();

  // Solid subscribes again before it cleans up the old subscription.
  const first = store.subscribe(listener);
  const second = store.subscribe(listener);
  first();
  store.actions.setView("agenda");

  expect(listener).toHaveBeenCalled();
  second();
  listener.mockClear();
  store.actions.setView("week");
  expect(listener).not.toHaveBeenCalled();
});
