import type {
  CalendarEventChange,
  CalendarPolicy,
  CalendarProposalDetail,
  EventHistory,
} from "@moltenship/calendar-core";
import { createComponent, type JSX } from "@solidjs/web";
import { createSignal, untrack, type Setter } from "solid-js";

import {
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarHistory,
  type CalendarHistoryAnnouncementBuilder,
  type CalendarHistoryMessages,
  type CalendarHistoryShortcutsOptions,
} from "../../src";
import { element } from "../../src/props";
import { allDay, KeyboardCalendar, testMessages, type FixtureEvent } from "./interaction";

// A month calendar whose application saves each change into its events and records results into
// a history, as React's history tests render it: written without JSX, as the other fixtures are.

type Change = CalendarEventChange<FixtureEvent, string, string>;
export type History = EventHistory<FixtureEvent, string, string>;
export type ShortcutOptions = Omit<CalendarHistoryShortcutsOptions, "scope">;

const Output = element("output");
const Div = element("div");
const Input = element("input");
const Button = element("button");

/** Says `undo|redo status title range`, so tests read what a screen reader would hear. */
const sayOutcome: CalendarHistoryAnnouncementBuilder = (outcome, { event, formatRange }) => {
  if (outcome.status === "empty") return `${outcome.direction} empty`;
  const placement = outcome.direction === "undo" ? outcome.step.before : outcome.step.after;
  const where = placement === null ? "gone" : formatRange(placement);
  return `${outcome.direction} ${outcome.status} ${event?.title ?? "?"} ${where}`;
};
export const historyMessages: CalendarHistoryMessages = { redo: sayOutcome, undo: sayOutcome };

/** What the fixture's controls bound, for the tests to call. */
export const bound: {
  actions?: ReturnType<typeof KeyboardCalendar.useCalendarActions>;
  controls?: () => CalendarHistory<FixtureEvent, string, string>;
  /** Saves wait for this while a test holds them, as a server would. */
  heldSaves: Promise<void> | null;
  setEvents?: Setter<readonly FixtureEvent[]>;
} = { heldSaves: null };

export const trip = () => allDay("trip", "2026-10-07", "2026-10-09", "Trip");

function Controls(props: {
  readonly history: History;
  readonly messages?: CalendarHistoryMessages;
  readonly shortcuts?: ShortcutOptions;
}): JSX.Element {
  const history = untrack(() => props.history);
  const controls = useCalendarHistory(history, () => ({ messages: props.messages }));
  bound.controls = controls;
  bound.actions = KeyboardCalendar.useCalendarActions();
  const meta = KeyboardCalendar.useCalendarMeta();
  useCalendarHistoryShortcuts(controls, () => ({ ...props.shortcuts, scope: meta().refs.frame }));
  return createComponent(Output, {
    "data-history": "",
    get children() {
      return `${controls().past.length} back, ${controls().future.length} forward`;
    },
  });
}

export interface HistoryFixtureProps {
  readonly children?: JSX.Element;
  readonly history: History;
  readonly initialEvents?: readonly FixtureEvent[];
  /** Rendered inside the frame, after the view. */
  readonly inside?: JSX.Element;
  readonly onResult?: (detail: CalendarProposalDetail) => void;
  readonly policies?: readonly CalendarPolicy<FixtureEvent, string, string>[];
  readonly shortcuts?: ShortcutOptions;
  /** Leaves `messages` out, so undo and redo say nothing. */
  readonly silent?: boolean;
}

/**
 * A calendar frame holding the month view, a text field, an editable region, a dialog and a
 * button whose own handler takes its keys, with the history's controls beside it.
 */
export function HistoryFixture(props: HistoryFixtureProps): JSX.Element {
  const [events, setEvents] = createSignal(untrack(() => props.initialEvents ?? [trip()]));
  bound.setEvents = setEvents;
  const apply = (change: Change) =>
    setEvents((current) => {
      if (change.cause === "create") {
        return [...current, { ...change.event!, ...change.proposed } as FixtureEvent];
      }
      if (change.cause === "delete") return current.filter(({ id }) => id !== change.eventId);
      return current.map((event) =>
        event.id === change.eventId ? ({ ...event, ...change.proposed } as FixtureEvent) : event,
      );
    });
  const save = (change: Change) => {
    if (bound.heldSaves === null) {
      apply(change);
      return undefined;
    }
    return bound.heldSaves.then(() => {
      apply(change);
    });
  };
  return createComponent(KeyboardCalendar.Root, {
    defaultAnchorDate: Temporal.PlainDate.from("2026-10-08"),
    defaultTimeZone: "UTC",
    get events() {
      return events();
    },
    locale: "en-US",
    now: Temporal.Instant.from("2026-10-08T12:00:00Z"),
    onEventChange: save,
    onEventChangeResult: (result, detail) => {
      props.onResult?.(detail);
      props.history.record(result, detail);
    },
    get policies() {
      return props.policies;
    },
    weekRules: { firstDay: 7, minimalDays: 1, weekend: [6, 7] },
    get children() {
      return [
        createComponent(KeyboardCalendar.Frame, {
          get children() {
            return [
              createComponent(KeyboardCalendar.ActiveView, {}),
              createComponent(Input, { "aria-label": "Title", "data-field": "" }),
              createComponent(Div, {
                contentEditable: true,
                "data-editable": "",
                children: "Notes",
              }),
              createComponent(Div, {
                "aria-label": "Details",
                role: "dialog",
                get children() {
                  return createComponent(Button, {
                    "data-in-dialog": "",
                    type: "button",
                    children: "Close",
                  });
                },
              }),
              createComponent(Button, {
                "data-solid-handler": "",
                // A Solid handler inside the frame that takes the key for itself.
                onKeyDown: (event: KeyboardEvent) => event.preventDefault(),
                type: "button",
                children: "Own keys",
              }),
              props.inside,
            ];
          },
        }),
        createComponent(Button, { "data-outside": "", type: "button", children: "Outside" }),
        createComponent(KeyboardCalendar.Announcer, { messages: testMessages }),
        createComponent(Controls, {
          get history() {
            return props.history;
          },
          get messages() {
            return props.silent === true ? undefined : historyMessages;
          },
          get shortcuts() {
            return props.shortcuts;
          },
        }),
        props.children,
      ];
    },
  });
}

export function proposeMove(
  id: string,
  start: string,
  end: string,
  detail?: CalendarProposalDetail,
) {
  return bound.actions!.proposeEventChange(
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
