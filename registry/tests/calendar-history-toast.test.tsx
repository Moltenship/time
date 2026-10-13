// @vitest-environment jsdom

import {
  createCalendar,
  createCanonicalEventAdapter,
  createEventHistory,
  type CalendarEvent,
  type CalendarEventChange,
  type EventHistory,
} from "@moltenship/calendar";
import { act, useState } from "react";
import { afterEach, expect, test, vi } from "vite-plus/test";

import { calendarAnnouncements } from "../calendar/announcements";
import {
  CalendarHistoryToast,
  calendarHistoryToastMessages,
  type CalendarHistoryToastProps,
} from "../calendar-history-toast/calendar-history-toast";
import { createWeekView } from "../time-grid-view/time-grid-view";
import { render } from "./render";

type Meeting = CalendarEvent<null, string, string>;
type Change = CalendarEventChange<Meeting, string, string>;
type History = EventHistory<Meeting, string, string>;

const standup: Meeting = {
  data: null,
  end: Temporal.Instant.from("2026-10-08T10:00:00Z"),
  id: "standup",
  kind: "timed",
  start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
  title: "Standup",
};

const Calendar = createCalendar<Meeting, never>()({
  eventAdapter: createCanonicalEventAdapter<null, string, string>(),
  views: [createWeekView<Meeting>()],
});

let actions: ReturnType<typeof Calendar.useCalendarActions> | undefined;
let saved: readonly Meeting[] = [];
let setEvents: ((events: readonly Meeting[]) => void) | undefined;
/** Makes the application's saves throw. */
let failing = false;

function Actions() {
  actions = Calendar.useCalendarActions();
  return null;
}

function Application({
  history,
  toast,
}: {
  readonly history: History;
  readonly toast?: Partial<CalendarHistoryToastProps<Meeting, string, string>>;
}) {
  const [events, setState] = useState<readonly Meeting[]>([standup]);
  saved = events;
  setEvents = setState;
  const save = (change: Change) => {
    if (failing) throw new Error("save failed");
    setState((current) => {
      if (change.cause === "delete") return current.filter(({ id }) => id !== change.eventId);
      if (change.cause === "create") return [...current, { ...change.event!, ...change.proposed }];
      return current.map((event) =>
        event.id === change.eventId ? ({ ...event, ...change.proposed } as Meeting) : event,
      );
    });
  };
  return (
    <Calendar.Root
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="week"
      events={events}
      locale="en-US"
      now={Temporal.Instant.from("2026-10-08T12:00:00Z")}
      onEventChange={save}
      onEventChangeResult={history.record}
      weekRules={{ firstDay: 1, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame>
        <Calendar.ActiveView />
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
      <CalendarHistoryToast calendar={Calendar} history={history} {...toast} />
      <Actions />
    </Calendar.Root>
  );
}

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  vi.restoreAllMocks();
});

/** The toast on screen, as `title [action]`; `null` without one. */
function toast() {
  const root = document.querySelector('[role="region"][aria-label="Notifications"]');
  const title = root?.querySelector("h2, [id]")?.textContent;
  if (root === null || title === undefined) return null;
  const action = [...root.querySelectorAll("button")].find(
    (button) => button.getAttribute("aria-label") !== "Dismiss",
  );
  return action === undefined ? title : `${title} [${action.textContent}]`;
}

function spoken(container: HTMLElement) {
  return container
    .querySelector('[data-calendar-part="announcer"]')!
    .textContent!.replace(/\s/g, " ")
    .trim();
}

async function propose(proposal: Parameters<NonNullable<typeof actions>["proposeEventChange"]>[0]) {
  await act(async () => {
    await actions!.proposeEventChange(proposal);
  });
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

async function click(button: Element | undefined) {
  await act(async () => {
    (button as HTMLElement).click();
    await new Promise((resolve) => setTimeout(resolve));
  });
}

function actionButton() {
  return [...document.querySelectorAll('[aria-label="Notifications"] button')].find(
    (button) => button.getAttribute("aria-label") !== "Dismiss",
  );
}

test("offers to undo each change, then to redo it, and speaks through the Announcer", async () => {
  const history = createEventHistory<Meeting, string, string>();
  const view = await render(<Application history={history} />);
  cleanup = view.unmount;
  expect(toast()).toBeNull();

  await moveStandup();
  expect(toast()).toBe("Moved “Standup” [Undo]");
  // The toast's region stays quiet; the Announcer speaks for the history.
  expect(document.querySelector('[aria-label="Notifications"]')!.getAttribute("aria-live")).toBe(
    "off",
  );

  await click(actionButton());
  expect(saved[0]!.start.toString()).toBe("2026-10-08T09:00:00Z");
  expect(toast()).toBe("Undid the move [Redo]");
  expect(spoken(view.container)).toBe(
    "Undid the move: Standup is back at Thursday, October 8, 9:00 – 10:00 AM.",
  );

  await click(actionButton());
  expect(saved[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");
  expect(toast()).toBe("Redid the move [Undo]");

  await propose({ cause: "delete", eventId: "standup" });
  expect(toast()).toBe("Event deleted [Undo]");
  await click(actionButton());
  expect(saved.map(({ id }) => id)).toEqual(["standup"]);
});

test("adds the keys in the calendar's frame, unless turned off", async () => {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  const history = createEventHistory<Meeting, string, string>();
  const view = await render(<Application history={history} />);
  cleanup = view.unmount;
  await moveStandup();
  const frame = view.container.querySelector('[data-calendar-part="frame"]')!;
  const press = (init: KeyboardEventInit) =>
    act(async () => {
      frame.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init }),
      );
      await new Promise((resolve) => setTimeout(resolve));
    });

  await press({ ctrlKey: true, key: "z" });
  expect(saved[0]!.start.toString()).toBe("2026-10-08T09:00:00Z");
  await press({ ctrlKey: true, key: "y" });
  expect(saved[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");

  await view.rerender(<Application history={history} toast={{ shortcuts: false }} />);
  await press({ ctrlKey: true, key: "z" });
  expect(saved[0]!.start.toString()).toBe("2026-10-09T11:00:00Z");
});

test("says what its messages say, and shows nothing for what they leave out", async () => {
  const history = createEventHistory<Meeting, string, string>();
  const view = await render(
    <Application
      history={history}
      toast={{
        announcements: null,
        messages: {
          ...calendarHistoryToastMessages,
          outcome: () => null,
          recorded: (step, name) => `${step.cause}: ${name ?? "?"}`,
          undo: "Annuler",
        },
      }}
    />,
  );
  cleanup = view.unmount;
  const before = spoken(view.container);
  await moveStandup();
  expect(toast()).toBe("move: Standup [Annuler]");
  await click(actionButton());
  expect(toast()).toBeNull();
  expect(spoken(view.container)).toBe(before);
});

test("a stale or failed undo shows no action, and a clear closes the toast", async () => {
  const history = createEventHistory<Meeting, string, string>();
  const view = await render(<Application history={history} />);
  cleanup = view.unmount;
  await moveStandup();
  expect(toast()).toBe("Moved “Standup” [Undo]");
  // Moved elsewhere, outside the calendar's pipeline.
  await act(async () =>
    setEvents!([
      { ...standup, start: standup.start.add({ hours: 5 }), end: standup.end.add({ hours: 5 }) },
    ]),
  );
  await click(actionButton());
  expect(toast()).toBe("Can't undo: “Standup” changed since");

  await moveStandup();
  failing = true;
  await click(actionButton());
  expect(toast()).toBe("Couldn't undo the move");
  failing = false;

  await act(async () => history.clear());
  await act(async () => new Promise((resolve) => setTimeout(resolve)));
  expect(toast()).toBeNull();
});

test("Undo from the keyboard says so, and a change no gesture announced is spoken", async () => {
  const history = createEventHistory<Meeting, string, string>();
  const inputs: string[] = [];
  const record = history.record;
  const view = await render(
    <Application
      history={{
        ...history,
        record: (result, detail) => (
          inputs.push(detail.input + (detail.history ?? "")),
          record(result, detail)
        ),
      }}
    />,
  );
  cleanup = view.unmount;
  await moveStandup();
  expect(
    document.querySelector('[role="status"]:not([data-calendar-part])')?.textContent?.trim(),
  ).toBe("Moved “Standup”. To undo it, press F6 and choose Undo.");
  await act(async () => {
    actionButton()!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
    await new Promise((resolve) => setTimeout(resolve));
  });
  expect(inputs).toEqual(["api", "keyboardundo"]);
});

test("a spoken toast stays 10 seconds and takes its words with it; a timeout of 0 keeps it", async () => {
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  try {
    const history = createEventHistory<Meeting, string, string>();
    const view = await render(<Application history={history} />);
    cleanup = view.unmount;
    const status = () =>
      document.querySelector('[role="status"]:not([data-calendar-part])')?.textContent?.trim();
    await act(async () => {
      await actions!.proposeEventChange({ cause: "delete", eventId: "standup" });
    });
    expect(toast()).toBe("Event deleted [Undo]");
    expect(status()).toBe("Event deleted. To undo it, press F6 and choose Undo.");
    // Past the usual 6 seconds, still there to be heard out.
    await act(async () => vi.advanceTimersByTimeAsync(7_000));
    expect(toast()).toBe("Event deleted [Undo]");
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(toast()).toBeNull();
    expect(status()).toBe("");

    await view.unmount();
    const kept = await render(
      <Application
        history={createEventHistory<Meeting, string, string>()}
        toast={{ timeout: 0 }}
      />,
    );
    cleanup = kept.unmount;
    await act(async () => {
      await actions!.proposeEventChange({ cause: "delete", eventId: "standup" });
    });
    await act(async () => vi.advanceTimersByTimeAsync(30_000));
    expect(toast()).toBe("Event deleted [Undo]");
  } finally {
    vi.useRealTimers();
  }
});
