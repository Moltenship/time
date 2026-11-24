"use client";

import { useState } from "react";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

import { applyChange, timedOnly } from "./agent-save";
import { Calendar, meetings as initialMeetings, weekRules } from "./calendar";

export function AgentReadyCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);

  return (
    <Calendar.Root
      // The name an agent finds the calendar by. Without it, the title names the calendar, and
      // the title changes with every navigation.
      label="Team calendar"
      events={meetings}
      // An agent's change arrives here like a drag does, and `detail.fields` has what the agent
      // sent beside the times, such as a title. Without a handler the calendar is read-only,
      // for agents too.
      onEventChange={(change, detail) =>
        setMeetings((current) => applyChange(current, change, detail))
      }
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
