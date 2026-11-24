"use client";

import { useCallback, useState } from "react";

import { agent } from "@/content/examples/agent";
import { AuditedCalendar } from "@/content/examples/agent-audit";

import { AgentCode, AgentPanel, AgentPlayground, type AgentScript } from "./playground";
import {
  act,
  calendarLabel,
  createMeeting,
  monthView,
  moveReview,
  renameLunch,
  weekView,
} from "./scripts";

const scripts: readonly AgentScript[] = [
  moveReview,
  act(
    "Move the standup to Saturday",
    ["goToDate", { date: "2026-10-08" }],
    ["moveEvent", { eventId: "standup", start: "2026-10-10T09:00" }],
  ),
  createMeeting,
  renameLunch,
  monthView,
  weekView,
];

/**
 * The changes guide's example: what the application's handlers hear for a person's change and
 * for an agent's, a policy that refuses an agent, and an undo that takes back the agent only.
 */
export default function AgentChangesExample() {
  const [run, setRun] = useState(0);
  const [log, setLog] = useState<readonly string[]>([]);
  const onLog = useCallback(
    (line: string) => setLog((current) => [line, ...current].slice(0, 30)),
    [],
  );

  return (
    <AgentPlayground
      agent={agent}
      calendar={<AuditedCalendar key={run} onLog={onLog} />}
      label={calendarLabel}
      onReset={() => {
        setLog([]);
        setRun((current) => current + 1);
      }}
      scripts={scripts}
    >
      <AgentPanel className="border-b" title="What your handlers heard, newest first">
        <AgentCode label="Changes, with who made each">
          {log.length === 0
            ? "Nothing yet. Drag a meeting, press a toolbar button, or run a step below."
            : log.join("\n")}
        </AgentCode>
      </AgentPanel>
    </AgentPlayground>
  );
}
