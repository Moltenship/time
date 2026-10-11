import type {
  CalendarAnnouncementContext,
  CalendarAnnouncementMessages,
  CalendarEventPlacement,
  CalendarInteractionCause,
  CalendarInteractionCheck,
  CalendarInteractionUpdate,
  ResourceId,
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

/** Policy reasons a gesture can run into, as a step or a saved change mentions them. */
const concerns: Readonly<Record<string, string>> = {
  "outside-availability": "outside working hours",
  "resource-conflict": "double-booked",
};

/**
 * What a placement runs into, after it: ", outside working hours" when the policies would reject
 * it for that or flag it with it, ", can't go here" for other rejections.
 */
function concern(reasons: readonly string[] | undefined, rejected = false): string {
  const known = (reasons ?? [])
    .map((reason) => concerns[reason])
    .filter((text) => text !== undefined);
  if (known.length > 0) return `, ${known.join(", ")}`;
  return rejected ? ", can't go here" : "";
}

function checkConcern(check: CalendarInteractionCheck | undefined): string {
  if (check == null) return "";
  return check.status === "rejected"
    ? concern([check.reason], true)
    : concern(check.change.warnings);
}

function subject({ event }: Pick<CalendarInteractionUpdate, "event">): string {
  return event === null ? "the new event" : eventTitle(event);
}

function sameResources(left: readonly ResourceId[], right: readonly ResourceId[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id));
}

/**
 * The resources each move last announced, by the placement it started from, which keyboard and
 * pointer updates carry unchanged through a gesture. A step names the resources when they differ
 * from the last announcement, so moving out to another resource and back names both, even when a
 * drag starts over another resource.
 */
const announcedResources = new WeakMap<CalendarEventPlacement, readonly ResourceId[]>();

/**
 * Remembers the resources a move announces, and returns whether they differ from the ones it
 * announced before. A move that hasn't named any yet, as a drag that starts off the view, names
 * them on its first placement. Resizes and creates keep their resources, so they never track them.
 */
function announceResources({ cause, original, proposed }: CalendarInteractionUpdate): boolean {
  if (cause !== "move" || original === null || proposed === null) return false;
  const announced = announcedResources.get(original);
  announcedResources.set(original, proposed.resourceIds);
  return announced === undefined || !sameResources(announced, proposed.resourceIds);
}

/**
 * When a placement is and, with `resources`, the resources it books that the calendar knows:
 * "Thursday, October 8, 9:00 – 9:30 AM, Orchid, Maya".
 */
function describePlacement(
  placement: CalendarEventPlacement,
  where: CalendarAnnouncementContext,
  resources: boolean,
): string {
  const when = describeWhen(placement, where);
  const titles = resources
    ? placement.resourceIds.map(where.resourceTitle).filter((title) => title !== undefined)
    : [];
  return [when, ...titles].join(", ");
}

/**
 * English announcements for moves, resizes, and creates, from the keyboard or a pointer. Render
 * them through `<Calendar.Announcer messages={calendarAnnouncements} />`, and edit or translate
 * them here. In a calendar with resources, picking up, moving and creating an event name the
 * resources it books, and a step names them when the move changes them; a resize can't. Where the
 * policies would reject or flag a placement, such as outside working hours, steps say so.
 */
export const calendarAnnouncements: CalendarAnnouncementMessages = {
  start: (update, where) => {
    announceResources(update);
    const resources = update.cause === "create" || update.cause === "move";
    const when =
      update.proposed === null
        ? ""
        : `, ${describePlacement(update.proposed, where, resources)}${checkConcern(update.check)}`;
    const opening = {
      create: `New event${when}.`,
      move: `Picked up ${subject(update)}${when}.`,
      "resize-end": `Resizing the end of ${subject(update)}${when}.`,
      "resize-start": `Resizing the start of ${subject(update)}${when}.`,
    }[update.cause];
    return update.input === "keyboard" ? `${opening} ${keyboardHints[update.cause]}` : opening;
  },
  step: (update, where) =>
    update.proposed === null
      ? null
      : `${describePlacement(update.proposed, where, announceResources(update))}${checkConcern(update.check)}`,
  commit: (update, where) => {
    const flagged = concern(update.warnings);
    switch (update.cause) {
      case "create":
        return `New event for ${describePlacement(update.proposed, where, true)}${flagged}.`;
      case "move":
        return `Moved ${subject(update)} to ${describePlacement(update.proposed, where, true)}${flagged}.`;
      case "resize-end":
      case "resize-start":
        return `${subject(update)} now runs ${describeWhen(update.proposed, where)}${flagged}.`;
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
      case "outside-availability":
        return update.cause === "create"
          ? "Can't create an event outside working hours."
          : `${subject(update)} can't go outside working hours, so it's back where it was.`;
      case "resource-conflict":
        return update.cause === "create"
          ? "Can't create an event there: someone it books is busy then."
          : `${subject(update)} would double-book someone, so it's back where it was.`;
      default:
        return `Couldn't save ${subject(update)}, so it's back where it was.`;
    }
  },
  cancel: (update) =>
    update.cause === "create"
      ? "Cancelled the new event."
      : `Cancelled. ${subject(update)} is back where it was.`,
};
