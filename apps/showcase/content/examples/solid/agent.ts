// #region agent
import { createAgent } from "@ui-sdk/solid/agent";

// One bridge for the page, created before the app renders.
export const agent = createAgent({
  // Reading, navigation and changes run. A delete doesn't, until your app asks the person.
  allow: (step) => step.action !== "deleteEvent",
});

export async function moveStandup() {
  const outcome = await agent.act({
    steps: [
      {
        ref: "Team calendar",
        action: "moveEvent",
        // Every action takes one object.
        args: [{ eventId: "standup", start: "2026-10-09T11:00" }],
      },
    ],
  });
  if (!outcome.ok) {
    return outcome.error?.message ?? "failed";
  }
  // The change the calendar made of the step: `{ changeId, cause, eventId, proposed, status }`.
  return JSON.stringify(outcome.steps[0]?.result);
}
// #endregion agent
