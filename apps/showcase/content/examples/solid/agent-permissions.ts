// #region permissions
import { createAgent } from "@ui-sdk/solid/agent";

/** What the person lets the agent do, from a switch in your settings. */
export type AgentAccess = "read" | "navigate" | "edit";

// Reading the calendar's facts, its events and how a change ended. These are steps too, so a
// list of what's allowed has to name them, or the agent never learns an event's ID.
const reading: ReadonlySet<string> = new Set(["describeCalendar", "listEvents", "getChange"]);
const navigation: ReadonlySet<string> = new Set([
  "navigateNext",
  "navigatePrevious",
  "navigateToday",
  "goToDate",
  "setView",
  "selectEvent",
]);
const editing: ReadonlySet<string> = new Set([
  "createEvent",
  "updateEvent",
  "moveEvent",
  "resizeEvent",
]);

let access: AgentAccess = "navigate";

export function setAgentAccess(next: AgentAccess): void {
  access = next;
}

export const agent = createAgent({
  // Asked before every step, with the component the step resolved to. The bridge's own
  // `snapshot` and `query` aren't steps: they always answer.
  allow: ({ action, component }) => {
    if (component !== "calendar") return false;
    if (reading.has(action)) return true;
    if (navigation.has(action)) return access !== "read";
    // Never `deleteEvent` or `setTimeZone`, whatever the switch says.
    return access === "edit" && editing.has(action);
  },
});
// #endregion permissions
