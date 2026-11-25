// @vitest-environment jsdom

import {
  createEventHistory,
  type CalendarProposalDetail,
  type EventHistoryOptions,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createRoot } from "solid-js";
import { afterEach, describe, expect, expectTypeOf, test, vi } from "vite-plus/test";

import { useCalendarHistory } from "../src";
import type { FixtureEvent } from "./fixtures/interaction";
import { bound, HistoryFixture, proposeMove, type HistoryFixtureProps } from "./fixtures/history";
import { mount, settled } from "./harness/render";
import "./setup";

afterEach(() => {
  bound.heldSaves = null;
  vi.unstubAllGlobals();
});

function createHistory(options?: EventHistoryOptions<FixtureEvent, string, string>) {
  return createEventHistory<FixtureEvent, string, string>(options);
}

async function render(props: HistoryFixtureProps) {
  const view = mount(() => createComponent(HistoryFixture, props));
  await settled();
  return view.container;
}

const controls = () => bound.controls!();

function startOf(container: HTMLElement, id: string) {
  return container.querySelector(`[data-event="${id}"]`)?.getAttribute("data-start");
}

/** The announcer's text, with Intl's thin and narrow spaces made plain. */
function spoken(container: HTMLElement) {
  return container
    .querySelector('[data-calendar-part="announcer"]')!
    .textContent!.replace(/\s/gu, " ")
    .trim();
}

async function press(key: string) {
  document.activeElement!.dispatchEvent(
    new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }),
  );
  await settled();
  await settled();
}

async function run<T>(command: () => Promise<T>): Promise<T> {
  const outcome = await command();
  await settled();
  return outcome;
}

describe("useCalendarHistory", () => {
  test("undoes and redoes a keyboard drag through the pipeline, and says so", async () => {
    const history = createHistory();
    const details: CalendarProposalDetail[] = [];
    const container = await render({ history, onResult: (detail) => details.push(detail) });
    container.querySelector<HTMLElement>('[data-event="trip"]')!.focus();
    await settled();
    await press(" ");
    await press("ArrowRight");
    await press("Enter");
    await vi.waitFor(() => expect(controls().canUndo).toBe(true));
    expect(startOf(container, "trip")).toBe("2026-10-08");
    expect(controls().past[0]).toMatchObject({ cause: "move", eventId: "trip", input: "keyboard" });

    const undone = await run(() => controls().undo({ input: "keyboard" }));
    expect(undone.status).toBe("committed");
    expect(startOf(container, "trip")).toBe("2026-10-07");
    expect(spoken(container)).toBe("undo committed Trip Oct 7 – 8");
    expect(container.querySelector("[data-history]")!.textContent).toBe("0 back, 1 forward");

    await run(() => controls().redo());
    expect(startOf(container, "trip")).toBe("2026-10-08");
    expect(spoken(container)).toBe("redo committed Trip Oct 8 – 9");
    // `onEventChangeResult` hears the inverses with their marker; the history doesn't record them.
    expect(details).toEqual([
      { input: "keyboard" },
      { history: "undo", input: "keyboard" },
      { history: "redo", input: "api" },
    ]);
    expect(controls().past).toHaveLength(1);
  });

  test("undoes a delete by restoring the record, and names it once it shows", async () => {
    const history = createHistory();
    const container = await render({ history });
    await run(() => bound.actions!.proposeEventChange({ cause: "delete", eventId: "trip" }));
    expect(startOf(container, "trip")).toBeUndefined();

    await run(() => controls().undo());
    expect(startOf(container, "trip")).toBe("2026-10-07");
    expect(spoken(container)).toBe("undo committed Trip Oct 7 – 8");
    await run(() => controls().redo());
    expect(startOf(container, "trip")).toBeUndefined();
    expect(spoken(container)).toBe("redo committed Trip gone");
  });

  test("a rejected inverse keeps the step and says why", async () => {
    let closed = false;
    const history = createHistory();
    const container = await render({
      history,
      policies: [() => (closed ? { reason: "closed", type: "reject" } : { type: "accept" })],
    });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    closed = true;
    const outcome = await run(() => controls().undo());
    expect(outcome).toMatchObject({ result: { reason: "closed" }, status: "rejected" });
    expect(startOf(container, "trip")).toBe("2026-10-14");
    expect(controls().past).toHaveLength(1);
    expect(spoken(container)).toBe("undo rejected Trip Oct 7 – 8");
  });

  test("drops a step whose event changed elsewhere", async () => {
    const history = createHistory();
    const container = await render({ history });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    // Another user moves the trip.
    bound.setEvents!(
      (current) =>
        current.map((event) => ({
          ...event,
          end: Temporal.PlainDate.from("2026-10-23"),
          start: Temporal.PlainDate.from("2026-10-21"),
        })) as readonly FixtureEvent[],
    );
    await settled();
    const outcome = await run(() => controls().undo());
    expect(outcome.status).toBe("stale");
    expect(startOf(container, "trip")).toBe("2026-10-21");
    expect(controls().canUndo).toBe(false);
    expect(spoken(container)).toBe("undo stale Trip Oct 7 – 8");
    expect((await run(() => controls().undo())).status).toBe("empty");
    expect(spoken(container)).toBe("undo empty");
  });

  test("says nothing without messages", async () => {
    const history = createHistory();
    const container = await render({ history, silent: true });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    const before = spoken(container);
    await run(() => controls().undo());
    expect(spoken(container)).toBe(before);
  });

  test("an undo pressed while a drop still saves waits, and takes that drop back", async () => {
    const history = createHistory();
    const container = await render({ history });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    const save = Promise.withResolvers<void>();
    bound.heldSaves = save.promise;
    const dropped = proposeMove("trip", "2026-10-21", "2026-10-23");
    const undone = controls().undo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await settled();
    expect(controls().pending).toBeNull();
    save.resolve();
    await dropped;
    expect((await undone).status).toBe("committed");
    await settled();
    expect(startOf(container, "trip")).toBe("2026-10-14");
    expect(controls().past).toHaveLength(1);
  });

  test("reports messages that throw, and still resolves", async () => {
    const reported = vi.fn();
    vi.stubGlobal("reportError", reported);
    const history = createHistory();
    function Throwing(): JSX.Element {
      bound.controls = useCalendarHistory(history, {
        messages: {
          redo: () => null,
          undo: () => {
            throw new Error("message failed");
          },
        },
      });
      return null;
    }
    await render({
      history,
      silent: true,
      get children() {
        return createComponent(Throwing, {});
      },
    });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16"));
    expect((await run(() => controls().undo())).status).toBe("committed");
    expect(reported).toHaveBeenCalledWith(new Error("message failed"));
  });

  test("is typed by its history, and throws outside a root", () => {
    const history = createHistory();
    function Typed(): JSX.Element {
      const accessor = useCalendarHistory(history);
      expectTypeOf(accessor().past[0]!.event).toEqualTypeOf<FixtureEvent | null>();
      expectTypeOf(accessor().undo).returns.resolves.toHaveProperty("status");
      return null;
    }
    expect(() =>
      createRoot((dispose) => {
        try {
          return createComponent(Typed, {});
        } finally {
          dispose();
        }
      }),
    ).toThrow("calendar-hook-outside-root");
  });

  test("lets go of the history with its owner", async () => {
    const history = createHistory();
    let listening = 0;
    const watched: typeof history = {
      ...history,
      subscribe(listener) {
        listening += 1;
        const off = history.subscribe(listener);
        return () => {
          listening -= 1;
          off();
        };
      },
    };
    const view = mount(() => createComponent(HistoryFixture, { history: watched }));
    await settled();
    expect(listening).toBeGreaterThan(0);
    view.dispose();
    await settled();
    expect(listening).toBe(0);
  });
});

describe("Root", () => {
  test("hands onEventChangeResult the detail a proposal was made with", async () => {
    const results: CalendarProposalDetail[] = [];
    const history = createHistory();
    await render({ history, onResult: (detail) => results.push(detail) });
    const own = Object.freeze({ input: "pointer" as const });
    await run(() => proposeMove("trip", "2026-10-14", "2026-10-16", own));
    // A caller that passes on an index, as `Array.prototype.map` does, names no input.
    await run(() => proposeMove("trip", "2026-10-21", "2026-10-23", 3 as never));
    expect(results[0]).toBe(own);
    expect(results[1]).toEqual({ input: "api" });
  });
});
