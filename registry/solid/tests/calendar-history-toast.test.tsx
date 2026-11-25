// @vitest-environment jsdom

import {
  createEventHistory,
  type CalendarEventChange,
  type EventHistory,
} from "@moltenship/calendar-solid";
import { createAgent } from "@ui-sdk/solid/agent";
import { createSignal } from "solid-js";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "@registry/shared/calendar/announcements";

import {
  CalendarHistoryToast,
  calendarHistoryToastMessages,
  type CalendarHistoryToastProps,
} from "../calendar-history-toast/calendar-history-toast";
import { createAgendaView } from "../list-view/agenda-view";
import { render, settled } from "./render";
import { anchorDate, clock, createTestCalendar, timed, type ColoredEvent } from "./view-fixtures";

// The React toast's tests (registry/tests/calendar-history-toast.test.tsx), in Solid, over the
// agenda: the two toasts say the same, offer the same actions and add the same keys.

// One bridge for the file: it hears components as they are made, so it exists before any renders.
const agent = createAgent();

type Change = CalendarEventChange<ColoredEvent, string | number, string>;
type History = EventHistory<ColoredEvent, string | number, string>;
type ToastProps = Partial<CalendarHistoryToastProps<ColoredEvent, string | number, string>>;

const standup = {
  ...timed("standup", "2026-10-08T09:00:00Z", "2026-10-08T10:00:00Z"),
  title: "Standup",
};

const Calendar = createTestCalendar(createAgendaView<ColoredEvent>());

let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;
let saved: readonly ColoredEvent[] = [];
let setEvents: ((events: readonly ColoredEvent[]) => void) | undefined;
let setToastProps: ((props: ToastProps) => void) | undefined;
/** Makes the application's saves throw. */
let failing = false;

function Actions() {
  actions = Calendar.useCalendarActions();
  return null;
}

function Application(props: { readonly history: History; readonly toast?: ToastProps }) {
  const [events, setState] = createSignal<readonly ColoredEvent[]>([standup], {
    ownedWrite: true,
  });
  const [toastProps, setToast] = createSignal<ToastProps>(props.toast ?? {}, { ownedWrite: true });
  const write = (next: readonly ColoredEvent[]) => {
    saved = next;
    setState(next);
  };
  saved = [standup];
  setEvents = write;
  setToastProps = (next) => setToast(next);
  const save = (change: Change) => {
    if (failing) throw new Error("save failed");
    if (change.cause === "delete") write(saved.filter(({ id }) => id !== change.eventId));
    else if (change.cause === "create") write([...saved, { ...change.event!, ...change.proposed }]);
    else
      write(
        saved.map((event) =>
          event.id === change.eventId ? ({ ...event, ...change.proposed } as ColoredEvent) : event,
        ),
      );
  };
  return (
    <Calendar.Root
      clock={clock}
      defaultAnchorDate={anchorDate}
      defaultTimeZone="UTC"
      defaultView="agenda"
      events={events()}
      locale="en-US"
      onEventChange={save}
      onEventChangeResult={(result, detail) => props.history.record(result, detail)}
      weekRules={{ firstDay: 1, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame>
        <Calendar.ActiveView />
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
      <CalendarHistoryToast
        calendar={Calendar}
        history={props.history}
        announcements={toastProps().announcements}
        messages={toastProps().messages}
        shortcuts={toastProps().shortcuts}
        timeout={toastProps().timeout}
      />
      <Actions />
    </Calendar.Root>
  );
}

const renderApplication = (history: History, toast?: ToastProps) =>
  render(() => <Application history={history} toast={toast} />);

afterEach(() => {
  failing = false;
});

/** What the application has saved. */
async function current() {
  await settled();
  return saved;
}

/** The toast on screen, as `title [action]`; `null` without one. */
function toast() {
  const root = document.querySelector('[aria-label="Notifications"]');
  const item = root?.querySelector("li");
  const title = item?.querySelector("[id]")?.textContent;
  if (root === null || title === undefined) return null;
  const action = [...root.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") !== "Dismiss",
  );
  return action === undefined ? title : `${title} [${action.textContent}]`;
}

/** What the toasts' live region last read out. */
const toastSpoken = () =>
  [...document.querySelectorAll('[role="status"]:not([data-calendar-part])')]
    .map((region) => region.textContent?.trim() ?? "")
    .filter(Boolean)
    .at(-1) ?? "";

const spoken = (container: HTMLElement) =>
  container
    .querySelector('[data-calendar-part="announcer"]')!
    .textContent!.replace(/\s/g, " ")
    .trim();

async function propose(proposal: Parameters<NonNullable<typeof actions>["proposeEventChange"]>[0]) {
  await actions!.proposeEventChange(proposal);
  await settled();
}

const moveStandup = () =>
  propose({
    cause: "move",
    eventId: "standup",
    proposed: {
      end: Temporal.Instant.from("2026-10-09T12:00:00Z"),
      kind: "timed",
      start: Temporal.Instant.from("2026-10-09T11:00:00Z"),
    },
  });

const actionButton = () =>
  [...document.querySelectorAll<HTMLElement>('[aria-label="Notifications"] button')].find(
    (button) => button.getAttribute("aria-label") !== "Dismiss",
  );

async function press(button: HTMLElement | undefined, detail = 1) {
  button!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
  await new Promise((resolve) => setTimeout(resolve));
  await settled();
}

test("offers to undo each change, then to redo it, and speaks through the Announcer", async () => {
  const history = createEventHistory<ColoredEvent, string | number, string>();
  const view = await renderApplication(history);
  expect(toast()).toBeNull();

  await moveStandup();
  expect(toast()).toBe("Moved “Standup” [Undo]");
  // Each toast is read out by its title; the Announcer says what an undo or redo did.
  await vi.waitFor(() =>
    expect(toastSpoken()).toBe("Moved “Standup”. To undo it, press F6 and choose Undo."),
  );

  await press(actionButton());
  expect((await current())[0]!.start.toString()).toBe("2026-10-08T09:00:00Z");
  expect(toast()).toBe("Undid the move [Redo]");
  expect(spoken(view.container)).toBe(
    "Undid the move: Standup is back at Thursday, October 8, 9:00 – 10:00 AM.",
  );

  await press(actionButton());
  expect((await current())[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");
  expect(toast()).toBe("Redid the move [Undo]");

  await propose({ cause: "delete", eventId: "standup" });
  expect(toast()).toBe("Event deleted [Undo]");
  await press(actionButton());
  expect((await current()).map(({ id }) => id)).toEqual(["standup"]);
});

test("adds the keys in the calendar's frame, unless turned off", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  const history = createEventHistory<ColoredEvent, string | number, string>();
  const view = await renderApplication(history);
  await moveStandup();
  const frame = view.container.querySelector('[data-calendar-part="frame"]')!;
  const key = async (init: KeyboardEventInit) => {
    frame.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }));
    await new Promise((resolve) => setTimeout(resolve));
    await settled();
  };

  await key({ ctrlKey: true, key: "z" });
  expect((await current())[0]!.start.toString()).toBe("2026-10-08T09:00:00Z");
  await key({ ctrlKey: true, key: "y" });
  expect((await current())[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");

  setToastProps!({ shortcuts: false });
  await settled();
  await key({ ctrlKey: true, key: "z" });
  expect((await current())[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");
});

test("says what its messages say, and shows nothing for what they leave out", async () => {
  const history = createEventHistory<ColoredEvent, string | number, string>();
  const view = await renderApplication(history, {
    announcements: null,
    messages: {
      ...calendarHistoryToastMessages,
      outcome: () => null,
      recorded: (step, name) => `${step.cause}: ${name ?? "?"}`,
      undo: "Annuler",
    },
  });
  const before = spoken(view.container);
  await moveStandup();
  expect(toast()).toBe("move: Standup [Annuler]");
  await press(actionButton());
  await vi.waitFor(() => expect(toast()).toBeNull());
  expect(spoken(view.container)).toBe(before);
});

test("a stale or failed undo shows no action, and a clear closes the toast", async () => {
  const history = createEventHistory<ColoredEvent, string | number, string>();
  await renderApplication(history);
  await moveStandup();
  expect(toast()).toBe("Moved “Standup” [Undo]");
  // Moved elsewhere, outside the calendar's pipeline.
  setEvents!([
    { ...standup, end: standup.end.add({ hours: 5 }), start: standup.start.add({ hours: 5 }) },
  ]);
  await settled();
  await press(actionButton());
  expect(toast()).toBe("Can't undo: “Standup” changed since");

  await moveStandup();
  failing = true;
  await press(actionButton());
  expect(toast()).toBe("Couldn't undo the move");
  failing = false;

  history.clear();
  await settled();
  await vi.waitFor(() => expect(toast()).toBeNull());
});

test("Undo from the keyboard or an agent says so, and a change no gesture announced is spoken", async () => {
  const history = createEventHistory<ColoredEvent, string | number, string>();
  const inputs: string[] = [];
  const record = history.record;
  await renderApplication({
    ...history,
    record: (result, detail) => (
      inputs.push(detail.input + (detail.history ?? "")),
      record(result, detail)
    ),
  });
  await moveStandup();
  await vi.waitFor(() =>
    expect(toastSpoken()).toBe("Moved “Standup”. To undo it, press F6 and choose Undo."),
  );
  // A screen reader's virtual click has no pointer.
  await press(actionButton(), 0);
  expect(inputs).toEqual(["api", "keyboardundo"]);

  expect(toast()).toBe("Undid the move [Redo]");
  await agent.act({ steps: [{ action: "press", args: ["Redo"], ref: "Undid the move" }] });
  await new Promise((resolve) => setTimeout(resolve));
  await settled();
  expect(inputs).toEqual(["api", "keyboardundo", "agentredo"]);
});

test("a spoken toast stays 10 seconds to be heard out; a timeout of 0 keeps it", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  try {
    const view =
      await renderApplication(createEventHistory<ColoredEvent, string | number, string>());
    await propose({ cause: "delete", eventId: "standup" });
    expect(toast()).toBe("Event deleted [Undo]");
    await vi.advanceTimersByTimeAsync(500);
    expect(toastSpoken()).toBe("Event deleted. To undo it, press F6 and choose Undo.");
    // Past the usual 6 seconds, still there to be heard out.
    await vi.advanceTimersByTimeAsync(7_000);
    expect(toast()).toBe("Event deleted [Undo]");
    await vi.advanceTimersByTimeAsync(5_000);
    await settled();
    expect(toast()).toBeNull();

    view.unmount();
    await renderApplication(createEventHistory<ColoredEvent, string | number, string>(), {
      timeout: 0,
    });
    await propose({ cause: "delete", eventId: "standup" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(toast()).toBe("Event deleted [Undo]");
  } finally {
    vi.useRealTimers();
  }
});
