"use client";

import { CalendarToolbar } from "@/components/calendar/calendar-toolbar";

import { Calendar, meetings, weekRules } from "./calendar";

export function PrivateCalendar() {
  return (
    // Everything inside is left out of what an agent sees and can act on.
    <section data-agent-hidden>
      <Calendar.Root
        label="Private calendar"
        events={meetings}
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
    </section>
  );
}
