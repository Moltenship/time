"use client";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

import { Calendar, meetings, weekRules } from "./calendar";

export function WeekOnlyForAgents() {
  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings}
      onViewChange={(view, detail) => {
        // A person can still open the month view.
        if (detail.source === "agent" && view === "month") detail.cancel();
      }}
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
