import { createCalendar } from "@moltenship/calendar-solid";

import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
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
    createScrollingMonthView<DemoOccurrence>({ ...options, dayView: "day" }),
    createScrollingAgendaView<DemoOccurrence>({ ...options, dayView: "day" }),
  ],
});

export type SolidView = (typeof Calendar.views)[number]["name"];
