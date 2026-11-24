"use client";

import type { CalendarPolicy } from "@moltenship/calendar";
import { useState } from "react";

import { applyChange } from "./agent-save";
import { Calendar, meetings as initialMeetings, weekRules, type Meeting } from "./calendar";

// `detail` is absent when your own code calls a policy outside a proposal.
const noAgentDeletes: CalendarPolicy<Meeting, string, never> = (change, { detail }) =>
  change.cause === "delete" && detail?.input === "agent"
    ? { type: "reject", reason: "a-person-deletes-meetings" }
    : { type: "accept" };

export function SavingCalendar() {
  const [meetings, setMeetings] = useState(initialMeetings);

  return (
    <Calendar.Root
      events={meetings}
      onEventChange={(change, detail) => {
        if (detail.input === "agent") console.info(`The assistant proposed a ${change.cause}.`);
        setMeetings((current) => applyChange(current, change, detail));
      }}
      policies={[noAgentDeletes]}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
