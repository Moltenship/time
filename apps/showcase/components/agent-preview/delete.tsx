"use client";

import { useState } from "react";

import { agent } from "@/content/examples/agent-confirm";
import { ConfirmingCalendar } from "@/content/examples/agent-confirm-calendar";

import { AgentPlayground, type AgentScript } from "./playground";
import { act, calendarLabel, deleteLunch, moveReview } from "./scripts";

const scripts: readonly AgentScript[] = [
  deleteLunch,
  act("Delete the standup", ["deleteEvent", { eventId: "standup" }]),
  moveReview,
];

/** The deleting guide's example: a delete waits above the calendar for the person's answer. */
export default function AgentDeleteExample() {
  const [run, setRun] = useState(0);
  return (
    <AgentPlayground
      agent={agent}
      calendar={<ConfirmingCalendar key={run} />}
      hint="A delete waits for your answer above the calendar. Every other step runs at once."
      label={calendarLabel}
      onReset={() => setRun((current) => current + 1)}
      scripts={scripts}
    />
  );
}
