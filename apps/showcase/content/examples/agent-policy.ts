import type { CalendarPolicy } from "@moltenship/calendar";

import type { Meeting } from "./calendar";

// An agent books weekdays only. A person can still drag a meeting onto Saturday: the policy
// reads who proposed the change.
export const weekdaysForAgents: CalendarPolicy<Meeting, string, never> = (
  { proposed },
  { detail, timeZone },
) => {
  if (detail?.input !== "agent" || proposed === null || proposed.kind !== "timed") {
    return { type: "accept" };
  }
  const { dayOfWeek } = proposed.start.toZonedDateTimeISO(timeZone);
  return dayOfWeek >= 6
    ? { type: "reject", reason: "agents-book-weekdays-only" }
    : { type: "accept" };
};
