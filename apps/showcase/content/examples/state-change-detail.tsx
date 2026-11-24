"use client";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

import { Calendar, meetings, weekRules } from "./calendar";

/** Records how the calendar is navigated, and keeps the month view for people. */
export function TrackedCalendar({ track }: { readonly track: (entry: string) => void }) {
  return (
    <Calendar.Root
      label="Team calendar"
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      onAnchorDateChange={(date, detail) => {
        // "next-press by mouse to 2026-10-15", "imperative by agent to 2026-11-02"
        track(`${detail.reason} by ${detail.source} to ${date.toString()}`);
      }}
      onViewChange={(view, detail) => {
        if (view === "month" && detail.source === "agent") detail.cancel();
      }}
    >
      <Calendar.Frame className="flex h-[640px] flex-col rounded-xl border">
        <CalendarToolbar calendar={Calendar} />
        <Calendar.Viewport className="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
