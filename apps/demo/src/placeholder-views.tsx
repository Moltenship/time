import { RepeatIcon } from "lucide-react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";
import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineWeekView } from "@registry/resource-timeline-view/resource-timeline-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import { createDayView, createWeekView } from "@registry/time-grid-view/time-grid-view";
import { createYearView } from "@registry/year-view/year-view";

import type { DemoOccurrence } from "./calendar";
import { demoCalendars, getCalendarColor } from "./calendars";

/** One element for every repeating event's chip; the views hide it from assistive technology. */
const repeatIcon = <RepeatIcon />;

const options = {
  // Read after each event's title and time:
  // "Standup, Thursday, October 8, 9:30 – 9:45 AM, Work calendar, repeating event".
  describeEvent: ({ event, recurrence }: DemoOccurrence) =>
    [
      `${demoCalendars.find(({ id }) => id === event.calendarId)?.name ?? "Unknown"} calendar`,
      ...(recurrence === undefined ? [] : ["repeating event"]),
    ].join(", "),
  getEventColor: ({ event }: DemoOccurrence): CalendarEventColor =>
    getCalendarColor(event.calendarId),
  // The mark the description above puts in words.
  getEventIcon: ({ recurrence }: DemoOccurrence) => (recurrence === undefined ? null : repeatIcon),
};

export const demoViews = [
  createWeekView<DemoOccurrence>({ ...options, dayView: "day" }),
  createDayView<DemoOccurrence>(options),
  createMonthView<DemoOccurrence>(options),
  createYearView<DemoOccurrence>(options),
  createAgendaView<DemoOccurrence>(options),
  createResourceColumnsView<DemoOccurrence>({ ...options, resourceStatus: true }),
  createTimelineWeekView<DemoOccurrence>({ ...options, resourceStatus: true }),
  // The same day, week, month, and agenda, scrolling continuously; settings switch between the sets.
  createScrollingWeekView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  createScrollingDayView<DemoOccurrence>(options),
  createScrollingMonthView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  createScrollingAgendaView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
] as const;
