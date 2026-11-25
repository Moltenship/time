import { createCalendar } from "@moltenship/calendar-solid";

import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingThreeDayView,
  createScrollingWeekView,
} from "@registry/scrolling-time-grid-view/scrolling-time-grid-view";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";
import { createYearView } from "@registry/year-view/year-view";

import { getCalendarColor } from "@demo/calendars";
import { demoOccurrenceAdapter, type DemoOccurrence } from "@demo/demo-model";
import type { DemoResource } from "@demo/resources";
import { describeDemoEvent } from "@demo/view-choices";

import { RepeatIcon } from "./icons";

/** What every view is created with, as in the React demo (apps/demo/src/view-options.tsx). */
const options = {
  describeEvent: describeDemoEvent,
  getEventColor: ({ event }: DemoOccurrence) => getCalendarColor(event.calendarId),
  getEventIcon: ({ recurrence }: DemoOccurrence) =>
    recurrence === undefined ? null : <RepeatIcon />,
};

/**
 * The calendar and its views: the Solid registry's items, the files `shadcn add` installs into a
 * Solid app, run here from their source. A view registers here alone, under the React demo's name
 * for it (`demoViewNames` in apps/demo/src/demo-model.ts): the switcher, the shortcuts and the URL
 * offer the views this list has.
 */
export const Calendar = createCalendar<DemoOccurrence, DemoResource>()({
  eventAdapter: demoOccurrenceAdapter,
  views: [
    createWeekView<DemoOccurrence>({ ...options, dayView: "day" }),
    createDayView<DemoOccurrence>(options),
    createThreeDayView<DemoOccurrence>({ ...options, dayView: "day" }),
    createMonthView<DemoOccurrence>(options),
    createYearView<DemoOccurrence>(options),
    createAgendaView<DemoOccurrence>(options),
    createResourceColumnsView<DemoOccurrence, DemoResource>({ ...options, resourceStatus: true }),
    // The same days, week, month and agenda, scrolling: the "scrolling views" setting switches
    // between them and the paged ones, as in the React demo.
    createScrollingWeekView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
    createScrollingDayView<DemoOccurrence>(options),
    createScrollingThreeDayView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
    createScrollingMonthView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
    createScrollingAgendaView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  ],
});

export type SolidView = (typeof Calendar.views)[number]["name"];
