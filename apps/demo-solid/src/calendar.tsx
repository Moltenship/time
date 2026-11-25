import { defineEventAdapter, type CalendarEventInterval } from "@moltenship/calendar-core";
import { createCalendar } from "@moltenship/calendar-solid";

import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";

export interface Meeting {
  readonly id: string;
  readonly interval: CalendarEventInterval;
  /** An event nobody may change: the page's policy refuses it, for the agent and for drags. */
  readonly locked?: boolean;
  /** The repeating event it's an occurrence of (see `series.ts`). */
  readonly series?: string;
  readonly title: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => event.interval,
  getResourceIds: () => [],
  getTitle: (event) => (event.locked === true ? `${event.title} (locked)` : event.title),
});

/**
 * The registry's week, day, month and agenda (`registry/solid/time-grid-view`,
 * `registry/solid/month-view` and `registry/solid/list-view`), the files `shadcn add` installs into
 * a Solid app, run here from their source. A date in the week's header, or the month's date
 * number, opens the day.
 */
const week = createWeekView<Meeting>({ dayView: "day" });
const threeDays = createThreeDayView<Meeting>({ dayView: "day" });
const day = createDayView<Meeting>();
const month = createMonthView<Meeting>();
const agenda = createAgendaView<Meeting>({ weeks: 2 });

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: adapter,
  views: [month, week, threeDays, day, agenda],
});

export type View = (typeof Calendar.views)[number]["name"];
