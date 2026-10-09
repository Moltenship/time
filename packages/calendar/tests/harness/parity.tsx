import {
  createCalendar,
  createCanonicalEventAdapter,
  type AnyCalendarView,
  type CalendarAnnouncementMessages,
  type CalendarEvent,
  type CalendarEventChange,
} from "@moltenship/calendar";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Runs a view's pointer and keyboard gestures on fresh calendars, so tests can compare the
 * `CalendarEventChange` each input makes.
 */

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export type FixtureEvent = CalendarEvent<null, string, string>;
export type Change = CalendarEventChange<FixtureEvent, string, string>;

export const timeZone = "America/New_York";

export function allDay(id: string, start: string, end: string): FixtureEvent {
  const date = (value: string) => Temporal.PlainDate.from(value);
  return { data: null, end: date(end), id, kind: "all-day", start: date(start), title: id };
}

export function timed(id: string, start: string, end: string): FixtureEvent {
  const instant = (value: string) =>
    Temporal.ZonedDateTime.from(`${value}[${timeZone}]`).toInstant();
  return { data: null, end: instant(end), id, kind: "timed", start: instant(start), title: id };
}

/** Says what was saved, so both inputs can be checked to announce the same thing. */
const messages: CalendarAnnouncementMessages = {
  cancel: () => "cancel",
  commit: ({ cause, event, proposed }, { formatRange }) =>
    `${cause} ${event?.title ?? "new"} ${formatRange(proposed)}`.replace(/\s/gu, " "),
  reject: ({ reason }) => reason,
  start: () => null,
  step: () => null,
};

export function createParity(view: AnyCalendarView) {
  const Calendar = createCalendar<FixtureEvent>()({
    eventAdapter: createCanonicalEventAdapter<null, string, string>(),
    views: [view],
  });

  function Fixture({
    anchor,
    events: initial,
    onChange,
  }: {
    readonly anchor: string;
    readonly events: readonly FixtureEvent[];
    readonly onChange: (change: Change) => void;
  }) {
    const [events, setEvents] = useState(initial);
    return (
      <Calendar.Root
        defaultAnchorDate={Temporal.PlainDate.from(anchor)}
        defaultTimeZone={timeZone}
        events={events}
        locale="en-US"
        now={Temporal.Instant.from("2026-10-08T16:00:00Z")}
        onEventChange={(change) => {
          onChange(change);
          if (change.eventId === null || change.proposed === null) return;
          const { proposed } = change;
          setEvents((current) =>
            current.map((event) =>
              event.id === change.eventId ? ({ ...event, ...proposed } as FixtureEvent) : event,
            ),
          );
        }}
        weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
      >
        <Calendar.ActiveView />
        <Calendar.Announcer messages={messages} />
      </Calendar.Root>
    );
  }

  let root: Root | undefined;

  async function unmount() {
    await act(async () => root?.unmount());
    root = undefined;
    document.body.replaceChildren();
    // The guard that swallows a drag's trailing click expires on the next task.
    await new Promise((resolve) => setTimeout(resolve));
  }

  /** Mounts a fresh calendar, so each input's changes start at `change-1`. */
  async function mount(events: readonly FixtureEvent[], anchor: string) {
    await unmount();
    const changes: Change[] = [];
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        <Fixture anchor={anchor} events={events} onChange={(change) => changes.push(change)} />,
      ),
    );
    const spoken = () =>
      container.querySelector('[data-calendar-part="announcer"]')!.textContent!.trim();
    return { changes, container, spoken };
  }

  return { mount, unmount };
}

export function pointer(type: string, target: Element, x: number, y: number) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  target.dispatchEvent(event);
}

/** Presses, moves, and releases the pointer, starting on `press`. */
export async function drag(
  press: Element,
  from: { readonly x: number; readonly y: number },
  to: { readonly x: number; readonly y: number },
) {
  await act(async () => {
    pointer("pointerdown", press, from.x, from.y);
    pointer("pointermove", press, to.x, to.y);
    pointer("pointerup", press, to.x, to.y);
    await Promise.resolve();
  });
}

export const shiftSpace: [string, KeyboardEventInit] = [" ", { shiftKey: true }];

/** Focuses `start`, then presses each key on whatever has focus. */
export async function keys(
  start: Element,
  sequence: readonly (string | [string, KeyboardEventInit])[],
) {
  await act(async () => (start as HTMLElement).focus());
  for (const entry of sequence) {
    const [key, init] = typeof entry === "string" ? [entry, {}] : entry;
    await act(async () => {
      document.activeElement!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }),
      );
      await Promise.resolve();
    });
  }
}
