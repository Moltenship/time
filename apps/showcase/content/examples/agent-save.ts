import type {
  CalendarEventChange,
  CalendarPolicy,
  CalendarProposalDetail,
} from "@moltenship/calendar";

import type { Meeting } from "./calendar";

export type MeetingChange = CalendarEventChange<Meeting, string, never>;

/**
 * The title an agent sent with `createEvent` or `updateEvent`. The calendar passes `fields` on
 * as it got them, so check each one as you would a form's input.
 */
export function titleFrom(detail: CalendarProposalDetail | undefined): string | undefined {
  const title = detail?.fields?.title;
  return typeof title === "string" && title.trim() !== "" ? title.trim() : undefined;
}

// What saving a change means in this example: a new array of meetings.
export function applyChange(
  meetings: readonly Meeting[],
  change: MeetingChange,
  detail?: CalendarProposalDetail,
  id = crypto.randomUUID(),
): readonly Meeting[] {
  if (change.cause === "delete") {
    return meetings.filter((meeting) => meeting.id !== change.eventId);
  }
  if (change.proposed.kind !== "timed") return meetings;

  const { start, end } = change.proposed;
  const title = titleFrom(detail);
  if (change.cause === "create") {
    // A create has times and no event: the app makes the meeting. An agent's `createEvent` can
    // name it; a slot a person drags out can't. An undone delete brings the deleted meeting.
    const meeting = change.event ?? { id, title: title ?? "New meeting", color: "blue" as const };
    return [...meetings, { ...meeting, start, end }];
  }
  // A move, a resize, or an agent's `updateEvent`, which can bring a title with or without times.
  return meetings.map((meeting) =>
    meeting.id === change.eventId
      ? { ...meeting, title: title ?? meeting.title, start, end }
      : meeting,
  );
}

// Meetings always have a time, so an all-day proposal is refused with a reason, not dropped.
export const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { type: "reject", reason: "meetings-need-a-time" };
