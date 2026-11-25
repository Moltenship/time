// @vitest-environment jsdom

import { createEventHistory } from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import { useCalendarDraftReporter, useCalendarHistory, useCalendarHistoryShortcuts } from "../src";
import { element } from "../src/props";
import { KeyboardCalendar, type FixtureEvent } from "./fixtures/interaction";
import { HistoryFixture, proposeMove, type HistoryFixtureProps } from "./fixtures/history";
import { mount, settled } from "./harness/render";
import "./setup";

afterEach(() => {
  vi.restoreAllMocks();
});

const Div = element("div");

function createHistory() {
  return createEventHistory<FixtureEvent, string, string>();
}

async function render(props: HistoryFixtureProps) {
  const view = mount(() => createComponent(HistoryFixture, props));
  await settled();
  return view;
}

function startOf(container: HTMLElement) {
  return container.querySelector('[data-event="trip"]')?.getAttribute("data-start");
}

/** Presses a key on `target`, and returns whether the calendar took it. */
async function press(target: Element, init: KeyboardEventInit) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  await new Promise((resolve) => setTimeout(resolve));
  await settled();
  return event.defaultPrevented;
}

async function moveTrip() {
  await proposeMove("trip", "2026-10-14", "2026-10-16");
  await settled();
}

function stubPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

describe("useCalendarHistoryShortcuts", () => {
  test("Ctrl+Z undoes and Ctrl+Y or Shift+Ctrl+Z redoes in the calendar, off Apple platforms", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    const trip = () => container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(startOf(container)).toBe("2026-10-14");

    // ⌘Z isn't undo here.
    expect(await press(trip(), { key: "z", metaKey: true })).toBe(false);
    expect(await press(trip(), { code: "KeyZ", ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(container)).toBe("2026-10-07");
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(true);
    expect(startOf(container)).toBe("2026-10-14");
    await press(trip(), { ctrlKey: true, key: "z" });
    expect(await press(trip(), { ctrlKey: true, key: "Z", shiftKey: true })).toBe(true);
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("Mod is ⌘ on Apple platforms, and keys match by position on other layouts", async () => {
    stubPlatform("MacIntel");
    const { container } = await render({ history: createHistory() });
    const trip = () => container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(await press(trip(), { ctrlKey: true, key: "z" })).toBe(false);
    // A Russian layout types "я" on the Z key.
    expect(await press(trip(), { code: "KeyZ", key: "я", metaKey: true })).toBe(true);
    expect(startOf(container)).toBe("2026-10-07");
    expect(await press(trip(), { code: "KeyZ", key: "z", metaKey: true, shiftKey: true })).toBe(
      true,
    );
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("leaves text fields, dialogs, the rest of the page and handled keys alone", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    await moveTrip();
    const undo = { ctrlKey: true, key: "z" };
    const query = (selector: string) => container.querySelector(selector)!;
    expect(await press(query("[data-field]"), undo)).toBe(false);
    expect(await press(query("[data-editable]"), undo)).toBe(false);
    expect(await press(query("[data-in-dialog]"), undo)).toBe(false);
    expect(await press(query("[data-outside]"), undo)).toBe(false);
    expect(await press(document.body, undo)).toBe(false);
    // Something inside handled the key first.
    const trip = query('[data-event="trip"]');
    trip.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    await press(trip, undo);
    expect(startOf(container)).toBe("2026-10-14");
    // IME composition.
    expect(await press(trip, { ...undo, isComposing: true })).toBe(false);
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("on QWERTZ, the Y key where QWERTY has Z redoes, as its letter says", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    const trip = () => container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    await press(trip(), { code: "KeyY", ctrlKey: true, key: "z" });
    expect(startOf(container)).toBe("2026-10-07");
    // QWERTZ's Y sits where QWERTY's Z does: it redoes, it doesn't undo.
    expect(await press(trip(), { code: "KeyZ", ctrlKey: true, key: "y" })).toBe(true);
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("leaves a field inside a web component in the frame alone", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    await moveTrip();
    const host = document.createElement("div");
    container.querySelector('[data-calendar-part="frame"]')!.append(host);
    const field = document.createElement("input");
    host.attachShadow({ mode: "open" }).append(field);
    expect(await press(field, { composed: true, ctrlKey: true, key: "z" })).toBe(false);
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("leaves keys a Solid handler in the frame took", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    await moveTrip();
    const own = container.querySelector("[data-solid-handler]")!;
    await press(own, { ctrlKey: true, key: "z" });
    expect(startOf(container)).toBe("2026-10-14");
  });

  test("works mounted inside the frame, also after the calendar remounts", async () => {
    stubPlatform("Win32");
    const history = createHistory();
    function Inside(): JSX.Element {
      const controls = useCalendarHistory(history);
      const meta = KeyboardCalendar.useCalendarMeta();
      useCalendarHistoryShortcuts(controls, () => ({ scope: meta().refs.frame }));
      return null;
    }
    const [generation, setGeneration] = createSignal(0);
    const view = mount(() =>
      createComponent(Div, {
        get children() {
          // A new calendar with the same history each generation.
          return [generation()].map(() =>
            createComponent(HistoryFixture, {
              history,
              get inside() {
                return createComponent(Inside, {});
              },
              shortcuts: { disabled: true },
            }),
          );
        },
      }),
    );
    await settled();
    await moveTrip();
    setGeneration(1);
    await settled();
    const trip = view.container.querySelector('[data-event="trip"]')!;
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(true);
  });

  test("works in a calendar inside a dialog, but not in a dialog inside the calendar", async () => {
    stubPlatform("Win32");
    const history = createHistory();
    const view = mount(() =>
      createComponent(Div, {
        "aria-label": "Calendar",
        role: "dialog",
        get children() {
          return createComponent(HistoryFixture, { history });
        },
      }),
    );
    await settled();
    await moveTrip();
    const query = (selector: string) => view.container.querySelector(selector)!;
    expect(await press(query("[data-in-dialog]"), { ctrlKey: true, key: "z" })).toBe(false);
    expect(await press(query('[data-event="trip"]'), { ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(view.container)).toBe("2026-10-07");
  });

  test("waits out a pointer drag", async () => {
    stubPlatform("Win32");
    let report!: ReturnType<typeof useCalendarDraftReporter>;
    function Dragging(): JSX.Element {
      report = useCalendarDraftReporter();
      return null;
    }
    const { container } = await render({
      history: createHistory(),
      get children() {
        return createComponent(Dragging, {});
      },
    });
    await moveTrip();
    const trip = container.querySelector('[data-event="trip"]')!;
    report({
      eventId: "trip",
      proposed: {
        end: Temporal.PlainDate.from("2026-10-23"),
        kind: "all-day",
        resourceIds: [],
        start: Temporal.PlainDate.from("2026-10-21"),
      },
    });
    await settled();
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(false);
    report(null);
    await settled();
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(true);
  });

  test("waits out a keyboard grab", async () => {
    stubPlatform("Win32");
    const { container } = await render({ history: createHistory() });
    await moveTrip();
    const trip = container.querySelector<HTMLElement>('[data-event="trip"]')!;
    trip.focus();
    await settled();
    await press(trip, { key: " " });
    expect(await press(document.activeElement!, { ctrlKey: true, key: "z" })).toBe(false);
    await press(document.activeElement!, { key: "Escape" });
    expect(await press(document.activeElement!, { ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(container)).toBe("2026-10-07");
  });

  test("takes other keys, turns one action off with [], and listens for nothing when disabled", async () => {
    stubPlatform("Win32");
    const listen = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const [shortcuts, setShortcuts] = createSignal<HistoryFixtureProps["shortcuts"]>({
      redo: [],
      undo: ["Alt+Backspace"],
    });
    const { container } = await render({
      history: createHistory(),
      get shortcuts() {
        return shortcuts();
      },
    });
    const trip = () => container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(await press(trip(), { ctrlKey: true, key: "z" })).toBe(false);
    expect(await press(trip(), { altKey: true, key: "Backspace" })).toBe(true);
    expect(startOf(container)).toBe("2026-10-07");
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(false);

    const keydowns = (spy: typeof listen) =>
      spy.mock.calls.filter(([type]) => type === "keydown").map(([, listener]) => listener);
    const before = keydowns(listen).length;
    expect(before).toBeGreaterThan(0);
    setShortcuts({ disabled: true });
    await settled();
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(false);
    expect(keydowns(listen)).toHaveLength(before);
    // Turning it off let its listener go.
    expect(keydowns(removed).length).toBeGreaterThan(0);
  });

  test("lets go of its listener with its owner", async () => {
    stubPlatform("Win32");
    const listen = vi.spyOn(document, "addEventListener");
    const removed = vi.spyOn(document, "removeEventListener");
    const view = await render({ history: createHistory() });
    const added = listen.mock.calls.filter(([type]) => type === "keydown").map(([, l]) => l);
    view.dispose();
    const gone = removed.mock.calls.filter(([type]) => type === "keydown").map(([, l]) => l);
    expect(added.length).toBeGreaterThan(0);
    for (const listener of added) expect(gone).toContain(listener);
  });
});
