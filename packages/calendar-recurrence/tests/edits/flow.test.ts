import {
  applyEventOverlay,
  createEventSnapshot,
  createEventTransactions,
  moveEventPlacement,
  type CalendarEventChange,
  type CalendarEventPlacement,
  type CalendarWallClockDelta,
  type EventSnapshot,
} from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  isRecurringChange,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
} from "../../src";
import {
  adapters,
  at,
  berlin,
  expand,
  occurrenceAdapter,
  timed,
  type Event,
  type Occurrence,
} from "./harness";

// The optimistic flow of ADR 0048 points 7 and 8, with core's transactions: the application asks
// for a scope while its `onEventChange` promise is pending, then persists the edit and reports the
// new events, as a React app re-rendering would.

type Snapshot = EventSnapshot<Occurrence, string, string>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const flush = () => new Promise((done) => setTimeout(done, 0));

const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
  recurrence: { rule: { count: 8, frequency: "WEEKLY" } },
});

/** A minimal application: its events, its snapshot, and a scope prompt the test answers. */
function createApp(initial: readonly Event[], reportFirst: boolean) {
  const transactions = createEventTransactions<Occurrence, string, string>();
  let events = initial;
  let created = 0;
  const app = {
    events: () => events,
    prompt: deferred<RecurrenceEditScope | null>(),
    selected: undefined as string | undefined,
    snapshot: createEventSnapshot(expand(events), occurrenceAdapter) as Snapshot,
    transactions,
    /** Reports the application's events, as a re-render would. */
    report() {
      app.snapshot = createEventSnapshot(expand(events), occurrenceAdapter);
      transactions.reconcile(app.snapshot);
    },
    onEventChange: async (change: CalendarEventChange<Occurrence, string, string>) => {
      if (!isRecurringChange(change)) return;
      const scope = await app.prompt.promise;
      if (scope === null) throw new Error("cancelled");
      // Picking the new series' ID up front lets the edit map IDs into it.
      const edit = resolveRecurrenceEdit(change, scope, adapters, {
        newSeriesId: `created-${++created}`,
        occurrences: expand(events),
      });
      if (edit.type !== "series") throw new Error(edit.type);
      events = applyRecurrenceEdit(events, edit, { createId: () => `created-${++created}` });
      if (app.selected !== undefined)
        app.selected = edit.occurrenceIds.get(app.selected) ?? app.selected;
      await flush();
      if (reportFirst) app.report();
    },
    propose(occurrenceId: string, proposed: CalendarEventPlacement<string>) {
      return transactions.propose(
        { cause: "move", eventId: occurrenceId, proposed },
        { onEventChange: app.onEventChange, snapshot: app.snapshot, timeZone: berlin },
      );
    },
    shown: () => applyEventOverlay(app.snapshot, transactions.getPending()),
  };
  return app;
}

const id = "standup::2026-11-02T08:00:00Z";
function proposal(app: ReturnType<typeof createApp>, delta: CalendarWallClockDelta) {
  const current = app.snapshot.get(id)!;
  return moveEventPlacement(
    { ...current, resourceIds: current.resourceIds } as CalendarEventPlacement<string>,
    delta,
    { timeZone: berlin },
  );
}

describe("the optimistic flow", () => {
  test("the change stays pending while the scope is asked, and cancelling rolls it back", async () => {
    const app = createApp([standup], true);
    const proposed = proposal(app, { hours: 2 });
    const result = app.propose(id, proposed);
    await flush();

    expect(app.transactions.getPending().get(id)).toEqual(proposed);
    expect(app.shown().get(id)).toMatchObject({ isPending: true, start: at("2026-11-02T11:00") });
    // Other occurrences don't show the change until the application's events do.
    expect(app.shown().get("standup::2026-11-09T08:00:00Z")?.start).toEqual(at("2026-11-09T09:00"));

    // A re-render while the dialog is open keeps the change pending.
    app.report();
    expect(app.transactions.getPending().has(id)).toBe(true);

    app.prompt.resolve(null);
    expect(await result).toMatchObject({ reason: "handler-error", status: "rejected" });
    expect(app.transactions.getPending().size).toBe(0);
    expect(app.shown().get(id)?.start).toEqual(at("2026-11-02T09:00"));
    expect(app.events()).toEqual([standup]);
  });

  for (const reportFirst of [true, false]) {
    const order = reportFirst ? "before the handler settles" : "after it settles";
    describe(`with the new events reported ${order}`, () => {
      test('"this" keeps the occurrence\'s ID, which reconciles at its new placement', async () => {
        const app = createApp([standup], reportFirst);
        app.selected = id;
        const proposed = proposal(app, { hours: 2 });
        const result = app.propose(id, proposed);
        app.prompt.resolve("this");
        expect(await result).toMatchObject({ status: "committed" });
        if (!reportFirst) app.report();

        expect(app.transactions.getPending().size).toBe(0);
        expect(app.shown().get(id)).toMatchObject({ start: proposed.start });
        expect(app.shown().get(id)?.isPending).toBeUndefined();
        expect(app.selected).toBe(id);
        expect(app.shown().size).toBe(8);
      });

      for (const scope of ["all", "following"] as const) {
        test(`"${scope}" retires the old IDs without ghost pending entries`, async () => {
          const app = createApp([standup], reportFirst);
          app.selected = id;
          const before = new Set(app.snapshot.byId.keys());
          const proposed = proposal(app, { days: 1 });
          const result = app.propose(id, proposed);
          app.prompt.resolve(scope);
          expect(await result).toMatchObject({ status: "committed" });
          if (!reportFirst) app.report();

          const shown = app.shown();
          expect(app.transactions.getPending().size).toBe(0);
          expect(shown.get(id)).toBeUndefined();
          expect(shown.events.some((event) => event.isPending)).toBe(false);
          expect(shown.size).toBe(8);

          // Selection follows the occurrence to its new ID, where it shows the proposed start.
          expect(app.selected).not.toBe(id);
          expect(shown.get(app.selected!)?.start).toEqual(proposed.start);
          const moved = [...shown.byId.keys()].filter((key) => !before.has(key));
          expect(moved.length).toBe(scope === "all" ? 8 : 6);
        });
      }

      test('a "this" delete hides the occurrence for good', async () => {
        const app = createApp([standup], reportFirst);
        const result = app.transactions.propose(
          { cause: "delete", eventId: id },
          { onEventChange: app.onEventChange, snapshot: app.snapshot, timeZone: berlin },
        );
        await flush();
        expect(app.shown().get(id)).toBeUndefined();
        app.prompt.resolve("this");
        expect(await result).toMatchObject({ status: "committed" });
        if (!reportFirst) app.report();
        expect(app.transactions.getPending().size).toBe(0);
        expect(app.shown().get(id)).toBeUndefined();
        expect(app.shown().size).toBe(7);
      });
    });
  }
});
