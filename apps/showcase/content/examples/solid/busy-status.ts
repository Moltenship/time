// #region status
import {
  availabilityAt,
  busyAt,
  type AvailabilitySnapshot,
  type EventSnapshot,
} from "@moltenship/calendar-solid";

import type { Appointment } from "./schedule";

// A view gets `events`, the root's event snapshot, in its props. `availability` is what
// `useCalendarAvailability()` returns.
export function statusOfMaya(
  availability: AvailabilitySnapshot,
  events: EventSnapshot<Appointment, string, string>,
  now: Temporal.Instant,
) {
  const hours = availabilityAt(availability, now, "maya");
  // { available: true, closesAt: Temporal.Instant }
  // { available: false, reason: "outside-hours" | "closed-day" | "exception", label?, opensAt }

  const busy = busyAt(events, now, { resourceId: "maya", timeZone: "Europe/Berlin" });
  // { busy: true, events: [...], freeAt: Temporal.Instant }
  // { busy: false, nextEventAt: Temporal.Instant | null }

  return { hours, busy };
}
// #endregion status
