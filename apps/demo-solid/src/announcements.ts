import type {
  CalendarAnnouncementMessages,
  CalendarInteractionCause,
  CalendarInteractionUpdate,
} from "@moltenship/calendar-core";
import type {
  CalendarHistoryAnnouncementBuilder,
  CalendarHistoryMessages,
} from "@moltenship/calendar-solid";

// This page's English messages, shorter than the registry's set (registry/shared/calendar/announcements.ts).

const hints: Readonly<Record<CalendarInteractionCause, string>> = {
  create: "Use the arrow keys to extend it, then Enter to finish or Escape to cancel.",
  move: "Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
  "resize-end": "Use the arrow keys to change its end, then Enter to finish or Escape to cancel.",
  "resize-start":
    "Use the arrow keys to change its start, then Enter to finish or Escape to cancel.",
};

const name = (update: CalendarInteractionUpdate) => update.event?.title ?? "the new event";

/** What the keyboard and pointer say as a move, resize or create goes. */
export const announcements: CalendarAnnouncementMessages = {
  start: (update, { formatRange }) => {
    const when = update.proposed === null ? "" : `, ${formatRange(update.proposed)}`;
    const opening =
      update.cause === "create"
        ? `New event${when}.`
        : update.cause === "move"
          ? `Picked up ${name(update)}${when}.`
          : `Resizing ${name(update)}${when}.`;
    return update.input === "keyboard" ? `${opening} ${hints[update.cause]}` : opening;
  },
  step: (update, { formatRange }) => {
    if (update.proposed === null) return null;
    const refused = update.check?.status === "rejected" ? ", which can't be saved" : "";
    return `${formatRange(update.proposed)}${refused}`;
  },
  commit: (update, { formatRange }) =>
    update.cause === "create"
      ? `New event for ${formatRange(update.proposed)}.`
      : `${update.event?.title ?? "The event"} now runs ${formatRange(update.proposed)}.`,
  reject: (update) =>
    update.reason === "superseded"
      ? null
      : update.reason === "locked-event"
        ? `${update.event?.title ?? "The event"} is locked, so it's back where it was.`
        : `Couldn't save ${name(update)}, so it's back where it was.`,
  cancel: (update) => `Cancelled. ${update.event?.title ?? "Nothing"} stays where it was.`,
};

const outcome: CalendarHistoryAnnouncementBuilder = (result, { event, formatRange }) => {
  const verb = result.direction;
  if (result.status === "empty") return `Nothing to ${verb}.`;
  const title = event?.title ?? "the event";
  if (result.status === "stale") return `Can't ${verb} that: ${title} has changed since.`;
  if (result.status === "rejected") {
    return result.result.reason === "superseded"
      ? null
      : `Couldn't ${verb} the change to ${title}.`;
  }
  const placement = verb === "undo" ? result.step.before : result.step.after;
  if (placement === null) return verb === "undo" ? `Removed ${title}.` : `Deleted ${title} again.`;
  return `${verb === "undo" ? "Undid" : "Redid"} the change: ${title} runs ${formatRange(placement)}.`;
};

/** What undo and redo say. */
export const historyAnnouncements: CalendarHistoryMessages = { redo: outcome, undo: outcome };
