"use client";

import {
  useCalendarHistory,
  useCalendarHistoryShortcuts,
  type CalendarFactory,
  type CalendarHistoryMessages,
  type EventHistory,
  type EventHistoryOutcome,
  type EventHistoryStep,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar";
import { XIcon } from "lucide-react";
import { useEffect, useInsertionEffect, useRef, useState } from "react";

import { calendarHistoryAnnouncements } from "@registry/calendar/announcements";
import {
  createToastManager,
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
  type ToastManager,
} from "@registry/calendar-ui/toast";

type Step = EventHistoryStep<unknown, EventId, ResourceId>;
type Outcome = EventHistoryOutcome<unknown, EventId, ResourceId>;

/**
 * What the toast says, to edit or translate. `name` is the event's title when the calendar shows
 * it, and `undefined` otherwise, as for an event just deleted. A message that returns `null`
 * shows no toast and closes the one on screen.
 */
export interface CalendarHistoryToastMessages {
  /** A change just saved, such as "Moved “Standup”", shown with the undo action. */
  readonly recorded: (step: Step, name: string | undefined) => string | null;
  /**
   * What a screen reader hears after the toast's title for a change just saved that no gesture
   * announced, such as a delete from your own button: how to reach the undo action. `null` adds
   * nothing.
   */
  readonly recordedHint: (step: Step) => string | null;
  /** How an undo or redo went, shown with the action that takes it back again, if it saved. */
  readonly outcome: (outcome: Outcome, name: string | undefined) => string | null;
  readonly undo: string;
  readonly redo: string;
  readonly dismiss: string;
  /** The name of the region the toast shows in. */
  readonly region: string;
}

const nouns: Readonly<Record<Step["cause"], string>> = {
  create: "create",
  delete: "delete",
  move: "move",
  "resize-end": "resize",
  "resize-start": "resize",
  update: "change",
};

const recordedVerbs: Readonly<Record<Step["cause"], [named: string, unnamed: string]>> = {
  create: ["Created", "Event created"],
  delete: ["Deleted", "Event deleted"],
  move: ["Moved", "Event moved"],
  "resize-end": ["Resized", "Event resized"],
  "resize-start": ["Resized", "Event resized"],
  update: ["Changed", "Event changed"],
};

/** English toasts: "Moved “Standup”" with Undo, then "Undid the move" with Redo. */
export const calendarHistoryToastMessages: CalendarHistoryToastMessages = {
  recorded: ({ cause }, name) => {
    const [named, unnamed] = recordedVerbs[cause];
    return name === undefined ? unnamed : `${named} “${name}”`;
  },
  // Gestures announce their moves, resizes and creates; deletes, updates and the app's own
  // changes say here how to undo them.
  recordedHint: ({ cause, input }) =>
    input === "api" || cause === "delete" || cause === "update"
      ? "To undo it, press F6 and choose Undo."
      : null,
  outcome: (outcome, name) => {
    const verb = outcome.direction;
    switch (outcome.status) {
      case "empty":
        return null;
      case "stale":
        return `Can't ${verb}: ${name === undefined ? "the event" : `“${name}”`} changed since`;
      case "rejected": {
        const { error, reason } = outcome.result;
        // A newer change replaced it, or the app's own question was dismissed.
        const cancelled = error instanceof Error && error.name === "AbortError";
        if (reason === "superseded" || cancelled) return null;
        return `Couldn't ${verb} the ${nouns[outcome.step.cause]}`;
      }
      case "committed":
        return `${verb === "undo" ? "Undid" : "Redid"} the ${nouns[outcome.step.cause]}`;
    }
  },
  undo: "Undo",
  redo: "Redo",
  dismiss: "Dismiss",
  region: "Notifications",
};

export interface CalendarHistoryToastShortcuts {
  /** Keys that undo; `["Mod+Z"]` by default. */
  readonly undo?: readonly string[];
  /** Keys that redo; `["Shift+Mod+Z", "Ctrl+Y"]` by default. */
  readonly redo?: readonly string[];
}

export interface CalendarHistoryToastProps<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** The calendar's factory, for its frame, where the keys work, and for event titles. */
  readonly calendar: Pick<CalendarFactory<TEvent, unknown>, "useCalendarMeta">;
  /** The history `Root`'s `onEventChangeResult` records into. */
  readonly history: EventHistory<TEvent, TEventId, TResourceId>;
  /** What the root's `Announcer` says after an undo or redo; `null` says nothing. */
  readonly announcements?: CalendarHistoryMessages | null;
  /** Classes for the toast's region, such as where it sits. */
  readonly className?: string;
  readonly messages?: CalendarHistoryToastMessages;
  /** The undo and redo keys, in the calendar's frame; `false` turns them off. */
  readonly shortcuts?: CalendarHistoryToastShortcuts | false;
  /** How long a toast stays, in milliseconds. */
  readonly timeout?: number;
}

/** One toast at a time: a new one replaces the last. */
const toastId = "calendar-history";

/**
 * An "Undo" toast for a calendar's event history, with its keys. Render it inside `Root`:
 * after each change it offers to undo it, and after an undo, to redo it. Each toast is read out by
 * its title; a change no gesture announced adds how to reach Undo. Undo and redo are also spoken
 * through the root's `Announcer`, in full. Its buttons are reachable with F6.
 */
export function CalendarHistoryToast<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>({
  className,
  timeout = 6000,
  ...props
}: CalendarHistoryToastProps<TEvent, TEventId, TResourceId>) {
  const { dismiss, region } = props.messages ?? calendarHistoryToastMessages;
  const [manager] = useState(createToastManager);
  return (
    <>
      <HistoryToasts {...props} manager={manager} timeout={timeout} />
      <ToastViewport aria-label={region} className={className} manager={manager}>
        <Toast>
          <ToastTitle />
          {/* Heard after the title, as the toast shows. */}
          <ToastDescription className="sr-only" />
          <ToastAction />
          <ToastClose aria-label={dismiss}>
            <XIcon />
          </ToastClose>
        </Toast>
      </ToastViewport>
    </>
  );
}

function HistoryToasts<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  announcements = calendarHistoryAnnouncements,
  calendar,
  history,
  messages = calendarHistoryToastMessages,
  manager,
  shortcuts = {},
  timeout,
}: Omit<CalendarHistoryToastProps<TEvent, TEventId, TResourceId>, "className" | "timeout"> & {
  readonly manager: ToastManager;
  readonly timeout: number;
}) {
  const bound = useCalendarHistory(history, { messages: announcements ?? undefined });
  const meta = calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(bound, {
    ...(shortcuts === false ? {} : shortcuts),
    disabled: shortcuts === false,
    scope: meta.refs.frame,
  });
  const latest = useRef({ bound, messages, snapshot: meta.eventSnapshot, timeout });
  useInsertionEffect(() => {
    latest.current = { bound, messages, snapshot: meta.eventSnapshot, timeout };
  });

  // Each new activity replaces the toast on screen; a history recorded before this mounted doesn't.
  const shown = useRef(bound.latest);
  useEffect(() => {
    const activity = bound.latest;
    if (activity === shown.current) return;
    shown.current = activity;
    // A cleared history has nothing left to undo.
    if (activity === null) {
      manager.close(toastId);
      return;
    }
    const { bound: controls, messages: text, snapshot, timeout: shownFor } = latest.current;
    const step =
      activity.type === "record"
        ? activity.step
        : activity.outcome.status === "empty"
          ? null
          : activity.outcome.step;
    const name = step?.eventId == null ? undefined : snapshot.get(step.eventId as TEventId)?.title;
    let title: string | null;
    let action: "undo" | "redo" | null = null;
    if (activity.type === "record") {
      title = text.recorded(activity.step as Step, name);
      action = "undo";
    } else {
      title = text.outcome(activity.outcome as Outcome, name);
      if (activity.outcome.status === "committed")
        action = activity.type === "undo" ? "redo" : "undo";
    }
    if (title === null) {
      manager.close(toastId);
      return;
    }
    const hint = activity.type === "record" ? text.recordedHint(activity.step as Step) : null;
    manager.add({
      actionProps:
        action === null
          ? undefined
          : {
              children: action === "undo" ? text.undo : text.redo,
              onClick: ({ input }) => controls[action]({ input }).catch(reportFailure),
            },
      description: hint ?? undefined,
      id: toastId,
      // A toast with a hint stays long enough to hear it out and press F6. `0` keeps every toast
      // until it's dismissed, which stays so.
      timeout: hint === null || shownFor <= 0 ? shownFor : Math.max(shownFor, 10_000),
      title,
    });
  }, [bound.latest, manager]);

  return null;
}

/** Reports an undo or redo that threw, as from the app's `createdEventId`. */
function reportFailure(error: unknown) {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}
