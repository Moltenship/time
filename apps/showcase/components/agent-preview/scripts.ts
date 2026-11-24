import type { AgentCall, AgentScript } from "./playground";

/** The `label` every agent example gives its calendar, which the scripted steps name it by. */
export const calendarLabel = "Team calendar";

/** An action and the one object it takes, if it takes any. */
type Step = readonly [action: string, input?: Readonly<Record<string, unknown>>];

const toStep = ([action, input]: Step) => ({
  action,
  args: input === undefined ? [] : [input],
  ref: calendarLabel,
});

/** One `act` call with these steps, each naming the calendar by its label. */
export function actCall(...steps: readonly Step[]): AgentCall {
  return { input: { steps: steps.map(toStep) }, tool: "act" };
}

/** A call's steps on the calendar named `label`, for an example whose calendar has another name. */
export function callOn(label: string, call: AgentCall): AgentCall {
  if (call.tool !== "act") return call;
  return {
    input: { ...call.input, steps: call.input.steps.map((step) => ({ ...step, ref: label })) },
    tool: "act",
  };
}

/** A script's steps on the calendar named `label`. */
export function scriptOn(label: string, script: AgentScript): AgentScript {
  return {
    ...script,
    calls: script.calls.map((call) =>
      typeof call === "function" ? (memory) => callOn(label, call(memory)) : callOn(label, call),
    ),
  };
}

/** A button that sends one `act` call with these steps. */
export function act(name: string, ...steps: readonly Step[]): AgentScript {
  return { calls: [actCall(...steps)], label: name };
}

const toShownWeek: Step = ["goToDate", { date: "2026-10-08" }];

export const describeCalendar = act("Describe the calendar", ["describeCalendar"]);
export const listEvents = act("List the events in view", ["listEvents"]);
export const listOctober = act("List October's events", [
  "listEvents",
  { end: "2026-11-01", start: "2026-10-01" },
]);
export const nextWeek = act("Next week", ["navigateNext"]);
export const monthView = act("Month view", ["setView", { view: "month" }]);
export const weekView = act("Week view", ["setView", { view: "week" }]);
export const moveReview = act("Move the design review to Friday at 10:00", toShownWeek, [
  "moveEvent",
  { eventId: "review", start: "2026-10-09T10:00" },
]);
export const createMeeting = act("Book “Customer call” on Tuesday at 14:00", toShownWeek, [
  "createEvent",
  { end: "2026-10-06T15:00", start: "2026-10-06T14:00", title: "Customer call" },
]);
export const renameLunch = act("Rename the team lunch", toShownWeek, [
  "updateEvent",
  { eventId: "lunch", title: "Team lunch at the canteen" },
]);
export const deleteLunch = act("Delete the team lunch", ["deleteEvent", { eventId: "lunch" }]);
export const readPage: AgentScript = { calls: [{ tool: "snapshot" }], label: "Read the page" };
