"use client";

import { useEffect, useId, useState } from "react";

import { AgentReadyCalendar } from "@/content/examples/agent-calendar";
import { agent, setAgentAccess, type AgentAccess } from "@/content/examples/agent-permissions";

import { AgentPanel, AgentPlayground, type AgentScript } from "./playground";
import { act, calendarLabel, createMeeting, listEvents, moveReview, nextWeek } from "./scripts";

const scripts: readonly AgentScript[] = [
  listEvents,
  nextWeek,
  moveReview,
  createMeeting,
  act("Change the time zone", ["setTimeZone", { timeZone: "America/New_York" }]),
];

const levels: readonly { readonly label: string; readonly value: AgentAccess }[] = [
  { label: "Read only", value: "read" },
  { label: "Read and navigate", value: "navigate" },
  { label: "Read, navigate and edit", value: "edit" },
];

/** The permissions guide's example: a switch that the bridge's `allow` reads before every step. */
export default function AgentPermissionsExample() {
  const [run, setRun] = useState(0);
  const [access, setAccess] = useState<AgentAccess>("navigate");
  const name = useId();
  // The bridge outlives the page: put the switch back as each visit starts.
  useEffect(() => setAgentAccess(access), [access]);

  return (
    <AgentPlayground
      agent={agent}
      calendar={<AgentReadyCalendar key={run} />}
      label={calendarLabel}
      onReset={() => setRun((current) => current + 1)}
      scripts={scripts}
    >
      <AgentPanel className="border-b" title="The agent may">
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" role="radiogroup">
          {levels.map((level) => (
            <label key={level.value} className="flex items-center gap-2">
              <input
                checked={access === level.value}
                className="accent-fd-primary"
                name={name}
                onChange={() => setAccess(level.value)}
                type="radio"
                value={level.value}
              />
              {level.label}
            </label>
          ))}
        </div>
      </AgentPanel>
    </AgentPlayground>
  );
}
