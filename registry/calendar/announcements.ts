import type {
  CalendarAnnouncementMessages,
  CalendarInteractionCause,
  CalendarInteractionUpdate,
} from "@moltenship/calendar";

import { describeWhen, eventTitle } from "@registry/calendar/event-label";

/** What a keyboard user can press next, after the gesture starts. */
const keyboardHints: Readonly<Record<CalendarInteractionCause, string>> = {
  create: "Use the arrow keys to extend it, then Enter to finish or Escape to cancel.",
  move: "Use the arrow keys to move it, then Enter to drop it or Escape to cancel.",
  "resize-end":
    "Use the arrow keys to change its end, Shift+Space to change its start instead, then Enter to finish or Escape to cancel.",
  "resize-start":
    "Use the arrow keys to change its start, Shift+Space to change its end instead, then Enter to finish or Escape to cancel.",
};

function subject({ event }: Pick<CalendarInteractionUpdate, "event">): string {
  return event === null ? "the new event" : eventTitle(event);
}

/**
 * English announcements for moves, resizes, and creates, from the keyboard or a pointer. Render
 * them through `<Calendar.Announcer messages={calendarAnnouncements} />`, and edit or translate
 * them here.
 */
export const calendarAnnouncements: CalendarAnnouncementMessages = {
  start: (update, where) => {
    const when = update.proposed === null ? "" : `, ${describeWhen(update.proposed, where)}`;
    const opening = {
      create: `New event${when}.`,
      move: `Picked up ${subject(update)}${when}.`,
      "resize-end": `Resizing the end of ${subject(update)}${when}.`,
      "resize-start": `Resizing the start of ${subject(update)}${when}.`,
    }[update.cause];
    return update.input === "keyboard" ? `${opening} ${keyboardHints[update.cause]}` : opening;
  },
  step: ({ proposed }, where) => (proposed === null ? null : describeWhen(proposed, where)),
  commit: (update, where) => {
    const when = describeWhen(update.proposed, where);
    switch (update.cause) {
      case "create":
        return `New event for ${when}.`;
      case "move":
        return `Moved ${subject(update)} to ${when}.`;
      case "resize-end":
      case "resize-start":
        return `${subject(update)} now runs ${when}.`;
    }
  },
  reject: (update) => {
    switch (update.reason) {
      // A newer change to the same event replaced this one.
      case "superseded":
        return null;
      case "read-only":
        return `${subject(update)} is read-only and can't be changed.`;
      case "invalid-placement":
      case "out-of-bounds":
        return `${subject(update)} can't go there, so it's back where it was.`;
      default:
        return `Couldn't save ${subject(update)}, so it's back where it was.`;
    }
  },
  cancel: (update) =>
    update.cause === "create"
      ? "Cancelled the new event."
      : `Cancelled. ${subject(update)} is back where it was.`,
};
