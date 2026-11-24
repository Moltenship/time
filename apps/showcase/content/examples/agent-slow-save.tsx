"use client";

import { useState } from "react";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

import { applyChange, timedOnly, type MeetingChange } from "./agent-save";
import { Calendar, meetings as initialMeetings, weekRules, type Meeting } from "./calendar";

export interface SavedCalendarProps {
  /** Hears an agent's change whose save failed after the agent was told "saving". */
  readonly onAgentSaveFailed: (change: MeetingChange) => void;
  /** Your server call: resolves once the change is stored, or rejects. */
  readonly save: (change: MeetingChange) => Promise<void>;
}

export function SavedCalendar({ onAgentSaveFailed, save }: SavedCalendarProps) {
  const [meetings, setMeetings] = useState<readonly Meeting[]>(initialMeetings);

  return (
    <Calendar.Root
      // Its own name: a page with two calendars gives each one a label.
      label="Bookings"
      events={meetings}
      // The calendar shows the change as pending until this promise settles, and the agent's
      // step returns it with `status: "saving"`.
      onEventChange={async (change, detail) => {
        await save(change);
        setMeetings((current) => applyChange(current, change, detail));
      }}
      // How every proposal ended, the agent's included. The agent reads the same from `getChange`.
      onEventChangeResult={(result, detail) => {
        if (detail.input !== "agent" || result.status !== "rejected") return;
        if (result.change !== undefined) onAgentSaveFailed(result.change);
      }}
      policies={[timedOnly]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame className="flex h-full flex-col">
        <CalendarToolbar calendar={Calendar} />
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
