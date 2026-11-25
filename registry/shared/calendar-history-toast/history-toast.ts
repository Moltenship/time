import type {
  EventHistoryActivity,
  EventHistoryOutcome,
  EventHistoryStep,
  EventId,
  ResourceId,
} from "@moltenship/calendar";

/*
 * The undo toast's words and what it shows after each activity of a history. Every framework's
 * toast reads them from here; edit or translate the words in place.
 */

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

/** The toast's `shortcuts` as `useCalendarHistoryShortcuts` takes them: `false` turns them off. */
export function calendarHistoryShortcutKeys(shortcuts: CalendarHistoryToastShortcuts | false = {}) {
  return { ...(shortcuts === false ? {} : shortcuts), disabled: shortcuts === false };
}

/** How long a toast stays by default, in milliseconds. */
export const calendarHistoryToastTimeout = 6000;

/** One toast at a time: a new one replaces the last. */
export const calendarHistoryToastId = "calendar-history";

/** A toast to show for a history's latest activity. */
export interface CalendarHistoryToastContent {
  /** The command its button runs, if it has one. */
  readonly action: "redo" | "undo" | null;
  /** Read after the title: how to reach the action, for a change no gesture announced. */
  readonly hint: string | null;
  /** How long it stays, in milliseconds; `0` keeps it until it's dismissed. */
  readonly timeout: number;
  readonly title: string;
}

/**
 * What the toast shows after `activity`, or `null` to close it. `titleOf` gives an event's title
 * as the calendar shows it, and `timeout` is how long a toast stays.
 */
export function calendarHistoryToastContent(
  activity: EventHistoryActivity<unknown, EventId, ResourceId>,
  messages: CalendarHistoryToastMessages,
  titleOf: (eventId: EventId) => string | undefined,
  timeout: number,
): CalendarHistoryToastContent | null {
  const step =
    activity.type === "record"
      ? activity.step
      : activity.outcome.status === "empty"
        ? null
        : activity.outcome.step;
  const name = step?.eventId == null ? undefined : titleOf(step.eventId);
  let title: string | null;
  let action: "undo" | "redo" | null = null;
  if (activity.type === "record") {
    title = messages.recorded(activity.step as Step, name);
    action = "undo";
  } else {
    title = messages.outcome(activity.outcome as Outcome, name);
    if (activity.outcome.status === "committed")
      action = activity.type === "undo" ? "redo" : "undo";
  }
  if (title === null) return null;
  const hint = activity.type === "record" ? messages.recordedHint(activity.step as Step) : null;
  return {
    action,
    hint,
    // A toast with a hint stays long enough to hear it out and press F6. `0` keeps every toast
    // until it's dismissed, which stays so.
    timeout: hint === null || timeout <= 0 ? timeout : Math.max(timeout, 10_000),
    title,
  };
}

/** Reports an undo or redo that threw, as from the app's `createdEventId`. */
export function reportHistoryFailure(error: unknown): void {
  if (typeof reportError === "function") reportError(error);
  else console.error(error);
}
