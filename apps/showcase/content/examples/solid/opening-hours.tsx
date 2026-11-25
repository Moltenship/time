// Availability's first calendar: the Month page's calendar with working hours, a policy that
// warns, and its announcements in view.

// #region hours
import { availabilityPolicy, type CalendarAvailability } from "@moltenship/calendar-solid";
import { createSignal } from "solid-js";

import { applyChange, seed } from "./month-events";
import { Calendar, type Event } from "./month-page";
import { Spoken } from "./spoken";

const time = (value: string) => Temporal.PlainTime.from(value);

const openingHours: CalendarAvailability = {
  weekly: [{ days: [1, 2, 3, 4, 5], start: time("09:00"), end: time("17:00") }],
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-16"), label: "Company day" }],
};

// "warn" saves a change outside the hours and says so; "block" refuses it.
const policies = [availabilityPolicy<Event, string, string>({ mode: "warn" })];

export default function OpeningHoursPage() {
  const [events, setEvents] = createSignal(seed);
  return (
    <Calendar.Root
      availability={openingHours}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="UTC"
      defaultView="month"
      events={events()}
      locale="en-US"
      onEventChange={(change) => {
        setEvents((current) => applyChange(current, change));
      }}
      policies={policies}
      weekRules={{ firstDay: 7, minimalDays: 1, weekend: [6, 7] }}
    >
      <Calendar.Frame class="flex h-dvh flex-col">
        <Calendar.Viewport class="min-h-0 flex-1">
          <Calendar.ActiveView />
        </Calendar.Viewport>
        <Spoken />
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion hours
