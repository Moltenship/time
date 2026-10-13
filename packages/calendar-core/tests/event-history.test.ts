import { describe, expect, test, vi } from "vite-plus/test";

import {
  applyEventOverlay,
  conflictPolicy,
  createCanonicalEventAdapter,
  createEventHistory,
  createEventSnapshotCache,
  createEventTransactions,
  snapPolicy,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventProposal,
  type CalendarInputMethod,
  type CalendarPolicy,
  type CalendarProposalDetail,
  type EventHistoryContext,
  type EventHistoryOptions,
  type EventSnapshot,
} from "../src/index";

type TestEvent = CalendarEvent<{ readonly note?: string }, string, string>;
type Change = CalendarEventChange<TestEvent, string, string>;
type Handler = CalendarEventChangeHandler<TestEvent, string, string>;
type Policy = CalendarPolicy<TestEvent, string, string>;
type Proposal = CalendarEventProposal<string, string, TestEvent>;

const timeZone = "UTC";

function at(time: string): Temporal.Instant {
  return Temporal.Instant.from(`2026-10-08T${time}:00Z`);
}

function event(id: string, start: string, end: string, resourceIds: readonly string[] = []) {
  return {
    data: {},
    end: at(end),
    id,
    kind: "timed",
    resourceIds,
    start: at(start),
    title: id,
  } as TestEvent;
}

const timed = (start: string, end: string, resourceIds?: readonly string[]) => ({
  end: at(end),
  kind: "timed" as const,
  start: at(start),
  ...(resourceIds === undefined ? {} : { resourceIds }),
});

/**
 * A minimal application around one history: it saves each change into its events, restoring a
 * create's record under its own ID (or a new one with `newIds`), and records every result, as
 * `Root`'s `onEventChangeResult` would.
 */
function createApp(
  initial: readonly TestEvent[],
  {
    history: historyOptions,
    newIds = false,
    policies,
  }: {
    readonly history?: EventHistoryOptions<TestEvent, string, string>;
    readonly newIds?: boolean;
    readonly policies?: readonly Policy[];
  } = {},
) {
  const cache = createEventSnapshotCache(
    createCanonicalEventAdapter<TestEvent["data"], string, string>(),
  );
  const transactions = createEventTransactions<TestEvent, string, string>();
  const history = createEventHistory<TestEvent, string, string>(historyOptions);
  let events = initial;
  let created = 0;
  /** The event each create became, by change ID, as an app tells `createdEventId`. */
  const createdIds = new Map<string, string>();

  function save(change: Change) {
    if (change.cause === "create") {
      created += 1;
      const id = change.event !== null && !newIds ? change.event.id : `created-${created}`;
      createdIds.set(change.id, id);
      const base = change.event ?? { data: {}, title: "New" };
      events = [...events, { ...base, ...change.proposed, id } as TestEvent];
    } else if (change.cause === "delete") {
      events = events.filter(({ id }) => id !== change.eventId);
    } else {
      events = events.map((current) =>
        current.id === change.eventId ? ({ ...current, ...change.proposed } as TestEvent) : current,
      );
    }
    transactions.reconcile(cache.getSnapshot(events));
  }

  /** As the React hook does: waits out changes still validating or saving, then a turn. */
  function whenSettled() {
    const unsettled = () =>
      [...transactions.getPendingChanges().values()].some(
        ({ phase }) => phase !== "awaiting-events",
      );
    if (!unsettled()) return undefined;
    return new Promise<void>((resolve) => {
      const stop = transactions.subscribe(() => {
        if (unsettled()) return;
        stop();
        setTimeout(resolve);
      });
    });
  }

  const app = {
    createdIds,
    handler: save as Handler,
    history,
    get events() {
      return events;
    },
    set events(next: readonly TestEvent[]) {
      events = next;
      transactions.reconcile(cache.getSnapshot(events));
    },
    /** The events as the user sees them, pending changes included. */
    visible(): EventSnapshot<TestEvent, string, string> {
      return applyEventOverlay(cache.getSnapshot(events), transactions.getPending());
    },
    propose: async (proposal: Proposal, detail: CalendarProposalDetail = { input: "pointer" }) => {
      const result = await transactions.propose(proposal, {
        onEventChange: (change) => app.handler(change),
        policies,
        snapshot: cache.getSnapshot(events),
        timeZone,
      });
      history.record(result, detail);
      return result;
    },
    context(input?: CalendarInputMethod): EventHistoryContext<TestEvent, string, string> {
      return { getEvents: () => app.visible(), input, propose: app.propose, whenSettled };
    },
    undo: (input?: CalendarInputMethod) => history.undo(app.context(input)),
    redo: (input?: CalendarInputMethod) => history.redo(app.context(input)),
    /** Where an event is, as `HH:MM-HH:MM`, with its resources; `gone` when it isn't shown. */
    where(id: string) {
      const current = app.visible().get(id);
      if (current === undefined || current.kind !== "timed") return "gone";
      const time = (instant: Temporal.Instant) => instant.toString().slice(11, 16);
      const resources = current.resourceIds.length === 0 ? "" : ` ${current.resourceIds.join(",")}`;
      return `${time(current.start)}-${time(current.end)}${resources}`;
    },
    steps(stack: "undo" | "redo" = "undo") {
      return history
        .getSnapshot()
        [stack === "undo" ? "past" : "future"].map(
          (step) => `${step.cause} ${step.eventId ?? "new"}`,
        );
    },
  };
  return app;
}

const moveTo = (eventId: string, start: string, end: string, resourceIds?: readonly string[]) =>
  ({ cause: "move", eventId, proposed: timed(start, end, resourceIds) }) as const;

describe("recording", () => {
  test("records committed changes in order and undoes and redoes them", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("a", "13:00", "14:00"));
    await app.propose(moveTo("b", "15:00", "16:00"), { input: "keyboard" });
    expect(app.steps()).toEqual(["move a", "move a", "move b"]);
    expect(app.history.getSnapshot().past.map(({ input }) => input)).toEqual([
      "pointer",
      "pointer",
      "keyboard",
    ]);

    expect((await app.undo()).status).toBe("committed");
    expect(app.where("b")).toBe("11:00-12:00");
    await app.undo();
    expect(app.where("a")).toBe("10:00-11:00");
    expect(app.steps()).toEqual(["move a"]);
    expect(app.steps("redo")).toEqual(["move b", "move a"]);

    await app.redo();
    expect(app.where("a")).toBe("13:00-14:00");
    expect(app.steps()).toEqual(["move a", "move a"]);
    expect(app.steps("redo")).toEqual(["move b"]);

    // A new change clears what redo would take forward.
    await app.propose(moveTo("a", "16:00", "17:00"));
    expect(app.steps("redo")).toEqual([]);
    expect(app.steps()).toEqual(["move a", "move a", "move a"]);
  });

  test("never records rejections, handler errors, superseded proposals or its own inverses", async () => {
    const reject: Policy = (change) =>
      change.proposed?.kind === "timed" && change.proposed.start.equals(at("20:00"))
        ? { reason: "late", type: "reject" }
        : { type: "accept" };
    const app = createApp([event("a", "09:00", "10:00")], { policies: [reject] });
    await app.propose(moveTo("a", "20:00", "21:00"));
    app.handler = () => {
      throw new Error("offline");
    };
    await app.propose(moveTo("a", "10:00", "11:00"));
    expect(app.steps()).toEqual([]);

    // An older proposal still deciding is superseded by a newer one for the same event.
    let release!: () => void;
    let gated = true;
    const slow: Policy = () =>
      gated
        ? new Promise((resolve) => {
            release = () => resolve({ type: "accept" });
          })
        : { type: "accept" };
    const racing = createApp([event("a", "09:00", "10:00")], { policies: [slow] });
    const older = racing.propose(moveTo("a", "10:00", "11:00"));
    const first = release;
    const newer = racing.propose(moveTo("a", "12:00", "13:00"));
    first();
    release();
    expect((await older).status).toBe("rejected");
    expect((await newer).status).toBe("committed");
    expect(racing.steps()).toEqual(["move a"]);
    gated = false;

    // The inverse is recorded by no one: undo moves the step to redo and adds nothing.
    await racing.undo();
    expect(racing.steps()).toEqual([]);
    expect(racing.steps("redo")).toEqual(["move a"]);
  });

  test("records only the inputs asked for, and what the filter keeps", async () => {
    const filter = vi.fn(
      (change: Change, _detail: CalendarProposalDetail) => change.eventId !== "b",
    );
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")], {
      history: { filter, inputs: ["keyboard", "api"] },
    });
    await app.propose(moveTo("a", "10:00", "11:00"), { input: "pointer" });
    await app.propose(moveTo("a", "12:00", "13:00"), { input: "api" });
    await app.propose(moveTo("b", "13:00", "14:00"), { input: "keyboard" });
    expect(app.steps()).toEqual(["move a"]);
    expect(filter.mock.calls.map(([change, detail]) => [change.eventId, detail.input])).toEqual([
      ["a", "api"],
      ["b", "keyboard"],
    ]);
  });

  test("keeps at most `limit` steps, dropping the oldest", async () => {
    const app = createApp([event("a", "09:00", "10:00")], { history: { limit: 2 } });
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("a", "11:00", "12:00"));
    await app.propose(moveTo("a", "12:00", "13:00"));
    expect(app.history.getSnapshot().past.map(({ before }) => before?.start.toString())).toEqual([
      at("10:00").toString(),
      at("11:00").toString(),
    ]);
    const off = createApp([event("a", "09:00", "10:00")], { history: { limit: 0 } });
    await off.propose(moveTo("a", "10:00", "11:00"));
    expect(off.history.getSnapshot()).toMatchObject({ latest: null, past: [] });
  });

  test("coalesces changes to one event into its step when asked", async () => {
    const coalesce = vi.fn(() => true);
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")], {
      history: { coalesce },
    });
    await app.propose(moveTo("a", "10:00", "11:00"), { input: "keyboard" });
    await app.propose(
      { cause: "resize-end", eventId: "a", proposed: timed("10:00", "12:00") },
      { input: "keyboard" },
    );
    // Another event starts its own step without asking.
    await app.propose(moveTo("b", "13:00", "14:00"));
    expect(coalesce).toHaveBeenCalledOnce();
    const [step] = app.history.getSnapshot().past;
    expect(step).toMatchObject({ cause: "update", eventId: "a", input: "keyboard" });
    expect(step!.changes.map(({ cause }) => cause)).toEqual(["move", "resize-end"]);

    await app.undo();
    await app.undo();
    expect(app.where("a")).toBe("09:00-10:00");
    await app.redo();
    expect(app.where("a")).toBe("10:00-12:00");
  });

  test("a delete coalesced after a move restores the event where the move started", async () => {
    const app = createApp([event("a", "09:00", "10:00")], { history: { coalesce: () => true } });
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose({ cause: "delete", eventId: "a" }, { input: "api" });
    expect(app.steps()).toEqual(["delete a"]);
    await app.undo();
    expect(app.where("a")).toBe("09:00-10:00");
  });
});

describe("inverses", () => {
  test("a resize undoes as a resize, and a move across resources restores its resources", async () => {
    const app = createApp([event("a", "09:00", "10:00", ["room-1"])]);
    const causes: string[] = [];
    const save = app.handler;
    app.handler = (change) => {
      causes.push(change.cause);
      return save(change);
    };
    await app.propose({ cause: "resize-end", eventId: "a", proposed: timed("09:00", "11:00") });
    await app.propose(moveTo("a", "13:00", "15:00", ["room-2"]));
    expect(app.where("a")).toBe("13:00-15:00 room-2");

    await app.undo();
    expect(app.where("a")).toBe("09:00-11:00 room-1");
    await app.undo();
    expect(app.where("a")).toBe("09:00-10:00 room-1");
    expect(causes).toEqual(["resize-end", "move", "move", "resize-end"]);
  });

  test("undoing a delete proposes a create with the record, restored under its ID", async () => {
    const noted = { ...event("a", "09:00", "10:00"), data: { note: "agenda" } } as TestEvent;
    const app = createApp([noted]);
    const proposals: Proposal[] = [];
    const propose = app.propose;
    app.propose = (proposal, detail) => {
      proposals.push(proposal);
      return propose(proposal, detail);
    };
    await app.propose({ cause: "delete", eventId: "a" }, { input: "api" });
    expect(app.where("a")).toBe("gone");

    const undone = await app.undo();
    expect(undone.status).toBe("committed");
    expect(proposals.at(-1)).toEqual({
      cause: "create",
      event: noted,
      proposed: { ...timed("09:00", "10:00"), resourceIds: [], sourceTimeZone: undefined },
    });
    expect(app.events.find(({ id }) => id === "a")?.data).toEqual({ note: "agenda" });
    expect(app.where("a")).toBe("09:00-10:00");

    await app.redo();
    expect(proposals.at(-1)).toEqual({ cause: "delete", eventId: "a" });
    expect(app.where("a")).toBe("gone");
  });

  test("creates record only with createdEventId, which finds the event to delete", async () => {
    const without = createApp([]);
    await without.propose({ cause: "create", proposed: timed("09:00", "10:00") });
    expect(without.steps()).toEqual([]);

    let app!: ReturnType<typeof createApp>;
    const createdEventId = vi.fn((change: { readonly id: string }) =>
      app.createdIds.get(change.id),
    );
    app = createApp([], { history: { createdEventId } });
    await app.propose({ cause: "create", proposed: timed("09:00", "10:00") });
    expect(app.steps()).toEqual(["create new"]);
    // Asked when the step is undone, not when it is recorded.
    expect(createdEventId).not.toHaveBeenCalled();

    await app.undo();
    expect(app.where("created-1")).toBe("gone");
    expect(app.steps("redo")).toEqual(["create created-1"]);

    // Redo restores the record the undo deleted, which the app keeps under its ID here.
    await app.redo();
    expect(app.events.map(({ id, title }) => `${id} ${title}`)).toEqual(["created-1 New"]);
    await app.undo();
    expect(app.events).toEqual([]);
  });

  test("a restore under a new ID is found through createdEventId, and steps follow it", async () => {
    let app!: ReturnType<typeof createApp>;
    app = createApp([event("a", "09:00", "10:00")], {
      history: { createdEventId: (change) => app.createdIds.get(change.id) },
      newIds: true,
    });
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose({ cause: "delete", eventId: "a" }, { input: "api" });
    await app.undo();
    expect(app.where("created-1")).toBe("10:00-11:00");

    await app.redo();
    expect(app.where("created-1")).toBe("gone");
    await app.undo();
    expect(app.where("created-2")).toBe("10:00-11:00");
    // The older move named "a"; it follows the event to its new ID.
    await app.undo();
    expect(app.where("created-2")).toBe("09:00-10:00");
    expect(app.history.getSnapshot().future.map(({ eventId }) => eventId)).toEqual([
      "created-2",
      "created-2",
    ]);
  });

  test("keeps the placement a policy adjusted the inverse to, so redo still applies", async () => {
    const app = createApp([event("a", "09:07", "10:07")]);
    // Saved off the grid, then undone through a snapping policy.
    await app.propose(moveTo("a", "10:00", "11:00"));
    const snapped = createSnappedApp(app);
    const outcome = await snapped.undo();
    expect(outcome.status === "committed" && outcome.step.before?.start).toEqual(at("09:00"));
    expect(app.where("a")).toBe("09:00-10:00");
    expect((await snapped.redo()).status).toBe("committed");
    expect(app.where("a")).toBe("10:00-11:00");
  });
});

describe("outcomes", () => {
  test("an empty stack resolves `empty`", async () => {
    const app = createApp([]);
    await expect(app.undo()).resolves.toEqual({ direction: "undo", status: "empty" });
    await expect(app.redo()).resolves.toEqual({ direction: "redo", status: "empty" });
  });

  test("a rejected inverse leaves the step where it was, to try again", async () => {
    const busy = event("busy", "09:00", "10:00", ["room"]);
    const app = createApp([event("a", "09:00", "10:00", ["room"])], {
      policies: [conflictPolicy()],
    });
    await app.propose(moveTo("a", "11:00", "12:00"));
    // Someone books the room where the event was.
    app.events = [...app.events, busy];

    const outcome = await app.undo();
    expect(outcome).toMatchObject({
      direction: "undo",
      result: { reason: "resource-conflict", status: "rejected" },
      status: "rejected",
      step: { cause: "move", eventId: "a" },
    });
    expect(app.steps()).toEqual(["move a"]);
    expect(app.steps("redo")).toEqual([]);
    expect(app.history.getSnapshot().latest).toEqual({ outcome, type: "undo" });

    app.events = app.events.filter(({ id }) => id !== "busy");
    expect((await app.undo()).status).toBe("committed");
    expect(app.where("a")).toBe("09:00-10:00 room");
  });

  test("drops a step whose event changed elsewhere, and goes on with the next", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("b", "13:00", "14:00"));
    // Another user moves b.
    app.events = app.events.map((current) =>
      current.id === "b" ? { ...current, ...timed("15:00", "16:00") } : current,
    );
    const stale = await app.undo();
    expect(stale).toMatchObject({ direction: "undo", status: "stale", step: { eventId: "b" } });
    expect(app.where("b")).toBe("15:00-16:00");
    expect(app.steps()).toEqual(["move a"]);

    expect((await app.undo()).status).toBe("committed");
    expect(app.where("a")).toBe("09:00-10:00");
  });

  test("drops steps whose event was deleted or restored elsewhere, but not renamed", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")]);
    await app.propose({ cause: "delete", eventId: "b" }, { input: "api" });
    await app.propose(moveTo("a", "10:00", "11:00"));
    // A title changed elsewhere isn't a placement change.
    app.events = app.events.map((current) => ({ ...current, title: `${current.title}!` }));
    expect((await app.undo()).status).toBe("committed");
    expect(app.events.find(({ id }) => id === "a")?.title).toBe("a!");

    // Someone else restores b before the undo does.
    app.events = [...app.events, event("b", "11:00", "12:00")];
    expect((await app.undo()).status).toBe("stale");

    await app.propose({ cause: "delete", eventId: "a" }, { input: "api" });
    await app.undo();
    app.events = app.events.filter(({ id }) => id !== "a");
    expect((await app.redo()).status).toBe("stale");
  });
});

describe("queueing and timing", () => {
  test("queued undos run in order against the saves the events don't show yet", async () => {
    const app = createApp([event("a", "09:00", "10:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("a", "11:00", "12:00"));
    await app.propose(moveTo("a", "12:00", "13:00"));
    // What the last render showed, before any of the undos below.
    const shown = app.visible();
    const context = { getEvents: () => shown, propose: app.propose };
    const outcomes = await Promise.all([
      app.history.undo(context),
      app.history.undo(context),
      app.history.undo(context),
    ]);
    expect(outcomes.map(({ status }) => status)).toEqual(["committed", "committed", "committed"]);
    expect(app.where("a")).toBe("09:00-10:00");
  });

  test("shows the step in flight, and a step recorded meanwhile keeps it out of redo", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    let finish!: () => void;
    const save = app.handler;
    app.handler = (change) =>
      new Promise<void>((resolve) => {
        finish = () => {
          void save(change);
          resolve();
        };
      });
    const undoing = app.undo();
    await vi.waitFor(() => expect(app.history.getSnapshot().pending).not.toBeNull());
    expect(app.history.getSnapshot().pending).toMatchObject({
      direction: "undo",
      step: { eventId: "a" },
    });
    app.handler = save;
    await app.propose(moveTo("b", "13:00", "14:00"));
    finish();
    expect((await undoing).status).toBe("committed");
    expect(app.history.getSnapshot().pending).toBeNull();
    expect(app.steps()).toEqual(["move b"]);
    expect(app.steps("redo")).toEqual([]);
  });

  test("clear empties both stacks, also under an undo in flight", async () => {
    const app = createApp([event("a", "09:00", "10:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("a", "11:00", "12:00"));
    const undoing = app.undo();
    app.history.clear();
    await undoing;
    expect(app.history.getSnapshot()).toMatchObject({
      future: [],
      latest: { type: "undo" },
      past: [],
    });
    app.history.clear();
    expect(app.history.getSnapshot().latest).toBeNull();
  });

  test("passes the input and its own marker on, and publishes a new snapshot per update", async () => {
    const app = createApp([event("a", "09:00", "10:00")]);
    const details: CalendarProposalDetail[] = [];
    const propose = app.propose;
    app.propose = (proposal, detail) => {
      details.push(detail!);
      return propose(proposal, detail);
    };
    const listener = vi.fn();
    const unsubscribe = app.history.subscribe(listener);
    const first = app.history.getSnapshot();
    expect(Object.isFrozen(first)).toBe(true);
    await app.propose(moveTo("a", "10:00", "11:00"));
    expect(listener).toHaveBeenCalledTimes(1);
    const recorded = app.history.getSnapshot();
    expect(recorded).not.toBe(first);
    expect(recorded.latest).toEqual({ step: recorded.past[0], type: "record" });
    expect(app.history.getSnapshot()).toBe(recorded);

    await app.undo("keyboard");
    await app.redo();
    expect(details.slice(1)).toEqual([
      { history: "undo", input: "keyboard" },
      { history: "redo", input: "api" },
    ]);
    // Recorded, pending, undone; pending, redone.
    expect(listener).toHaveBeenCalledTimes(5);
    unsubscribe();
  });
});

/** The app's own save, used by tests that wrap the handler. */
function defaultSave(app: ReturnType<typeof createApp>, change: Change) {
  if (change.cause === "create" || change.cause === "delete") return;
  app.events = app.events.map((current) =>
    current.id === change.eventId ? ({ ...current, ...change.proposed } as TestEvent) : current,
  );
}

/** Undoes and redoes `app`'s history through a pipeline that snaps to the hour. */
function createSnappedApp(app: ReturnType<typeof createApp>) {
  const transactions = createEventTransactions<TestEvent, string, string>();
  const cache = createEventSnapshotCache(
    createCanonicalEventAdapter<TestEvent["data"], string, string>(),
  );
  const context: EventHistoryContext<TestEvent, string, string> = {
    getEvents: () => cache.getSnapshot(app.events),
    propose: (proposal, detail) =>
      transactions
        .propose(proposal, {
          onEventChange: (change) => defaultSave(app, change),
          policies: [snapPolicy({ hours: 1 })],
          snapshot: cache.getSnapshot(app.events),
          timeZone,
        })
        .then((result) => {
          app.history.record(result, detail);
          return result;
        }),
  };
  return { redo: () => app.history.redo(context), undo: () => app.history.undo(context) };
}

/** Makes the app's saves wait until the returned `finish` runs, and restores its handler. */
function holdSaves(app: ReturnType<typeof createApp>) {
  const save = app.handler;
  const held: (() => void)[] = [];
  app.handler = (change) =>
    new Promise<void>((resolve) => {
      held.push(() => {
        void save(change);
        resolve();
      });
    });
  return {
    finish: () => held.splice(0).forEach((run) => run()),
    release: () => {
      app.handler = save;
    },
  };
}

describe("races", () => {
  test("a redo that commits after a new step goes back on top of undo", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.undo();
    const saves = holdSaves(app);
    const redoing = app.redo();
    await vi.waitFor(() => expect(app.history.getSnapshot().pending).not.toBeNull());
    saves.release();
    await app.propose(moveTo("b", "13:00", "14:00"));
    saves.finish();

    expect((await redoing).status).toBe("committed");
    expect(app.where("a")).toBe("10:00-11:00");
    expect(app.steps()).toEqual(["move b", "move a"]);
    await app.undo();
    expect(app.where("a")).toBe("09:00-10:00");
  });

  test("a rejected redo stays to try again", async () => {
    let closed = false;
    const app = createApp([event("a", "09:00", "10:00")], {
      policies: [() => (closed ? { reason: "closed", type: "reject" } : { type: "accept" })],
    });
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.undo();
    closed = true;
    expect(await app.redo()).toMatchObject({ result: { reason: "closed" }, status: "rejected" });
    expect(app.steps("redo")).toEqual(["move a"]);
    closed = false;
    expect((await app.redo()).status).toBe("committed");
    expect(app.where("a")).toBe("10:00-11:00");
  });

  test("an undo waits for a change still saving, and takes that change back", async () => {
    const app = createApp([event("a", "09:00", "10:00")]);
    await app.propose(moveTo("a", "10:00", "11:00"));
    const saves = holdSaves(app);
    const dragging = app.propose(moveTo("a", "13:00", "14:00"));
    saves.release();
    const undoing = app.undo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(app.history.getSnapshot().pending).toBeNull();

    saves.finish();
    await dragging;
    expect((await undoing).status).toBe("committed");
    expect(app.where("a")).toBe("10:00-11:00");
    // The first move is still there to undo.
    expect(app.steps()).toEqual(["move a"]);
  });

  test("an undo before createdEventId can name the create keeps the step for later", async () => {
    let named = false;
    let app!: ReturnType<typeof createApp>;
    app = createApp([], {
      history: { createdEventId: (change) => (named ? app.createdIds.get(change.id) : undefined) },
    });
    await app.propose({ cause: "create", proposed: timed("09:00", "10:00") });
    expect(await app.undo()).toMatchObject({
      result: { reason: "unknown-event", status: "rejected" },
      status: "rejected",
    });
    expect(app.steps()).toEqual(["create new"]);
    named = true;
    expect((await app.undo()).status).toBe("committed");
    expect(app.events).toEqual([]);
  });

  test("a create whose event was deleted unseen waits once, then drops on newer events", async () => {
    let app!: ReturnType<typeof createApp>;
    app = createApp([event("b", "11:00", "12:00")], {
      history: {
        // An app that can't restore leaves deletes out, and names a create once it shows.
        createdEventId: (change, events) => {
          const id = app.createdIds.get(change.id);
          return id !== undefined && events.get(id) !== undefined ? id : undefined;
        },
        filter: (change) => change.cause !== "delete",
      },
    });
    await app.propose(moveTo("b", "13:00", "14:00"));
    await app.propose({ cause: "create", proposed: timed("09:00", "10:00") });
    await app.propose({ cause: "delete", eventId: "created-1" }, { input: "api" });
    expect(app.steps()).toEqual(["move b", "create new"]);

    // The same events again: still waiting.
    expect(await app.undo()).toMatchObject({ result: { reason: "unknown-event" } });
    expect(await app.undo()).toMatchObject({ result: { reason: "unknown-event" } });
    // Newer events without it: gone.
    app.events = [...app.events];
    expect((await app.undo()).status).toBe("stale");
    expect((await app.undo()).status).toBe("committed");
    expect(app.where("b")).toBe("11:00-12:00");
  });

  test("a redo queued after a restore under a new ID finds it before the events show it", async () => {
    let app!: ReturnType<typeof createApp>;
    app = createApp([event("a", "09:00", "10:00")], {
      history: { createdEventId: (change) => app.createdIds.get(change.id) },
      newIds: true,
    });
    await app.propose({ cause: "delete", eventId: "a" }, { input: "api" });
    const shown = app.visible();
    const context = { getEvents: () => shown, propose: app.propose };
    const outcomes = await Promise.all([app.history.undo(context), app.history.redo(context)]);
    expect(outcomes.map(({ status }) => status)).toEqual(["committed", "committed"]);
    expect(app.events).toEqual([]);
  });

  test("a coalesce that throws leaves the history as it was", async () => {
    const app = createApp([event("a", "09:00", "10:00"), event("b", "11:00", "12:00")], {
      history: {
        coalesce: () => {
          throw new Error("coalesce failed");
        },
      },
    });
    await app.propose(moveTo("a", "10:00", "11:00"));
    await app.propose(moveTo("b", "13:00", "14:00"));
    await app.undo();
    await expect(app.propose(moveTo("a", "12:00", "13:00"))).rejects.toThrow("coalesce failed");
    expect(app.steps()).toEqual(["move a"]);
    expect(app.steps("redo")).toEqual(["move b"]);
    expect((await app.redo()).status).toBe("committed");
  });
});
