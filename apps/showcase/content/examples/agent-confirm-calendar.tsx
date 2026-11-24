"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";
import { Button } from "@/components/ui/button";

import { deleteRequest } from "./agent-confirm";
import { applyChange, timedOnly } from "./agent-save";
import { Calendar, meetings as initialMeetings, weekRules } from "./calendar";

export function ConfirmingCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);
  const pending = useSyncExternalStore(
    deleteRequest.subscribe,
    deleteRequest.getSnapshot,
    () => null,
  );
  const meeting = meetings.find(({ id }) => id === pending?.eventId);
  // The calendar left the page with a question open: the answer is no.
  useEffect(() => () => deleteRequest.getSnapshot()?.answer(false), []);

  return (
    <div className="flex h-full flex-col">
      {pending === null ? null : (
        <div
          aria-label="The agent asks to delete a meeting"
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm"
          role="alertdialog"
        >
          <p>
            The agent wants to delete{" "}
            <strong>{meeting === undefined ? `"${pending.eventId}"` : meeting.title}</strong>.
          </p>
          <div className="flex gap-2">
            <Button autoFocus onClick={() => pending.answer(false)} variant="outline">
              Keep it
            </Button>
            <Button onClick={() => pending.answer(true)} variant="destructive">
              Delete
            </Button>
          </div>
        </div>
      )}
      <Calendar.Root
        label="Team calendar"
        // Without this the calendar has no `deleteEvent` action, whatever `allow` answers.
        allowAgentDelete
        events={meetings}
        onEventChange={(change, detail) =>
          setMeetings((current) => applyChange(current, change, detail))
        }
        policies={[timedOnly]}
        defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
        defaultTimeZone="Europe/Berlin"
        locale="en-US"
        weekRules={weekRules}
      >
        <Calendar.Frame className="flex min-h-0 flex-1 flex-col">
          <CalendarToolbar calendar={Calendar} />
          <Calendar.Viewport className="min-h-0 flex-1">
            <Calendar.ActiveView />
          </Calendar.Viewport>
        </Calendar.Frame>
      </Calendar.Root>
    </div>
  );
}
