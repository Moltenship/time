import type {
  CalendarAvailability,
  ResourceAvailability,
  AvailabilityRule,
} from "@moltenship/calendar";

import { demoResources, type DemoResource, type DemoResourceId } from "./resources";

function hours(days: AvailabilityRule["days"], start: string, end: string): AvailabilityRule {
  return { days, end: Temporal.PlainTime.from(end), start: Temporal.PlainTime.from(start) };
}

const weekdays = [1, 2, 3, 4, 5] as const;

/**
 * Office hours on weekdays, on the clock of the time zone the demo shows, and a company holiday on
 * next week's Friday.
 */
export function demoAvailability(today: Temporal.PlainDate): CalendarAvailability {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  return {
    exceptions: [{ date: monday.add({ days: 11 }), label: "Company holiday" }],
    weekly: [hours(weekdays, "09:00", "17:00")],
  };
}

/** Rooms and people whose hours differ from the office's; the rest keep the office's. */
const ownHours: Partial<Record<DemoResourceId, ResourceAvailability>> = {
  "person-jordan": { weekly: [hours([1, 2, 3, 4], "09:00", "17:00")] },
  "person-sam": { weekly: [hours(weekdays, "08:00", "16:00")] },
  "room-cedar": { weekly: [hours([1, 2, 3, 4, 5, 6], "07:00", "22:00")] },
  "room-orchid": { weekly: [hours(weekdays, "08:00", "20:00")] },
};

/** The demo's rooms and people with their own working hours. */
export const demoResourcesWithHours: readonly DemoResource[] = demoResources.map((resource) => {
  const availability = ownHours[resource.id];
  return availability === undefined ? resource : { ...resource, availability };
});
