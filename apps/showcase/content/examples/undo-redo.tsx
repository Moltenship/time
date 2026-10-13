"use client";

import {
  createEventHistory,
  useCalendarHistory,
  type CalendarEventChange,
  type CalendarPolicy,
  type EventHistory,
} from "@moltenship/calendar";
import { useState } from "react";

import {
  calendarAnnouncements,
  calendarHistoryAnnouncements,
} from "@/components/calendar/announcements";
import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { Button } from "@/components/ui/button";

import { Calendar, meetings as initialMeetings, weekRules, type Meeting } from "./quick-start";

type MeetingChange = CalendarEventChange<Meeting, string, never>;
type MeetingHistory = EventHistory<Meeting, string, never>;

// Meetings always have a time, so drops onto the all-day row are refused rather than saved as
// nothing, which the history would record.
const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { type: "reject", reason: "meetings-need-a-time" };

// #region apply
function applyChange(
  meetings: readonly Meeting[],
  change: MeetingChange,
  id = crypto.randomUUID(),
): readonly Meeting[] {
  if (change.cause === "delete") {
    return meetings.filter((meeting) => meeting.id !== change.eventId);
  }
  if (change.proposed.kind !== "timed") return meetings;

  const { start, end } = change.proposed;
  if (change.cause === "create") {
    // Undoing a delete proposes a create with the deleted meeting: bring it back as it was.
    const meeting = change.event ?? { id, title: "New meeting", color: "blue" as const };
    return [...meetings, { ...meeting, start, end }];
  }
  return meetings.map((meeting) =>
    meeting.id === change.eventId ? { ...meeting, start, end } : meeting,
  );
}
// #endregion apply

// #region root
export function UndoableCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);
  // The meeting each create became, by change ID, so the history can find it to undo.
  const [createdIds] = useState(() => new Map<string, string>());
  const [history] = useState(() =>
    createEventHistory<Meeting, string, never>({
      limit: 50,
      // Once the meetings show it.
      createdEventId: (change, events) => {
        const id = createdIds.get(change.id);
        return id !== undefined && events.get(id) !== undefined ? id : undefined;
      },
    }),
  );

  return (
    <Calendar.Root
      events={meetings}
      onEventChange={(change) => {
        // A restored meeting keeps its ID; one made from a range gets a new one.
        const id =
          change.cause === "create" ? (change.event?.id ?? crypto.randomUUID()) : undefined;
        if (id !== undefined) createdIds.set(change.id, id);
        setMeetings((current) => applyChange(current, change, id));
      }}
      onEventChangeResult={history.record}
      policies={[timedOnly]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <CalendarToolbar calendar={Calendar}>
          <UndoButtons history={history} />
        </CalendarToolbar>
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
      <Calendar.Announcer messages={calendarAnnouncements} />
    </Calendar.Root>
  );
}
// #endregion root

// #region buttons
// Anywhere inside Root.
function UndoButtons({ history }: { readonly history: MeetingHistory }) {
  const { canRedo, canUndo, redo, undo } = useCalendarHistory(history, {
    messages: calendarHistoryAnnouncements,
  });

  return (
    <div className="flex gap-1">
      <Button disabled={!canUndo} onClick={() => undo()} variant="ghost">
        Undo
      </Button>
      <Button disabled={!canRedo} onClick={() => redo()} variant="ghost">
        Redo
      </Button>
    </div>
  );
}
// #endregion buttons
