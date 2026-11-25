// An agent's changes' live example: the audited calendar, its log, and calls a policy accepts
// or refuses.

// #region log
import { createSignal, For } from "solid-js";

import { agent } from "./agent";
import { AuditedCalendar } from "./agent-audit";
import { AgentSteps, step, type AgentCall } from "./agent-steps";

const calls: readonly AgentCall[] = [
  {
    label: "Move Standup to Friday at 10:00",
    steps: [step("moveEvent", { eventId: "standup", start: "2026-10-09T10:00" })],
  },
  {
    label: "Move Standup to Saturday at 10:00",
    steps: [step("moveEvent", { eventId: "standup", start: "2026-10-10T10:00" })],
  },
  {
    label: "Rename Standup",
    steps: [step("updateEvent", { eventId: "standup", title: "Daily standup" })],
  },
  { label: "Go to the next weeks", steps: [step("navigateNext")] },
];

export default function AgentLogPage() {
  const [log, setLog] = createSignal<readonly string[]>([]);
  return (
    <AgentSteps agent={agent} calls={calls}>
      <AuditedCalendar onLog={(line) => setLog((lines) => [...lines, line])} />
      <h2>The app's log</h2>
      <ol>
        <For each={log()} fallback={<li>Nothing yet.</li>}>
          {(line) => <li>{line}</li>}
        </For>
      </ol>
    </AgentSteps>
  );
}
// #endregion log
