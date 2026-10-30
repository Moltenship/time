"use client";

import { VisuallyHidden } from "@astryxdesign/core/VisuallyHidden";
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
import * as stylex from "@stylexjs/stylex";
import { XIcon } from "lucide-react";
import { useEffect, useInsertionEffect, useRef, useState } from "react";

import { calendarHistoryAnnouncements } from "@registry/stylex-calendar/announcements";
import { calendarVars } from "@registry/stylex-calendar-theme/calendar-tokens.stylex";
import { type XStyle, xprops } from "@registry/stylex-calendar-theme/xprops";

const styles = stylex.create({
  action: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${calendarVars["--background"]} 15%, transparent)`,
    },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px color-mix(in oklch, ${calendarVars["--background"]} 60%, transparent)`,
    },
    color: "inherit",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "inherit",
    fontWeight: 600,
    height: "2rem",
    lineHeight: "inherit",
    outlineStyle: "none",
    paddingBlock: 0,
    paddingInline: "0.75rem",
  },
  close: {
    appearance: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": `color-mix(in oklch, ${calendarVars["--background"]} 15%, transparent)`,
    },
    borderRadius: "calc(var(--radius) * 0.8)",
    borderWidth: 0,
    boxShadow: {
      default: null,
      ":focus-visible": `0 0 0 2px color-mix(in oklch, ${calendarVars["--background"]} 60%, transparent)`,
    },
    color: {
      default: `color-mix(in oklch, ${calendarVars["--background"]} 70%, transparent)`,
      ":hover": calendarVars["--background"],
    },
    cursor: "pointer",
    display: "grid",
    height: "2rem",
    outlineStyle: "none",
    padding: 0,
    placeItems: "center",
    width: "2rem",
  },
  closeIcon: {
    height: "1rem",
    width: "1rem",
  },
  content: {
    alignItems: "center",
    display: "flex",
    gap: "0.25rem",
  },
  title: {
    color: "inherit",
    fontSize: "inherit",
    fontWeight: "inherit",
    lineHeight: "inherit",
    marginBlock: 0,
    marginRight: "0.5rem",
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  toast: {
    alignItems: "center",
    backgroundColor: calendarVars["--foreground"],
    borderRadius: "var(--radius)",
    boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
    color: calendarVars["--background"],
    display: "flex",
    fontSize: "0.875rem",
    gap: "0.25rem",
    lineHeight: "1.25rem",
    opacity: { default: null, "[data-ending-style]": 0, "[data-starting-style]": 0 },
    paddingBlock: "0.375rem",
    paddingLeft: "1rem",
    paddingRight: "0.375rem",
    transitionDuration: "200ms",
    transitionProperty: {
      default: "opacity, translate",
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    translate: {
      default: null,
      "[data-ending-style]": "0 0.5rem",
      "[data-starting-style]": "0 0.5rem",
    },
  },
  viewport: {
    alignItems: "center",
    borderRadius: "calc(var(--radius) * 1.4)",
    bottom: "1.5rem",
    boxShadow: { default: null, ":focus-visible": `0 0 0 2px ${calendarVars["--ring"]}` },
    display: "flex",
    flexDirection: "column",
    insetInline: 0,
    marginInline: "auto",
    maxWidth: "calc(100vw - 2rem)",
    outlineStyle: "none",
    position: "fixed",
    width: "fit-content",
    zIndex: 50,
  },
});

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
  /** Styles for the toast's region, after its own. */
  readonly xstyle?: XStyle;
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
  xstyle,
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
          {...xprops({ className }, styles.viewport, xstyle)}
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
}: Omit<
  CalendarHistoryToastProps<TEvent, TEventId, TResourceId>,
  "className" | "timeout" | "xstyle"
> & {
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
    <VisuallyHidden as="div" aria-atomic aria-live="polite" role="status">
      {spoken}
    </VisuallyHidden>
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
    <Toast.Root key={toast.id} toast={toast} {...stylex.props(styles.toast)}>
      <Toast.Content {...stylex.props(styles.content)}>
        <Toast.Title {...stylex.props(styles.title)} />
        <Toast.Action {...stylex.props(styles.action)} />
        <Toast.Close aria-label={dismiss} {...stylex.props(styles.close)}>
          <XIcon {...stylex.props(styles.closeIcon)} />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ));
}
