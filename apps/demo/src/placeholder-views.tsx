import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";

import type { DemoEvent } from "./calendar";
import { getCalendarColor } from "./calendars";

const options = {
  getEventColor: (event: DemoEvent): CalendarEventColor => getCalendarColor(event.calendarId),
};

export const demoViews = [
  createWeekView<DemoEvent>({ ...options, dayView: "day" }),
  createDayView<DemoEvent>(options),
  createMonthView<DemoEvent>(options),
  createAgendaView<DemoEvent>(options),
] as const;
