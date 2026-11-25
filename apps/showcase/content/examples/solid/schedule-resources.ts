// #region resources
import type { AvailabilityRule, CalendarResource } from "@moltenship/calendar-solid";

import type { Member } from "./schedule";

const weekdays = (start: string, end: string): AvailabilityRule => ({
  days: [1, 2, 3, 4, 5],
  start: Temporal.PlainTime.from(start),
  end: Temporal.PlainTime.from(end),
});

const room: Member = { kind: "room" };
const person: Member = { kind: "person" };

export const resources: readonly CalendarResource<Member>[] = [
  {
    id: "orchid",
    title: "Orchid",
    data: room,
    availability: { weekly: [weekdays("08:00", "20:00")] },
  },
  { id: "alex", title: "Alex", data: person, timeZone: "America/Los_Angeles" },
  { id: "lee", title: "Lee", data: person, timeZone: "Asia/Kolkata" },
];
// #endregion resources
