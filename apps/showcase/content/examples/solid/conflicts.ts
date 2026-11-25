// #region conflicts
import { conflictPolicy, type CalendarPolicy } from "@moltenship/calendar-solid";

import type { Appointment } from "./schedule";
import { resources } from "./schedule-resources";

const rooms = new Set(
  resources.filter((resource) => resource.data.kind === "room").map((resource) => resource.id),
);

// <Schedule.Root policies={policies} resources={resources} … />
export const policies = [
  conflictPolicy<Appointment, string, string>({
    mode: "warn", // people, and any resource getResourceMode leaves out
    getResourceMode: (resourceId) => (rooms.has(resourceId) ? "block" : undefined),
  }),
];
// #endregion conflicts

// #region by-calendar
const strict = conflictPolicy<Appointment, string, string>({ mode: "block" });
const lenient = conflictPolicy<Appointment, string, string>({ mode: "warn" });

export const byCalendar: CalendarPolicy<Appointment, string, string> = (change, context) =>
  change.event?.calendarId === "interviews" ? strict(change, context) : lenient(change, context);
// #endregion by-calendar
