// @vitest-environment jsdom

import {
  defineEventAdapter,
  type CalendarEventChange,
  type CalendarEventChangeHandler,
  type CalendarEventInput,
  type CalendarEventProposal,
  type CalendarPendingChanges,
  type CalendarPolicy,
  type CalendarProposalDetail,
  type CalendarTransactionResult,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";
import { act, memo, useState, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
  createCalendar,
  defineCalendarView,
  type CalendarViewActions,
} from "@moltenship/calendar-react";

import { gateWeekRules } from "./harness/builders";
import { allDay, KeyboardFixture } from "./harness/keyboard-fixture";
import {
  hydrateWithHarness,
  renderWithHarness,
  type ReactRootHarness,
} from "./harness/render-harness";
import "./setup";

interface Meeting {
  readonly end: Temporal.Instant;
  readonly id: string;
  readonly locked?: boolean;
  readonly start: Temporal.Instant;
  readonly title: string;
}

type Change = CalendarEventChange<Meeting, string, string>;
type Handler = CalendarEventChangeHandler<Meeting, string, string>;
type Policy = CalendarPolicy<Meeting, string, string>;
type Result = CalendarTransactionResult<Meeting, string, string>;
type ResultHandler = (result: Result, detail: CalendarProposalDetail) => void;

function meeting(id: string, start: string, end: string, title = id): Meeting {
  return Object.freeze({
    end: Temporal.Instant.from(`2026-08-15T${end}:00Z`),
    id,
    start: Temporal.Instant.from(`2026-08-15T${start}:00Z`),
    title,
  });
}

const standup = meeting("standup", "09:00", "10:00", "Standup");
const review = Object.freeze({ ...meeting("review", "15:00", "16:00", "Review"), locked: true });

let viewActions: CalendarViewActions | undefined;
let viewRenders = 0;

const agendaView = defineCalendarView({
  name: "agenda",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    getTitle: (range) => range.start.toString(),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    project: ({ instantRange, snapshot }) => snapshot.queryTimed(instantRange),
  },
  Renderer({ actions, projection }) {
    viewActions = actions;
    viewRenders += 1;
    return (
      <ol>
        {projection.map((event) => (
          <li key={event.id}>
            {`${event.title} ${event.start.toString()}${event.isPending === true ? " (pending)" : ""}`}
          </li>
        ))}
      </ol>
    );
  },
});

const MeetingCalendar = createCalendar<Meeting>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (record) => record.id,
    getInterval: (record) => ({ end: record.end, kind: "timed", start: record.start }),
    getResourceIds: (): readonly string[] => [],
    getTitle: (record) => record.title,
    isReadOnly: (record) => record.locked === true,
  }),
  views: [agendaView],
});

function applyChange(events: readonly Meeting[], change: Change): readonly Meeting[] {
  if (change.cause === "create" && change.proposed.kind === "timed") {
    return [
      ...events,
      { end: change.proposed.end, id: "created", start: change.proposed.start, title: "New" },
    ];
  }
  return events.map((record) =>
    record.id === change.eventId && change.proposed?.kind === "timed"
      ? { ...record, end: change.proposed.end, start: change.proposed.start }
      : record,
  );
}

/** Renders the pending changes as `<change ID> <event ID or "new"> <phase>`. */
function PendingList() {
  const changes = MeetingCalendar.useCalendarPendingChanges();
  return (
    <output data-pending="">
      {[...changes.values()]
        .map(({ change, phase }) => `${change.id} ${change.eventId ?? "new"} ${phase}`)
        .join(", ") || "none"}
    </output>
  );
}

let updateEvents:
  | ((update: (events: readonly Meeting[]) => readonly Meeting[]) => void)
  | undefined;

/** An application that owns its events in state, or reads them from a source. */
function Application(props: {
  readonly children?: ReactNode;
  readonly events?: CalendarEventInput<Meeting>;
  readonly onEventChange?: Handler;
  readonly onEventChangeResult?: ResultHandler;
  readonly policies?: readonly Policy[];
}) {
  const [events, setEvents] = useState<readonly Meeting[]>([standup, review]);
  updateEvents = setEvents;
  return (
    <MeetingCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-08-15")}
      defaultTimeZone="UTC"
      events={props.events ?? events}
      locale="en-GB"
      onEventChange={props.onEventChange}
      onEventChangeResult={props.onEventChangeResult}
      policies={props.policies}
      weekRules={gateWeekRules}
    >
      <MeetingCalendar.ActiveView />
      <PendingList />
      {props.children}
    </MeetingCalendar.Root>
  );
}

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.dispose();
  document.body.replaceChildren();
  updateEvents = undefined;
  viewActions = undefined;
  viewRenders = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(element: ReactNode): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

function pendingText(harness: ReactRootHarness): string {
  return harness.container.querySelector("[data-pending]")!.textContent;
}

function move(start: string, end: string, eventId = "standup") {
  return {
    cause: "move",
    eventId,
    proposed: {
      end: Temporal.Instant.from(`2026-08-15T${end}:00Z`),
      kind: "timed",
      start: Temporal.Instant.from(`2026-08-15T${start}:00Z`),
    },
  } as const satisfies CalendarEventProposal<string, string>;
}

const create = {
  cause: "create",
  proposed: {
    end: Temporal.Instant.from("2026-08-15T13:00:00Z"),
    kind: "timed",
    start: Temporal.Instant.from("2026-08-15T12:00:00Z"),
  },
} as const satisfies CalendarEventProposal<string, string>;

/** Proposes as application code would and flushes the render; the result settles later. */
async function propose(
  proposal: CalendarEventProposal<EventId, ResourceId>,
  detail?: CalendarProposalDetail,
): Promise<{ readonly result: Promise<Result> }> {
  let result!: Promise<Result>;
  await act(async () => {
    result = viewActions!.proposeEventChange(proposal, detail) as Promise<Result>;
  });
  return { result };
}

async function settle(result: Promise<Result>): Promise<Result> {
  let settled!: Result;
  await act(async () => {
    settled = await result;
  });
  return settled;
}

describe("onEventChangeResult", () => {
  test("hears each proposal once, with the result its promise resolves with", async () => {
    const onEventChangeResult = vi.fn<ResultHandler>();
    await render(
      <Application
        onEventChange={(change) => updateEvents!((events) => applyChange(events, change))}
        onEventChangeResult={onEventChangeResult}
      />,
    );

    const { result } = await propose(move("11:00", "12:00"));
    const settled = await settle(result);

    expect(settled).toMatchObject({ status: "committed" });
    expect(onEventChangeResult).toHaveBeenCalledOnce();
    expect(onEventChangeResult.mock.calls[0]![0]).toBe(settled);
    expect(onEventChangeResult.mock.calls[0]![1]).toEqual({ input: "api" });
  });

  test("reports every rejection, each with its reason", async () => {
    const results: [string, Result][] = [];
    const failure = new Error("offline");
    const policyFailure = new Error("policy bug");
    let policy: Policy = () => ({ type: "accept" });
    let handler: Handler = () => undefined;
    await render(
      <Application
        onEventChange={(change) => handler(change)}
        onEventChangeResult={(result, { input }) => results.push([input, result])}
        policies={[(change, context) => policy(change, context)]}
      />,
    );
    async function outcome(proposal: CalendarEventProposal<string, string>) {
      const { result } = await propose(proposal);
      await settle(result);
      const [input, reported] = results.at(-1)!;
      expect(input).toBe("api");
      return reported;
    }

    expect(await outcome(move("15:00", "16:00", "review"))).toMatchObject({
      change: { eventId: "review" },
      reason: "read-only",
      status: "rejected",
    });
    policy = () => ({ reason: "out-of-bounds", type: "reject" });
    expect(await outcome(move("11:00", "12:00"))).toMatchObject({
      change: { eventId: "standup" },
      reason: "out-of-bounds",
    });
    policy = () => {
      throw policyFailure;
    };
    expect(await outcome(move("11:00", "12:00"))).toMatchObject({
      error: policyFailure,
      reason: "policy-error",
    });
    // A policy that adjusts the change until it is empty.
    policy = (change) =>
      change.proposed?.kind === "timed"
        ? { proposed: { ...change.proposed, end: change.proposed.start }, type: "adjust" }
        : { type: "accept" };
    expect(await outcome(move("11:00", "12:00"))).toMatchObject({
      change: { eventId: "standup" },
      reason: "invalid-placement",
    });
    policy = () => ({ type: "accept" });
    expect(await outcome(move("11:00", "11:00"))).toMatchObject({ reason: "invalid-placement" });
    handler = () => Promise.reject(failure);
    expect(await outcome(move("11:00", "12:00"))).toMatchObject({
      change: { eventId: "standup" },
      error: failure,
      reason: "handler-error",
    });
    handler = () => {
      throw failure;
    };
    expect(await outcome(create)).toMatchObject({
      change: { cause: "create" },
      error: failure,
      reason: "handler-error",
    });
    expect(await outcome(move("11:00", "12:00", "missing"))).toEqual({
      reason: "unknown-event",
      status: "rejected",
    });
    expect(results).toHaveLength(8);
  });

  test("hears a root without onEventChange reject with the change", async () => {
    const onEventChangeResult = vi.fn<ResultHandler>();
    await render(<Application onEventChangeResult={onEventChangeResult} />);

    const { result } = await propose(move("11:00", "12:00"));
    await settle(result);

    expect(onEventChangeResult.mock.calls[0]![0]).toMatchObject({
      change: { cause: "move", eventId: "standup" },
      reason: "read-only",
      status: "rejected",
    });
  });

  test("runs before the code that awaits the proposal", async () => {
    const order: string[] = [];
    await render(
      <Application
        onEventChange={() => undefined}
        onEventChangeResult={() => order.push("onEventChangeResult")}
      />,
    );

    await act(async () => {
      await viewActions!.proposeEventChange(move("11:00", "12:00"));
      order.push("caller");
    });
    expect(order).toEqual(["onEventChangeResult", "caller"]);
  });

  test("reads the latest render's callback, also after the root unmounts", async () => {
    const saving = Promise.withResolvers<void>();
    const first = vi.fn<ResultHandler>();
    const second = vi.fn<ResultHandler>();
    const harness = await render(
      <Application onEventChange={() => saving.promise} onEventChangeResult={first} />,
    );

    const { result } = await propose(move("11:00", "12:00"));
    await harness.render(
      <Application onEventChange={() => saving.promise} onEventChangeResult={second} />,
    );
    await harness.unmount();
    saving.resolve();
    await result;

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(second.mock.calls[0]![0]).toMatchObject({ status: "committed" });
  });

  test("reports a callback that throws without failing the proposal", async () => {
    const failure = new Error("toast bug");
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    await render(
      <Application
        onEventChange={() => undefined}
        onEventChangeResult={() => {
          throw failure;
        }}
      />,
    );

    const { result } = await propose(move("11:00", "12:00"));
    await expect(settle(result)).resolves.toMatchObject({ status: "committed" });
    expect(reported).toHaveBeenCalledWith(failure);
  });

  test("passes on the input a proposal names", async () => {
    const onEventChangeResult = vi.fn<ResultHandler>();
    await render(
      <Application onEventChange={() => undefined} onEventChangeResult={onEventChangeResult} />,
    );

    const { result } = await propose(move("11:00", "12:00"), { input: "pointer" });
    await settle(result);

    expect(onEventChangeResult.mock.calls[0]![1]).toEqual({ input: "pointer" });
  });

  test("hears keyboard commits and rejections as the keyboard's", async () => {
    const results: [string, Result["status"], string | undefined][] = [];
    let rejecting = false;
    const harness = await render(
      <KeyboardFixture
        initialEvents={[
          allDay("trip", "2026-10-07", "2026-10-09", "Trip"),
          allDay("locked", "2026-10-14", "2026-10-15", "Locked"),
        ]}
        onResult={(result, { input }) =>
          results.push([
            input,
            result.status,
            result.status === "rejected" ? result.reason : result.change.eventId!,
          ])
        }
        policies={[() => (rejecting ? { reason: "closed", type: "reject" } : { type: "accept" })]}
      />,
    );
    const trip = () => harness.container.querySelector<HTMLElement>('[data-event="trip"]')!;
    async function press(key: string) {
      await act(async () => {
        document.activeElement!.dispatchEvent(
          new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
        );
        await Promise.resolve();
      });
    }

    await act(async () => trip().focus());
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await vi.waitFor(() => expect(results).toHaveLength(1));

    rejecting = true;
    await act(async () => trip().focus());
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await vi.waitFor(() => expect(results).toHaveLength(2));

    // A grab refused on a read-only event, and a cancelled one, propose nothing.
    await act(async () =>
      harness.container.querySelector<HTMLElement>('[data-event="locked"]')!.focus(),
    );
    await press(" ");
    await act(async () => trip().focus());
    await press(" ");
    await press("Escape");

    expect(results).toEqual([
      ["keyboard", "committed", "trip"],
      ["keyboard", "rejected", "closed"],
    ]);
  });
});

describe("useCalendarPendingChanges", () => {
  test("follows a change through validating, saving and the events that show it", async () => {
    const decision = Promise.withResolvers<{ readonly type: "accept" }>();
    const saving = Promise.withResolvers<void>();
    let received: Change | undefined;
    const harness = await render(
      <Application
        onEventChange={(change) => {
          received = change;
          return saving.promise;
        }}
        policies={[() => decision.promise]}
      />,
    );
    expect(pendingText(harness)).toBe("none");

    const { result } = await propose(move("11:00", "12:00"));
    expect(pendingText(harness)).toBe("change-1 standup validating");

    await act(async () => decision.resolve({ type: "accept" }));
    expect(pendingText(harness)).toBe("change-1 standup saving");

    const rendersBefore = viewRenders;
    await act(async () => saving.resolve());
    await settle(result);
    expect(pendingText(harness)).toBe("change-1 standup awaiting-events");
    // Only the phase changed, so the view didn't render or project again.
    expect(viewRenders).toBe(rendersBefore);

    await act(async () => updateEvents!((events) => applyChange(events, received!)));
    expect(pendingText(harness)).toBe("none");
  });

  test("ends a change that waits for a source when the source confirms it", async () => {
    let events: readonly Meeting[] = [standup];
    const listeners = new Set<() => void>();
    const source = {
      getServerSnapshot: () => events,
      getSnapshot: () => events,
      subscribe(listener: () => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    let received: Change | undefined;
    const harness = await render(
      <Application
        events={source}
        onEventChange={async (change) => {
          received = change;
        }}
      />,
    );

    const { result } = await propose(move("11:00", "12:00"));
    await settle(result);
    expect(pendingText(harness)).toBe("change-1 standup awaiting-events");

    await act(async () => {
      events = applyChange(events, received!);
      for (const listener of listeners) listener();
    });
    expect(pendingText(harness)).toBe("none");
  });

  test("includes creates while they save", async () => {
    const saving = Promise.withResolvers<void>();
    const harness = await render(<Application onEventChange={() => saving.promise} />);

    const { result } = await propose(create);
    expect(pendingText(harness)).toBe("change-1 new saving");

    await act(async () => saving.resolve());
    await settle(result);
    expect(pendingText(harness)).toBe("none");
  });

  test("with a selector, re-renders only when the selection changes", async () => {
    const decision = Promise.withResolvers<{ readonly type: "accept" }>();
    const saving = Promise.withResolvers<void>();
    const seen: boolean[] = [];
    // Memoized, so only the hook re-renders it, not the application's own renders.
    const Saving = memo(function Saving() {
      const busy = MeetingCalendar.useCalendarPendingChanges((changes) => changes.size > 0);
      seen.push(busy);
      return null;
    });
    let received: Change | undefined;
    await render(
      <Application
        onEventChange={(change) => {
          received = change;
          return saving.promise;
        }}
        policies={[() => decision.promise]}
      >
        <Saving />
      </Application>,
    );

    const { result } = await propose(move("11:00", "12:00"));
    await act(async () => decision.resolve({ type: "accept" }));
    await act(async () => saving.resolve());
    await settle(result);
    await act(async () => updateEvents!((events) => applyChange(events, received!)));

    // Validating, saving and awaiting the events are all "busy": one render for each change.
    expect(seen).toEqual([false, true, false]);
  });

  test("lists every proposal in the races, and each result is its own", async () => {
    const results: string[] = [];
    const requests: PromiseWithResolvers<void>[] = [];
    const decision = Promise.withResolvers<{ readonly type: "accept" }>();
    let slowPolicy = false;
    let synchronous = false;
    const harness = await render(
      <Application
        onEventChange={(change) => {
          if (synchronous) return updateEvents!((events) => applyChange(events, change));
          const request = Promise.withResolvers<void>();
          requests.push(request);
          return request.promise;
        }}
        onEventChangeResult={(result) =>
          results.push(
            `${result.change?.id} ${result.status === "rejected" ? result.reason : result.status}`,
          )
        }
        policies={[() => (slowPolicy ? decision.promise : { type: "accept" })]}
      />,
    );

    // The latest proposal wins, and a late rejection of the older one changes nothing on screen.
    const first = await propose(move("11:00", "12:00"));
    const second = await propose(move("13:00", "14:00"));
    expect(pendingText(harness)).toBe("change-1 standup saving, change-2 standup saving");
    await act(async () => requests[0]!.reject(new Error("stale")));
    await settle(first.result);
    expect(harness.container.querySelector("li")!.textContent).toBe(
      "Standup 2026-08-15T13:00:00Z (pending)",
    );
    expect(pendingText(harness)).toBe("change-2 standup saving");

    // A proposal superseded while its async policy decides.
    slowPolicy = true;
    const third = await propose(move("14:00", "15:00"));
    slowPolicy = false;
    // A synchronous commit replaces the changes still saving or validating on screen.
    synchronous = true;
    const fourth = await propose(move("16:00", "17:00"));
    expect(harness.container.querySelector("li")!.textContent).toBe("Standup 2026-08-15T16:00:00Z");
    expect(pendingText(harness)).toBe("change-2 standup saving, change-3 standup validating");

    await act(async () => decision.resolve({ type: "accept" }));
    await settle(third.result);
    await act(async () => requests[1]!.resolve());
    await settle(second.result);
    await settle(fourth.result);
    expect(pendingText(harness)).toBe("none");
    expect(harness.container.querySelector("li")!.textContent).toBe("Standup 2026-08-15T16:00:00Z");
    expect(results).toEqual([
      "change-1 handler-error",
      "change-4 committed",
      "change-3 superseded",
      "change-2 committed",
    ]);
  });

  test("is typed to the calendar's records, and throws outside a root", () => {
    function Typed() {
      expectTypeOf(MeetingCalendar.useCalendarPendingChanges()).toEqualTypeOf<
        CalendarPendingChanges<Meeting, string, string>
      >();
      expectTypeOf(
        MeetingCalendar.useCalendarPendingChanges((changes) => changes.size),
      ).toEqualTypeOf<number>();
      return null;
    }
    expect(() => renderToString(<Typed />)).toThrow("calendar-hook-outside-root");
  });

  test("reads the empty map on the server and hydrates without a mismatch", async () => {
    expect(renderToString(<Application onEventChange={() => undefined} />)).toContain(
      '<output data-pending="">none</output>',
    );

    const harness = await hydrateWithHarness(<Application onEventChange={() => undefined} />);
    harnesses.push(harness);
    expect(harness.hydratedWithoutMutation).toBe(true);
    expect(harness.recoverableErrors).toEqual([]);
  });
});
