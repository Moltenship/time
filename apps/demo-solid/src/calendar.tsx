import {
  defineEventAdapter,
  type CalendarEventInterval,
  type CalendarResource,
} from "@moltenship/calendar-core";
import { createCalendar } from "@moltenship/calendar-solid";

import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/time-grid-view/time-grid-view";
import { createScrollingAgendaView } from "@registry/scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/scrolling-month-view/scrolling-month-view";
import { createYearView } from "@registry/year-view/year-view";

import type { DemoResourceData } from "./resources";

export interface Meeting {
  readonly id: string;
  readonly interval: CalendarEventInterval;
  /** An event nobody may change: the page's policy refuses it, for the agent and for drags. */
  readonly locked?: boolean;
  /** The rooms and people it books, which the resource columns show it in. */
  readonly resourceIds?: readonly string[];
  /** The repeating event it's an occurrence of (see `series.ts`). */
  readonly series?: string;
  readonly title: string;
}

const adapter = defineEventAdapter<Meeting>()({
  getId: (event) => event.id,
  getInterval: (event) => event.interval,
  getResourceIds: (event) => event.resourceIds ?? [],
  getTitle: (event) => (event.locked === true ? `${event.title} (locked)` : event.title),
});

/**
 * The registry's week, day, month, year, agenda and resource columns
 * (`registry/solid/time-grid-view`, `registry/solid/month-view`, `registry/solid/year-view`,
 * `registry/solid/list-view` and `registry/solid/resource-columns-view`), the files `shadcn add`
 * installs into a Solid app, run here from their source, and the scrolling month and agenda
 * (`scrolling-month-view` and `scrolling-list-view`), which the page's setting switches to. A date
 * in the week's header, the month's date number, or a date in the year's popover opens the day.
 */
const week = createWeekView<Meeting>({ dayView: "day" });
const threeDays = createThreeDayView<Meeting>({ dayView: "day" });
const day = createDayView<Meeting>();
const month = createMonthView<Meeting>();
const year = createYearView<Meeting>();
const agenda = createAgendaView<Meeting>({ weeks: 2 });
const scrollingMonth = createScrollingMonthView<Meeting>();
const scrollingAgenda = createScrollingAgendaView<Meeting>();
const resources = createResourceColumnsView<Meeting, CalendarResource<DemoResourceData>>({
  resourceStatus: true,
});

export const Calendar = createCalendar<Meeting, CalendarResource<DemoResourceData>>()({
  eventAdapter: adapter,
  views: [month, year, week, threeDays, day, agenda, scrollingMonth, scrollingAgenda, resources],
});

export type View = (typeof Calendar.views)[number]["name"];
