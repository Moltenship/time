"use client";

import { useState } from "react";

import { agent } from "@/content/examples/agent";
import { AgentReadyCalendar } from "@/content/examples/agent-calendar";

import { AgentPlayground, type AgentScript } from "./playground";
import {
  calendarLabel,
  createMeeting,
  describeCalendar,
  listEvents,
  listOctober,
  monthView,
  moveReview,
  nextWeek,
  renameLunch,
  weekView,
} from "./scripts";

const scripts: readonly AgentScript[] = [
  describeCalendar,
  listEvents,
  listOctober,
  moveReview,
  createMeeting,
  renameLunch,
  nextWeek,
  monthView,
  weekView,
];

/** The first agent guide's example: a calendar, what the bridge lists for it, and scripted steps. */
export default function AgentOverviewExample() {
  const [run, setRun] = useState(0);
  return (
    <AgentPlayground
      agent={agent}
      calendar={<AgentReadyCalendar key={run} />}
      label={calendarLabel}
      onReset={() => setRun((current) => current + 1)}
      scripts={scripts}
    />
  );
}
