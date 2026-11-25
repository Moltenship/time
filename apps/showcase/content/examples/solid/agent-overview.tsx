// Agents in your app's live example: the calendar an agent finds, and a few calls to it.

// #region overview
import { agent } from "./agent";
import { AgentReadyCalendar } from "./agent-calendar";
import { AgentSteps, step, type AgentCall } from "./agent-steps";

const calls: readonly AgentCall[] = [
  { label: "Describe the calendar", steps: [step("describeCalendar")] },
  { label: "List the events in view", steps: [step("listEvents")] },
  {
    label: "Move Standup to Friday at 10:00",
    steps: [step("moveEvent", { eventId: "standup", start: "2026-10-09T10:00" })],
  },
  {
    label: "Book a customer call on Tuesday at 14:00",
    steps: [
      step("createEvent", {
        end: "2026-10-13T15:00",
        start: "2026-10-13T14:00",
        title: "Customer call",
      }),
    ],
  },
  { label: "Go to the next weeks", steps: [step("navigateNext")] },
];

export default function AgentOverview() {
  return (
    <AgentSteps agent={agent} calls={calls}>
      <AgentReadyCalendar />
    </AgentSteps>
  );
}
// #endregion overview
