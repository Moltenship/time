import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineWeekView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";

import type { DemoEvent } from "./calendar";
import { demoCalendars, getCalendarColor } from "./calendars";

const options = {
  // Read after each event's title and time: "Standup, Thursday, October 8, 9:00 – 9:15 AM, Work calendar".
  describeEvent: (event: DemoEvent) =>
    `${demoCalendars.find(({ id }) => id === event.calendarId)?.name ?? "Unknown"} calendar`,
  getEventColor: (event: DemoEvent): CalendarEventColor => getCalendarColor(event.calendarId),
};

export const demoViews = [
  createWeekView<DemoEvent>({ ...options, dayView: "day" }),
  createDayView<DemoEvent>(options),
  createMonthView<DemoEvent>(options),
  createAgendaView<DemoEvent>(options),
  createResourceColumnsView<DemoEvent>(options),
  createTimelineWeekView<DemoEvent>(options),
] as const;
