import { describe, expect, test, vi } from "vite-plus/test";

import {
  applyEventOverlay,
  createCanonicalEventAdapter,
  createEventSnapshotCache,
  createEventTransactions,
  moveEventPlacement,
  snapPolicy,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventInterval,
  type CalendarEventPlacement,
  type CalendarEventProposal,
  type CalendarPolicy,
  type EventAdapter,
} from "../src/index";

type TestEvent = CalendarEvent<{ readonly revision: number }, string, string>;
type Change = CalendarEventChange<TestEvent, string, string>;
type Handler = CalendarEventChangeHandler<TestEvent, string, string>;
type Policy = CalendarPolicy<TestEvent, string, string>;

const timeZone = "America/New_York";

function zoned(value: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(`${value}[${timeZone}]`);
}

function interval(start: string, end: string): CalendarEventInterval {
  return { end: zoned(end).toInstant(), kind: "timed", start: zoned(start).toInstant() };
}

function placement(
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
): CalendarEventPlacement<string> {
  return { ...interval(start, end), resourceIds };
}

function event(
  id: string,
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
): TestEvent {
  return {
    data: { revision: 1 },
    id,
    title: id,
    ...placement(start, end, resourceIds),
  } as TestEvent;
}

function applyChange(events: readonly TestEvent[], change: Change): readonly TestEvent[] {
  if (change.cause === "create") {
    return [
      ...events,
      { data: { revision: 1 }, id: "created", title: "New", ...change.proposed } as TestEvent,
    ];
  }
  if (change.cause === "delete") return events.filter(({ id }) => id !== change.eventId);
  return events.map((current) =>
    current.id === change.eventId
      ? ({
          ...current,
          data: { revision: current.data.revision + 1 },
          ...change.proposed,
        } as TestEvent)
      : current,
  );
}

/** A minimal application: it owns the events and reports each new snapshot, as React would. */
function createHarness(
  initial: readonly TestEvent[],
  adapter: EventAdapter<TestEvent, string, string> = createCanonicalEventAdapter(),
) {
  const cache = createEventSnapshotCache(adapter);
  const transactions = createEventTransactions<TestEvent, string, string>();
  let events = initial;

  const harness = {
    get snapshot() {
      return cache.getSnapshot(events);
    },
    transactions,
    apply(change: Change) {
      harness.setEvents(applyChange(events, change));
    },
    setEvents(next: readonly TestEvent[]) {
      events = next;
      transactions.reconcile(cache.getSnapshot(events));
    },
    propose(
      proposal: CalendarEventProposal<string, string>,
      onEventChange: Handler,
      policies?: readonly Policy[],
    ) {
      return transactions.propose(proposal, {
        onEventChange,
        policies,
        snapshot: cache.getSnapshot(events),
        timeZone,
      });
    },
    /** Wall-clock start of an event as the user sees it, with its pending flag. */
    visible(id: string) {
      const current = applyEventOverlay(harness.snapshot, transactions.getPending()).get(id);
      if (current === undefined) return "hidden";
      const start =
        current.kind === "timed"
          ? current.start
              .toZonedDateTimeISO(timeZone)
              .toPlainTime()
              .toString({ smallestUnit: "minute" })
          : current.start.toString();
      return current.isPending === true ? `${start} (pending)` : start;
    },
  };
  return harness;
}

const move = (
  eventId: string,
  start: string,
  end: string,
): CalendarEventProposal<string, string> => ({
  cause: "move",
  eventId,
  proposed: interval(start, end),
});

describe("event transactions", () => {
  test("commits synchronously and lets the application's events take over", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00", ["room-1"])]);
    const received: Change[] = [];

    const result = app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), (change) => {
      received.push(change);
      app.apply(change);
    });

    expect(app.transactions.getPending().size).toBe(0);
    expect(app.visible("a")).toBe("11:00");
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      cause: "move",
      event: { id: "a" },
      eventId: "a",
      original: { resourceIds: ["room-1"] },
      proposed: { resourceIds: ["room-1"] },
    });
    expect(received[0]?.original).not.toHaveProperty("title");
    await expect(result).resolves.toEqual({ change: received[0], status: "committed" });
  });

  test("rejects unknown events and empty placements without calling the handler", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const handler = vi.fn<Handler>();

    await expect(
      app.propose(move("missing", "2026-08-15T11:00", "2026-08-15T12:00"), handler),
    ).resolves.toEqual({
      reason: "unknown-event",
      status: "rejected",
    });
    await expect(
      app.propose(move("a", "2026-08-15T11:00", "2026-08-15T11:00"), handler),
    ).resolves.toMatchObject({
      reason: "invalid-placement",
      status: "rejected",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  test("hands the adjusted change to the handler and reports policy rejections", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const handler = vi.fn<Handler>();

    await app.propose(move("a", "2026-08-15T11:07", "2026-08-15T12:07"), handler, [
      snapPolicy({ minutes: 15 }),
    ]);
    expect(handler.mock.calls[0]?.[0].proposed).toEqual(
      placement("2026-08-15T11:00", "2026-08-15T12:00"),
    );

    const result = await app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
      () => ({ reason: "closed", type: "reject" }),
    ]);
    expect(result).toMatchObject({ reason: "closed", status: "rejected" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("keeps a 09:00 event at 09:00 when moved a week across DST", async () => {
    const app = createHarness([event("a", "2026-03-02T09:00", "2026-03-02T10:00")]);
    const current = app.snapshot.get("a")!;
    const handler = vi.fn<Handler>((change) => app.apply(change));

    await app.propose(
      {
        cause: "move",
        eventId: "a",
        proposed: moveEventPlacement(current, { weeks: 1 }, { timeZone }),
      },
      handler,
      [snapPolicy({ minutes: 15 })],
    );
    expect(app.visible("a")).toBe("09:00");
    expect(app.snapshot.get("a")?.start.toString()).toBe("2026-03-09T13:00:00Z");
  });

  test("shows an async change as pending until the handler resolves and events reflect it", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const saving = Promise.withResolvers<void>();
    const notifications = vi.fn();
    app.transactions.subscribe(notifications);

    let proposed: Change | undefined;
    const result = app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), (change) => {
      proposed = change;
      return saving.promise;
    });
    expect(app.visible("a")).toBe("11:00 (pending)");
    expect(notifications).toHaveBeenCalledTimes(1);

    // The application applies the change before its request finishes; it stays pending.
    app.apply(proposed!);
    expect(app.visible("a")).toBe("11:00 (pending)");

    saving.resolve();
    await expect(result).resolves.toMatchObject({ status: "committed" });
    expect(app.visible("a")).toBe("11:00");
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("holds a resolved change until newer events arrive, without leaving a stale preview", async () => {
    const app = createHarness([
      event("a", "2026-08-15T09:00", "2026-08-15T10:00"),
      event("b", "2026-08-15T13:00", "2026-08-15T14:00"),
    ]);

    await app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), async () => {});
    expect(app.visible("a")).toBe("11:00 (pending)");

    // A refetch that does not include the change wins over the preview.
    app.setEvents(app.snapshot.events.map(({ event: current }) => current));
    expect(app.visible("a")).toBe("09:00");
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("confirms a resolved change by revision even when the server adjusted it", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")], {
      ...createCanonicalEventAdapter(),
      getRevision: (current) => current.data.revision,
    });

    await app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), (change) => {
      // The server stores 11:30 instead; the new revision confirms the change anyway.
      app.apply({
        ...change,
        proposed: placement("2026-08-15T11:30", "2026-08-15T12:30"),
      } as Change);
      return Promise.resolve();
    });
    expect(app.visible("a")).toBe("11:30");
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("keeps a source-time-zone-only update pending until events reflect it", async () => {
    const original = {
      data: { revision: 1 },
      end: zoned("2026-08-15T10:00").toInstant(),
      id: "a",
      kind: "timed",
      resourceIds: [],
      sourceTimeZone: "UTC",
      start: zoned("2026-08-15T09:00").toInstant(),
      title: "a",
    } satisfies TestEvent;
    const app = createHarness([original]);
    const saving = Promise.withResolvers<void>();
    const visible = () => applyEventOverlay(app.snapshot, app.transactions.getPending()).get("a");

    const result = app.propose(
      { cause: "update", eventId: "a", proposed: { ...original, sourceTimeZone: timeZone } },
      () => saving.promise,
    );
    saving.resolve();
    await result;
    expect(visible()).toMatchObject({ isPending: true, sourceTimeZone: timeZone });

    app.setEvents([{ ...original, sourceTimeZone: timeZone }]);
    expect(app.transactions.getPending().size).toBe(0);
    expect(visible()).toMatchObject({ sourceTimeZone: timeZone });
  });

  test("rolls back when the handler rejects or throws", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const saving = Promise.withResolvers<void>();
    const failure = new Error("offline");

    const pending = app.propose(
      move("a", "2026-08-15T11:00", "2026-08-15T12:00"),
      () => saving.promise,
    );
    expect(app.visible("a")).toBe("11:00 (pending)");
    saving.reject(failure);
    await expect(pending).resolves.toMatchObject({
      error: failure,
      reason: "handler-error",
      status: "rejected",
    });
    expect(app.visible("a")).toBe("09:00");

    const thrown = await app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), () => {
      throw failure;
    });
    expect(thrown).toMatchObject({ error: failure, reason: "handler-error", status: "rejected" });
    expect(app.visible("a")).toBe("09:00");
  });

  test("lets the latest proposal for an event win regardless of settlement order", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    const changes: Change[] = [];

    const firstResult = app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), (change) => {
      changes.push(change);
      return first.promise;
    });
    const secondResult = app.propose(
      move("a", "2026-08-15T14:00", "2026-08-15T15:00"),
      (change) => {
        changes.push(change);
        return second.promise;
      },
    );

    expect(app.visible("a")).toBe("14:00 (pending)");
    // The second drag started from where the first one left the event.
    expect(changes[1]?.original).toEqual(placement("2026-08-15T11:00", "2026-08-15T12:00"));

    first.resolve();
    await firstResult;
    expect(app.visible("a")).toBe("14:00 (pending)");

    second.reject(new Error("conflict"));
    await secondResult;
    expect(app.visible("a")).toBe("09:00");
  });

  test("ignores a late rejection from a change that was already superseded", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();

    const firstResult = app.propose(
      move("a", "2026-08-15T11:00", "2026-08-15T12:00"),
      () => first.promise,
    );
    void app.propose(move("a", "2026-08-15T14:00", "2026-08-15T15:00"), () => second.promise);

    first.reject(new Error("stale"));
    await expect(firstResult).resolves.toMatchObject({ status: "rejected" });
    expect(app.visible("a")).toBe("14:00 (pending)");
  });

  test("a synchronous commit replaces an older change still in flight", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const first = Promise.withResolvers<void>();

    const firstResult = app.propose(
      move("a", "2026-08-15T11:00", "2026-08-15T12:00"),
      () => first.promise,
    );
    await app.propose(move("a", "2026-08-15T14:00", "2026-08-15T15:00"), (change) =>
      app.apply(change),
    );
    expect(app.visible("a")).toBe("14:00");

    first.resolve();
    await firstResult;
    expect(app.visible("a")).toBe("14:00");
  });

  test("shows a change while async policies decide and supersedes it by a newer proposal", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const decision = Promise.withResolvers<{ readonly type: "accept" }>();
    const handler = vi.fn<Handler>((change) => app.apply(change));

    const slow = app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
      () => decision.promise,
    ]);
    expect(app.visible("a")).toBe("11:00 (pending)");

    await app.propose(move("a", "2026-08-15T14:00", "2026-08-15T15:00"), handler);
    decision.resolve({ type: "accept" });

    await expect(slow).resolves.toMatchObject({ reason: "superseded", status: "rejected" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(app.visible("a")).toBe("14:00");
  });

  test("drops an older validation's preview when a newer proposal is rejected", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const decision = Promise.withResolvers<{ readonly type: "accept" }>();
    const handler = vi.fn<Handler>();

    const slow = app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
      () => decision.promise,
    ]);
    await expect(
      app.propose(move("a", "2026-08-15T14:00", "2026-08-15T15:00"), handler, [
        () => ({ reason: "closed", type: "reject" }),
      ]),
    ).resolves.toMatchObject({ reason: "closed", status: "rejected" });
    expect(app.visible("a")).toBe("09:00");

    decision.resolve({ type: "accept" });
    await expect(slow).resolves.toMatchObject({ reason: "superseded", status: "rejected" });
    expect(handler).not.toHaveBeenCalled();
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("keeps an older change that is already saving when a newer proposal is rejected", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const saving = Promise.withResolvers<void>();

    void app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), () => saving.promise);
    await app.propose(move("a", "2026-08-15T14:00", "2026-08-15T15:00"), vi.fn<Handler>(), [
      () => ({ reason: "closed", type: "reject" }),
    ]);
    expect(app.visible("a")).toBe("11:00 (pending)");
  });

  test("rolls back an optimistic change when an async policy rejects or throws", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const handler = vi.fn<Handler>();

    await expect(
      app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
        async () => ({ reason: "busy", type: "reject" }),
      ]),
    ).resolves.toMatchObject({ reason: "busy", status: "rejected" });
    expect(app.visible("a")).toBe("09:00");

    const failure = new Error("policy bug");
    await expect(
      app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
        () => Promise.reject(failure),
      ]),
    ).resolves.toMatchObject({ error: failure, reason: "policy-error", status: "rejected" });
    await expect(
      app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
        () => {
          throw failure;
        },
      ]),
    ).resolves.toMatchObject({ error: failure, reason: "policy-error", status: "rejected" });
    await expect(
      app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), handler, [
        () => ({ proposed: { kind: "timed" } as CalendarEventPlacement<string>, type: "adjust" }),
      ]),
    ).resolves.toMatchObject({ reason: "policy-error", status: "rejected" });
    expect(app.visible("a")).toBe("09:00");
    expect(handler).not.toHaveBeenCalled();
  });

  test("hands creates to the handler without an overlay", async () => {
    const app = createHarness([]);
    const saving = Promise.withResolvers<void>();
    const handler = vi.fn<Handler>(() => saving.promise);

    const result = app.propose(
      { cause: "create", proposed: placement("2026-08-15T11:00", "2026-08-15T12:00") },
      handler,
    );
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      cause: "create",
      event: null,
      eventId: null,
      original: null,
    });
    expect(handler.mock.calls[0]?.[0].proposed?.resourceIds).toEqual([]);
    expect(app.transactions.getPending().size).toBe(0);

    saving.resolve();
    await expect(result).resolves.toMatchObject({ status: "committed" });
  });

  test("hides a pending deletion until the application removes the event", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const saving = Promise.withResolvers<void>();

    const result = app.propose({ cause: "delete", eventId: "a" }, (change) => {
      expect(change).toMatchObject({ cause: "delete", proposed: null });
      return saving.promise;
    });
    expect(app.visible("a")).toBe("hidden");

    app.setEvents([]);
    saving.resolve();
    await result;
    expect(app.transactions.getPending().size).toBe(0);
  });

  test("keeps the pending map identity stable until it changes and supports unsubscribing", async () => {
    const app = createHarness([event("a", "2026-08-15T09:00", "2026-08-15T10:00")]);
    const listener = vi.fn();
    const unsubscribe = app.transactions.subscribe(listener);
    const empty = app.transactions.getPending();

    app.setEvents([
      ...app.snapshot.events.map(({ event: current }) => current),
      event("b", "2026-08-15T13:00", "2026-08-15T14:00"),
    ]);
    expect(app.transactions.getPending()).toBe(empty);
    expect(listener).not.toHaveBeenCalled();

    unsubscribe();
    await app.propose(move("a", "2026-08-15T11:00", "2026-08-15T12:00"), async () => {});
    expect(app.transactions.getPending()).not.toBe(empty);
    expect(listener).not.toHaveBeenCalled();
  });
});
