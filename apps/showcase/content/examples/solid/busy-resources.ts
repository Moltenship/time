// #region busy
import {
  busyResources,
  type EventSnapshot,
  type InstantInterval,
} from "@moltenship/calendar-solid";

import type { Appointment } from "./schedule";

export function whoIsBusy(
  events: EventSnapshot<Appointment, string, string>,
  range: InstantInterval,
) {
  const busy = busyResources(events, range, {
    exclude: "evt_42", // the event being moved, if any
    resourceIds: ["orchid", "lotus", "maya"], // or leave out for every resource
    timeZone: "Europe/Berlin", // for all-day and floating events
  });

  busy.get("maya"); // [standup, review]: the events that make Maya busy then
  busy.has("lotus"); // false: free resources are absent
  return busy;
}
// #endregion busy
