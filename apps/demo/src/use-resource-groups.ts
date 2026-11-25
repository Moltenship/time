import {
  useBusyResources,
  useCalendarAvailability,
  type CalendarEventInterval,
} from "@moltenship/calendar";

import { resourceGroups } from "./resource-groups";

/** `resourceGroups` at the event's time, from the calendar's events and availability. */
export function useResourceGroups(interval: CalendarEventInterval | null, eventId?: string) {
  return resourceGroups(
    useBusyResources(interval, { exclude: eventId }),
    useCalendarAvailability(),
    interval,
  );
}
