// @vitest-environment jsdom

import {
  createEventHistory,
  type CalendarEventChange,
  type CalendarPolicy,
  type CalendarProposalDetail,
  type EventHistory,
  type EventHistoryOptions,
} from "@moltenship/calendar-core";
import { act, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import {
  useCalendarHistory,
  type CalendarHistory,
  type CalendarHistoryAnnouncementBuilder,
  type CalendarHistoryMessages,
} from "@moltenship/calendar-react";

import {
  allDay,
  KeyboardCalendar,
  testMessages,
  type FixtureEvent,
} from "./harness/keyboard-fixture";
import {
  hydrateWithHarness,
  renderWithHarness,
  type ReactRootHarness,
} from "./harness/render-harness";
import "./setup";

type Change = CalendarEventChange<FixtureEvent, string, string>;
type History = EventHistory<FixtureEvent, string, string>;

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
  heldSaves = null;
  vi.unstubAllGlobals();
});

async function render(element: ReactNode): Promise<ReactRootHarness> {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

/** Says `undo|redo status title range`, so tests read what a screen reader would hear. */
const sayOutcome: CalendarHistoryAnnouncementBuilder = (outcome, { event, formatRange }) => {
  if (outcome.status === "empty") return `${outcome.direction} empty`;
  const placement = outcome.direction === "undo" ? outcome.step.before : outcome.step.after;
  const where = placement === null ? "gone" : formatRange(placement);
  return `${outcome.direction} ${outcome.status} ${event?.title ?? "?"} ${where}`;
};
const historyMessages: CalendarHistoryMessages = { redo: sayOutcome, undo: sayOutcome };

let controls: CalendarHistory<FixtureEvent, string, string> | undefined;
let heldSaves: Promise<void> | null = null;
let actions: ReturnType<typeof KeyboardCalendar.useCalendarActions> | undefined;
let setEvents: Dispatch<SetStateAction<readonly FixtureEvent[]>> | undefined;

function Controls({
  history,
  messages,
}: {
  readonly history: History;
  readonly messages?: CalendarHistoryMessages;
}) {
  controls = useCalendarHistory(history, { messages });
  actions = KeyboardCalendar.useCalendarActions();
  return (
    <output data-history="">{`${controls.past.length} back, ${controls.future.length} forward`}</output>
  );
}

/**
 * A month calendar whose app saves each change into its events, restoring a create's record
 * under its ID, and records results into `history`.
 */
function HistoryFixture({
  children,
  history,
  initialEvents,
  onResult,
  policies,
  silent = false,
}: {
  readonly children?: ReactNode;
  readonly history: History;
  readonly initialEvents: readonly FixtureEvent[];
  readonly onResult?: (detail: CalendarProposalDetail) => void;
  readonly policies?: readonly CalendarPolicy<FixtureEvent, string, string>[];
  /** Leaves `messages` out, so undo and redo say nothing. */
  readonly silent?: boolean;
}) {
  const [events, setState] = useState(initialEvents);
  setEvents = setState;
  const apply = (change: Change) =>
    setState((current) => {
      if (change.cause === "create") {
        return [...current, { ...change.event!, ...change.proposed } as FixtureEvent];
      }
      if (change.cause === "delete") return current.filter(({ id }) => id !== change.eventId);
      return current.map((event) =>
        event.id === change.eventId ? ({ ...event, ...change.proposed } as FixtureEvent) : event,
      );
    });
  // Saves wait for `heldSaves` while a test holds them, as a server would.
  const save = (change: Change) =>
    heldSaves === null ? apply(change) : heldSaves.then(() => apply(change));
  return (
    <KeyboardCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={save}
      onEventChangeResult={(result, detail) => {
        onResult?.(detail);
        history.record(result, detail);
      }}
      policies={policies}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <KeyboardCalendar.ActiveView />
      <KeyboardCalendar.Announcer messages={testMessages} />
      <Controls history={history} messages={silent ? undefined : historyMessages} />
      {children}
    </KeyboardCalendar.Root>
  );
}

function createHistory(options?: EventHistoryOptions<FixtureEvent, string, string>) {
  return createEventHistory<FixtureEvent, string, string>(options);
}

const trip = () => allDay("trip", "2026-10-07", "2026-10-09", "Trip");

function startOf(harness: ReactRootHarness, id: string) {
  return harness.container.querySelector(`[data-event="${id}"]`)?.getAttribute("data-start");
}

/** The announcer's text, with the thin spaces `formatRange` puts around its dash made plain. */
function spoken(harness: ReactRootHarness) {
  return harness.container
    .querySelector('[data-calendar-part="announcer"]')!
    .textContent!.replace(/\u00a0$/, "")
    .replace(/[\u2009\u202f]/g, " ");
}

async function press(key: string) {
  await act(async () => {
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
    );
    await Promise.resolve();
  });
}

async function run<T>(command: () => Promise<T>): Promise<T> {
  let outcome!: T;
  await act(async () => {
    outcome = await command();
  });
  return outcome;
}

describe("useCalendarHistory", () => {
  test("undoes and redoes a keyboard drag through the pipeline, and says so", async () => {
    const history = createHistory();
    const details: CalendarProposalDetail[] = [];
    const harness = await render(
      <HistoryFixture
        history={history}
        initialEvents={[trip()]}
        onResult={(detail) => details.push(detail)}
      />,
    );
    await act(async () =>
      harness.container.querySelector<HTMLElement>('[data-event="trip"]')!.focus(),
    );
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await vi.waitFor(() => expect(controls!.canUndo).toBe(true));
    expect(startOf(harness, "trip")).toBe("2026-10-08");
    expect(controls!.past[0]).toMatchObject({ cause: "move", eventId: "trip", input: "keyboard" });

    const undone = await run(() => controls!.undo({ input: "keyboard" }));
    expect(undone.status).toBe("committed");
    expect(startOf(harness, "trip")).toBe("2026-10-07");
    expect(spoken(harness)).toBe("undo committed Trip Oct 7 – 8");
    expect(harness.container.querySelector("[data-history]")!.textContent).toBe(
      "0 back, 1 forward",
    );

    await run(() => controls!.redo());
    expect(startOf(harness, "trip")).toBe("2026-10-08");
    expect(spoken(harness)).toBe("redo committed Trip Oct 8 – 9");
    // `onEventChangeResult` hears the inverses with their marker; the history doesn't record them.
    expect(details).toEqual([
      { input: "keyboard" },
      { history: "undo", input: "keyboard" },
      { history: "redo", input: "api" },
    ]);
    expect(controls!.past).toHaveLength(1);
  });

  test("undoes a delete by restoring the record, and names it once it shows", async () => {
    const history = createHistory();
    const harness = await render(<HistoryFixture history={history} initialEvents={[trip()]} />);
    await run(() => actions!.proposeEventChange({ cause: "delete", eventId: "trip" }));
    expect(startOf(harness, "trip")).toBeUndefined();

    await run(() => controls!.undo());
    expect(startOf(harness, "trip")).toBe("2026-10-07");
    expect(spoken(harness)).toBe("undo committed Trip Oct 7 – 8");
    await run(() => controls!.redo());
    expect(startOf(harness, "trip")).toBeUndefined();
    expect(spoken(harness)).toBe("redo committed Trip gone");
  });

  test("a rejected inverse keeps the step and says why", async () => {
    let closed = false;
    const history = createHistory();
    const harness = await render(
      <HistoryFixture
        history={history}
        initialEvents={[trip()]}
        policies={[() => (closed ? { reason: "closed", type: "reject" } : { type: "accept" })]}
      />,
    );
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    closed = true;
    const outcome = await run(() => controls!.undo());
    expect(outcome).toMatchObject({ result: { reason: "closed" }, status: "rejected" });
    expect(startOf(harness, "trip")).toBe("2026-10-14");
    expect(controls!.past).toHaveLength(1);
    expect(spoken(harness)).toBe("undo rejected Trip Oct 7 – 8");
  });

  test("drops a step whose event changed elsewhere", async () => {
    const history = createHistory();
    const harness = await render(<HistoryFixture history={history} initialEvents={[trip()]} />);
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    // Another user moves the trip.
    await act(async () =>
      setEvents!(
        (current) =>
          current.map((event) => ({
            ...event,
            end: Temporal.PlainDate.from("2026-10-23"),
            start: Temporal.PlainDate.from("2026-10-21"),
          })) as readonly FixtureEvent[],
      ),
    );
    const outcome = await run(() => controls!.undo());
    expect(outcome.status).toBe("stale");
    expect(startOf(harness, "trip")).toBe("2026-10-21");
    expect(controls!.canUndo).toBe(false);
    expect(spoken(harness)).toBe("undo stale Trip Oct 7 – 8");
    expect((await run(() => controls!.undo())).status).toBe("empty");
    expect(spoken(harness)).toBe("undo empty");
  });

  test("says nothing without messages", async () => {
    const history = createHistory();
    const harness = await render(
      <HistoryFixture history={history} initialEvents={[trip()]} silent />,
    );
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    const before = spoken(harness);
    await run(() => controls!.undo());
    expect(spoken(harness)).toBe(before);
  });

  test("an undo pressed while a drop still saves waits, and takes that drop back", async () => {
    const history = createHistory();
    const harness = await render(<HistoryFixture history={history} initialEvents={[trip()]} />);
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    const save = Promise.withResolvers<void>();
    heldSaves = save.promise;
    let dropped!: Promise<unknown>;
    let undone!: Promise<{ readonly status: string }>;
    await act(async () => {
      dropped = proposeMove("trip", "2026-10-21", "2026-10-23");
      undone = controls!.undo();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(controls!.pending).toBeNull();
    await act(async () => {
      save.resolve();
      await dropped;
      expect((await undone).status).toBe("committed");
    });
    expect(startOf(harness, "trip")).toBe("2026-10-14");
    expect(controls!.past).toHaveLength(1);
  });

  test("reports messages that throw, and still resolves", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const history = createHistory();
    function Throwing() {
      controls = useCalendarHistory(history, {
        messages: {
          redo: () => null,
          undo: () => {
            throw new Error("message failed");
          },
        },
      });
      return null;
    }
    const harness = await render(
      <HistoryFixture history={history} initialEvents={[trip()]} silent />,
    );
    await harness.render(
      <HistoryFixture history={history} initialEvents={[trip()]} silent>
        <Throwing />
      </HistoryFixture>,
    );
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    expect((await run(() => controls!.undo())).status).toBe("committed");
    expect(reported).toHaveBeenCalledWith(new Error("message failed"));
  });

  test("is typed by its history, throws outside a root, and reads an empty history on the server", async () => {
    const history = createHistory();
    function Typed() {
      const bound = useCalendarHistory(history);
      expectTypeOf(bound.past[0]!.event).toEqualTypeOf<FixtureEvent | null>();
      expectTypeOf(bound.undo).returns.resolves.toHaveProperty("status");
      return null;
    }
    expect(() => renderToString(<Typed />)).toThrow("calendar-hook-outside-root");

    // A step recorded before the page renders: the server and hydration still read none.
    history.record(
      {
        change: {
          cause: "move",
          event: trip(),
          eventId: "trip",
          id: "change-1",
          original: { ...trip(), resourceIds: [] },
          proposed: { ...trip(), resourceIds: [] },
        },
        status: "committed",
      },
      { input: "pointer" },
    );
    expect(renderToString(<HistoryFixture history={history} initialEvents={[trip()]} />)).toContain(
      "0 back, 0 forward",
    );
    const hydrated = await hydrateWithHarness(
      <HistoryFixture history={history} initialEvents={[trip()]} />,
    );
    harnesses.push(hydrated);
    expect(hydrated.recoverableErrors).toEqual([]);
    // Then the client reads the history itself.
    expect(hydrated.container.querySelector("[data-history]")!.textContent).toBe(
      "1 back, 0 forward",
    );
  });
});

describe("Root", () => {
  test("hands onEventChangeResult the detail a proposal was made with", async () => {
    const results: CalendarProposalDetail[] = [];
    const history = createHistory();
    await render(
      <HistoryFixture
        history={history}
        initialEvents={[trip()]}
        onResult={(detail) => results.push(detail)}
      />,
    );
    const own = Object.freeze({ input: "pointer" as const });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16", own));
    // A caller that passes on an index, as `Array.prototype.map` does, names no input.
    await run(() => proposeMove("trip", "2026-10-21", "2026-10-23", 3 as never));
    expect(results[0]).toBe(own);
    expect(results[1]).toEqual({ input: "api" });
  });
});

function proposeMove(id: string, start: string, end: string, detail?: CalendarProposalDetail) {
  return actions!.proposeEventChange(
    {
      cause: "move",
      eventId: id,
      proposed: {
        end: Temporal.PlainDate.from(end),
        kind: "all-day",
        start: Temporal.PlainDate.from(start),
      },
    },
    detail,
  );
}
