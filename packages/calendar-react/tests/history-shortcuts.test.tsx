// @vitest-environment jsdom

import { createEventHistory, type CalendarEventChange } from "@moltenship/calendar-core";
import { act, useState, type ReactNode } from "react";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

import {
  useCalendarDraftReporter,
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarHistoryShortcutsOptions,
} from "@moltenship/calendar-react";

import { allDay, KeyboardCalendar, type FixtureEvent } from "./harness/keyboard-fixture";
import { renderWithHarness, type ReactRootHarness } from "./harness/render-harness";
import "./setup";

type Change = CalendarEventChange<FixtureEvent, string, string>;
type ShortcutOptions = Omit<CalendarHistoryShortcutsOptions, "scope">;

const harnesses: ReactRootHarness[] = [];

afterEach(async () => {
  await Promise.all(harnesses.splice(0).map((harness) => harness.dispose()));
  vi.restoreAllMocks();
});

let actions: ReturnType<typeof KeyboardCalendar.useCalendarActions> | undefined;

function Shortcuts({
  history,
  options,
}: {
  readonly history: ReturnType<typeof createEventHistory<FixtureEvent, string, string>>;
  readonly options?: ShortcutOptions;
}) {
  const bound = useCalendarHistory(history);
  const { refs } = KeyboardCalendar.useCalendarMeta();
  useCalendarHistoryShortcuts(bound, { ...options, scope: refs.frame });
  actions = KeyboardCalendar.useCalendarActions();
  return null;
}

/** A calendar frame holding the month view, a text field, a dialog, and the given children. */
function Fixture({
  children,
  history,
  inside,
  options,
}: {
  readonly children?: ReactNode;
  /** Rendered inside the frame, after the view. */
  readonly inside?: ReactNode;
  readonly history: ReturnType<typeof createEventHistory<FixtureEvent, string, string>>;
  readonly options?: ShortcutOptions;
}) {
  const [events, setEvents] = useState<readonly FixtureEvent[]>([
    allDay("trip", "2026-10-07", "2026-10-09", "Trip"),
  ]);
  const save = (change: Change) =>
    setEvents((current) =>
      current.map((event) =>
        event.id === change.eventId && change.proposed !== null
          ? ({ ...event, ...change.proposed } as FixtureEvent)
          : event,
      ),
    );
  return (
    <KeyboardCalendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      events={events}
      locale="en-US"
      onEventChange={save}
      onEventChangeResult={history.record}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <KeyboardCalendar.Frame>
        <KeyboardCalendar.ActiveView />
        <input aria-label="Title" data-field="" />
        <div contentEditable data-editable="" suppressContentEditableWarning>
          Notes
        </div>
        <div role="dialog" aria-label="Details">
          <button data-in-dialog="" type="button">
            Close
          </button>
        </div>
        <button
          data-react-handler=""
          // A React handler inside the frame that takes the key for itself.
          onKeyDown={(event) => event.preventDefault()}
          type="button"
        >
          Own keys
        </button>
        {inside}
      </KeyboardCalendar.Frame>
      <button data-outside="" type="button">
        Outside
      </button>
      <Shortcuts history={history} options={options} />
      {children}
    </KeyboardCalendar.Root>
  );
}

async function render(element: ReactNode) {
  const harness = await renderWithHarness(element);
  harnesses.push(harness);
  return harness;
}

function startOf(harness: ReactRootHarness) {
  return harness.container.querySelector('[data-event="trip"]')?.getAttribute("data-start");
}

/** Presses a key on `target`, and returns whether the calendar took it. */
async function press(target: Element, init: KeyboardEventInit) {
  let event!: KeyboardEvent;
  await act(async () => {
    event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    await new Promise((resolve) => setTimeout(resolve));
  });
  return event.defaultPrevented;
}

async function moveTrip() {
  await act(async () => {
    await actions!.proposeEventChange({
      cause: "move",
      eventId: "trip",
      proposed: {
        end: Temporal.PlainDate.from("2026-10-16"),
        kind: "all-day",
        start: Temporal.PlainDate.from("2026-10-14"),
      },
    });
  });
}

function stubPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
}

describe("useCalendarHistoryShortcuts", () => {
  test("Ctrl+Z undoes and Ctrl+Y or Shift+Ctrl+Z redoes in the calendar, off Apple platforms", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    const trip = () => harness.container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(startOf(harness)).toBe("2026-10-14");

    // ⌘Z isn't undo here.
    expect(await press(trip(), { key: "z", metaKey: true })).toBe(false);
    expect(await press(trip(), { code: "KeyZ", ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-07");
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-14");
    await press(trip(), { ctrlKey: true, key: "z" });
    expect(await press(trip(), { ctrlKey: true, key: "Z", shiftKey: true })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("Mod is ⌘ on Apple platforms, and keys match by position on other layouts", async () => {
    stubPlatform("MacIntel");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    const trip = () => harness.container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(await press(trip(), { ctrlKey: true, key: "z" })).toBe(false);
    // A Russian layout types "я" on the Z key.
    expect(await press(trip(), { code: "KeyZ", key: "я", metaKey: true })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-07");
    expect(await press(trip(), { code: "KeyZ", key: "z", metaKey: true, shiftKey: true })).toBe(
      true,
    );
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("leaves text fields, dialogs, the rest of the page and handled keys alone", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    await moveTrip();
    const undo = { ctrlKey: true, key: "z" };
    const query = (selector: string) => harness.container.querySelector(selector)!;
    expect(await press(query("[data-field]"), undo)).toBe(false);
    expect(await press(query("[data-editable]"), undo)).toBe(false);
    expect(await press(query("[data-in-dialog]"), undo)).toBe(false);
    expect(await press(query("[data-outside]"), undo)).toBe(false);
    expect(await press(document.body, undo)).toBe(false);
    // Something inside handled the key first.
    const trip = query('[data-event="trip"]');
    trip.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    await press(trip, undo);
    expect(startOf(harness)).toBe("2026-10-14");
    // IME composition.
    expect(await press(trip, { ...undo, isComposing: true })).toBe(false);
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("on QWERTZ, the Y key where QWERTY has Z redoes, as its letter says", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    const trip = () => harness.container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    await press(trip(), { code: "KeyY", ctrlKey: true, key: "z" });
    expect(startOf(harness)).toBe("2026-10-07");
    // QWERTZ's Y sits where QWERTY's Z does: it redoes, it doesn't undo.
    expect(await press(trip(), { code: "KeyZ", ctrlKey: true, key: "y" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("leaves a field inside a web component in the frame alone", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    await moveTrip();
    const host = document.createElement("div");
    harness.container.querySelector('[data-calendar-part="frame"]')!.append(host);
    const field = document.createElement("input");
    host.attachShadow({ mode: "open" }).append(field);
    expect(await press(field, { composed: true, ctrlKey: true, key: "z" })).toBe(false);
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("leaves keys a React handler in the frame took", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    await moveTrip();
    const own = harness.container.querySelector("[data-react-handler]")!;
    await press(own, { ctrlKey: true, key: "z" });
    expect(startOf(harness)).toBe("2026-10-14");
  });

  test("works mounted inside the frame, also after the calendar remounts", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    function Inside() {
      const bound = useCalendarHistory(history);
      const { refs } = KeyboardCalendar.useCalendarMeta();
      useCalendarHistoryShortcuts(bound, { scope: refs.frame });
      return null;
    }
    const harness = await render(
      <Fixture key="first" history={history} inside={<Inside />} options={{ disabled: true }} />,
    );
    await moveTrip();
    // A new calendar with the same history: the hook mounts in the same commit as its frame.
    await harness.render(
      <Fixture key="second" history={history} inside={<Inside />} options={{ disabled: true }} />,
    );
    const trip = harness.container.querySelector('[data-event="trip"]')!;
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(true);
  });

  test("works in a calendar inside a dialog, but not in a dialog inside the calendar", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(
      <div aria-label="Calendar" role="dialog">
        <Fixture history={history} />
      </div>,
    );
    await moveTrip();
    const query = (selector: string) => harness.container.querySelector(selector)!;
    expect(await press(query("[data-in-dialog]"), { ctrlKey: true, key: "z" })).toBe(false);
    expect(await press(query('[data-event="trip"]'), { ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-07");
  });

  test("waits out a pointer drag", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    let report!: ReturnType<typeof useCalendarDraftReporter>;
    function Dragging() {
      report = useCalendarDraftReporter();
      return null;
    }
    const harness = await render(
      <Fixture history={history}>
        <Dragging />
      </Fixture>,
    );
    await moveTrip();
    const trip = harness.container.querySelector('[data-event="trip"]')!;
    const draft = {
      eventId: "trip",
      proposed: {
        end: Temporal.PlainDate.from("2026-10-23"),
        kind: "all-day" as const,
        resourceIds: [],
        start: Temporal.PlainDate.from("2026-10-21"),
      },
    };
    await act(async () => report(draft));
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(false);
    await act(async () => report(null));
    expect(await press(trip, { ctrlKey: true, key: "z" })).toBe(true);
  });

  test("waits out a keyboard grab", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const harness = await render(<Fixture history={history} />);
    await moveTrip();
    const trip = harness.container.querySelector<HTMLElement>('[data-event="trip"]')!;
    await act(async () => trip.focus());
    await press(trip, { key: " " });
    expect(await press(document.activeElement!, { ctrlKey: true, key: "z" })).toBe(false);
    await press(document.activeElement!, { key: "Escape" });
    expect(await press(document.activeElement!, { ctrlKey: true, key: "z" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-07");
  });

  test("takes other keys, turns one action off with [], and listens for nothing when disabled", async () => {
    stubPlatform("Win32");
    const history = createEventHistory<FixtureEvent, string, string>();
    const listen = vi.spyOn(document, "addEventListener");
    const harness = await render(
      <Fixture history={history} options={{ redo: [], undo: ["Alt+Backspace"] }} />,
    );
    const trip = () => harness.container.querySelector('[data-event="trip"]')!;
    await moveTrip();
    expect(await press(trip(), { ctrlKey: true, key: "z" })).toBe(false);
    expect(await press(trip(), { altKey: true, key: "Backspace" })).toBe(true);
    expect(startOf(harness)).toBe("2026-10-07");
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(false);

    const keydownListeners = () => listen.mock.calls.filter(([type]) => type === "keydown").length;
    const before = keydownListeners();
    expect(before).toBeGreaterThan(0);
    await harness.render(<Fixture history={history} options={{ disabled: true }} />);
    expect(await press(trip(), { ctrlKey: true, key: "y" })).toBe(false);
    expect(keydownListeners()).toBe(before);
    listen.mockRestore();
  });
});
