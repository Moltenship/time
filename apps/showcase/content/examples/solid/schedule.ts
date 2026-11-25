// #region calendar
import {
  createCalendar,
  defineEventAdapter,
  type CalendarEventInterval,
  type CalendarResource,
} from "@moltenship/calendar-solid";

export interface Appointment {
  readonly id: string;
  readonly title: string;
  readonly interval: CalendarEventInterval;
  readonly attendeeIds: readonly string[];
  readonly calendarId: string;
  readonly showAs?: "busy" | "tentative";
}

export interface Member {
  readonly kind: "person" | "room";
}

const eventAdapter = defineEventAdapter<Appointment>()({
  getId: (appointment) => appointment.id,
  getTitle: (appointment) => appointment.title,
  getInterval: (appointment) => appointment.interval,
  getResourceIds: (appointment) => appointment.attendeeIds,
  // Focus time and tentative meetings leave you bookable; all-day ones block when marked busy.
  isBusy: (appointment) =>
    appointment.title !== "Focus time" &&
    appointment.showAs !== "tentative" &&
    (appointment.interval.kind !== "all-day" || appointment.showAs === "busy"),
});

export const Schedule = createCalendar<Appointment, CalendarResource<Member>>()({ eventAdapter });
// #endregion calendar
