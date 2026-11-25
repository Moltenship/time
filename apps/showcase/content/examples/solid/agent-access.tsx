// Connect an agent's live example: the switch that sets what the agent may do, and calls that
// `allow` lets through or refuses.

// #region access
import { createSignal, For } from "solid-js";

import { AgentReadyCalendar } from "./agent-calendar";
import { agent, setAgentAccess, type AgentAccess } from "./agent-permissions";
import { AgentSteps, step, type AgentCall } from "./agent-steps";

const levels: readonly { readonly label: string; readonly value: AgentAccess }[] = [
  { label: "Read", value: "read" },
  { label: "Read and navigate", value: "navigate" },
  { label: "Read, navigate and edit", value: "edit" },
];

const calls: readonly AgentCall[] = [
  { label: "List the events in view", steps: [step("listEvents")] },
  { label: "Go to the next weeks", steps: [step("navigateNext")] },
  {
    label: "Move Standup to Friday at 10:00",
    steps: [step("moveEvent", { eventId: "standup", start: "2026-10-09T10:00" })],
  },
  { label: "Set the time zone to Tokyo", steps: [step("setTimeZone", { timeZone: "Asia/Tokyo" })] },
];

export default function AgentAccessPage() {
  const [access, setAccess] = createSignal<AgentAccess>("navigate");
  return (
    <AgentSteps agent={agent} calls={calls}>
      <fieldset>
        <legend>The agent may</legend>
        <For each={levels}>
          {(level) => (
            <label>
              <input
                checked={access() === level.value}
                name="access"
                onChange={() => {
                  setAccess(level.value);
                  setAgentAccess(level.value);
                }}
                type="radio"
              />
              {level.label}
            </label>
          )}
        </For>
      </fieldset>
      <AgentReadyCalendar />
    </AgentSteps>
  );
}
// #endregion access
