// #region hours
import { availabilityPolicy, type CalendarAvailability } from "@moltenship/calendar-solid";

import { weekRules } from "./app";
import { Schedule, type Appointment } from "./schedule";
import { resources } from "./schedule-resources";

const time = (value: string) => Temporal.PlainTime.from(value);

const officeHours: CalendarAvailability = {
  weekly: [{ days: [1, 2, 3, 4, 5], start: time("09:00"), end: time("17:00") }],
  exceptions: [
    { date: Temporal.PlainDate.from("2026-12-25"), label: "Christmas" },
    {
      date: Temporal.PlainDate.from("2026-12-24"),
      hours: [{ start: time("09:00"), end: time("12:00") }],
    },
  ],
};

const policies = [availabilityPolicy<Appointment, string, string>({ mode: "warn" })];

export function Office(props: { appointments: readonly Appointment[] }) {
  return (
    <Schedule.Root
      label="Office"
      events={props.appointments}
      resources={resources}
      availability={officeHours}
      policies={policies}
      defaultAnchorDate={Temporal.PlainDate.from("2026-12-21")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
    >
      <Schedule.ActiveView />
    </Schedule.Root>
  );
}
// #endregion hours
