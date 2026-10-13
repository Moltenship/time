"use client";

import { Toast } from "@base-ui/react/toast";
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

import { cn } from "cn";
import { calendarHistoryAnnouncements } from "@registry/calendar/announcements";

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
   * What a screen reader hears for a change just saved that no gesture announced, such as a
   * delete from your own button, with how to reach the undo action; `null` says nothing.
   */
  readonly recordedAnnouncement: (step: Step, title: string) => string | null;
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
  // changes are spoken here.
  recordedAnnouncement: ({ cause, input }, title) =>
    input === "api" || cause === "delete" || cause === "update"
      ? `${title}. To undo it, press F6 and choose Undo.`
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
 * after each change it offers to undo it, and after an undo, to redo it. Undo and redo are spoken
 * through the root's `Announcer`, and gestures announce themselves, so the toast's region stays
 * quiet; a change no gesture announced is spoken once, with how to reach Undo. Its buttons are
 * reachable with F6.
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
  return (
    <Toast.Provider timeout={timeout}>
      <HistoryToasts {...props} timeout={timeout} />
      <Toast.Portal>
        {/* Quiet: the Announcer speaks for the history. */}
        <Toast.Viewport
          aria-label={region}
          aria-live="off"
          className={cn(
            "fixed inset-x-0 bottom-6 z-50 mx-auto flex w-fit max-w-[calc(100vw-2rem)] flex-col items-center rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring",
            className,
          )}
        >
          <ToastList dismiss={dismiss} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function HistoryToasts<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  announcements = calendarHistoryAnnouncements,
  calendar,
  history,
  messages = calendarHistoryToastMessages,
  shortcuts = {},
  timeout,
}: Omit<CalendarHistoryToastProps<TEvent, TEventId, TResourceId>, "className" | "timeout"> & {
  readonly timeout: number;
}) {
  const bound = useCalendarHistory(history, { messages: announcements ?? undefined });
  const meta = calendar.useCalendarMeta();
  useCalendarHistoryShortcuts(bound, {
    ...(shortcuts === false ? {} : shortcuts),
    disabled: shortcuts === false,
    scope: meta.refs.frame,
  });
  const manager = Toast.useToastManager();
  const [spoken, setSpoken] = useState("");
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
    const announcement =
      activity.type === "record" ? text.recordedAnnouncement(activity.step as Step, title) : null;
    // Adding over the toast on screen merges into it, so `actionProps` is always given: a toast
    // without an action must not keep the last one's.
    manager.add({
      actionProps:
        action === null
          ? undefined
          : {
              children: action === "undo" ? text.undo : text.redo,
              onClick: (event) => {
                // Enter and Space on a button click with no detail.
                const input = event.detail === 0 ? "keyboard" : "pointer";
                controls[action]({ input }).catch(reportFailure);
              },
            },
      id: toastId,
      // What was spoken goes with the toast, which leaves time to hear it out and press F6.
      onRemove: () => setSpoken(""),
      // `0` keeps every toast until it's dismissed, which stays so.
      timeout: announcement === null || shownFor <= 0 ? shownFor : Math.max(shownFor, 10_000),
      title,
    });
    // A repeat gets a trailing space, so the region changes and is read again. A toast with
    // nothing to say leaves no old instruction behind.
    setSpoken((last) =>
      announcement === null ? "" : last === announcement ? `${announcement} ` : announcement,
    );
  }, [bound.latest, manager]);

  // For changes no gesture announced; undo and redo are the Announcer's.
  return (
    <div aria-atomic aria-live="polite" className="sr-only" role="status">
      {spoken}
    </div>
  );
}

/** Reports an undo or redo that threw, as from the app's `createdEventId`. */
function reportFailure(error: unknown) {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}

function ToastList({ dismiss }: { readonly dismiss: string }) {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className="flex items-center gap-1 rounded-lg bg-foreground py-1.5 pr-1.5 pl-4 text-sm text-background shadow-lg transition-[opacity,translate] duration-200 data-ending-style:translate-y-2 data-ending-style:opacity-0 data-starting-style:translate-y-2 data-starting-style:opacity-0 motion-reduce:transition-none"
    >
      <Toast.Content className="flex items-center gap-1">
        <Toast.Title className="mr-2 min-w-0 truncate" />
        <Toast.Action className="h-8 rounded-md px-3 font-semibold outline-none hover:bg-background/15 focus-visible:ring-2 focus-visible:ring-background/60" />
        <Toast.Close
          aria-label={dismiss}
          className="grid size-8 place-items-center rounded-md text-background/70 outline-none hover:bg-background/15 hover:text-background focus-visible:ring-2 focus-visible:ring-background/60"
        >
          <XIcon className="size-4" />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
