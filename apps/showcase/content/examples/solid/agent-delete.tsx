// Deleting's live example: the agent asks to delete a meeting, and the person answers.

// #region delete
import { agent } from "./agent-confirm";
import { ConfirmingCalendar } from "./agent-confirm-calendar";
import { AgentSteps, step, type AgentCall } from "./agent-steps";

const calls: readonly AgentCall[] = [
  { label: "List the events in view", steps: [step("listEvents")] },
  { label: "Delete Standup", steps: [step("deleteEvent", { eventId: "standup" })] },
];

export default function AgentDeletePage() {
  return (
    <AgentSteps agent={agent} calls={calls}>
      <ConfirmingCalendar />
    </AgentSteps>
  );
}
// #endregion delete
