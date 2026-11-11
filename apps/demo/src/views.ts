import { createAgendaView } from "@registry/list-view/agenda-view";
import { createMonthView } from "@registry/month-view/month-view";
import { createResourceColumnsView } from "@registry/resource-columns-view/resource-columns-view";
import { createTimelineWeekView } from "@registry/resource-timeline-view/resource-timeline-view";
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

import type { DemoOccurrence } from "./demo-model";
import type { DemoResource } from "./resources";
import { demoViewOptions as options } from "./view-options";

export const demoViews = [
  createWeekView<DemoOccurrence>({ ...options, dayView: "day" }),
  createDayView<DemoOccurrence>(options),
  createThreeDayView<DemoOccurrence>({ ...options, dayView: "day" }),
  createMonthView<DemoOccurrence>(options),
  createYearView<DemoOccurrence>(options),
  createAgendaView<DemoOccurrence>(options),
  createResourceColumnsView<DemoOccurrence, DemoResource>({ ...options, resourceStatus: true }),
  createTimelineWeekView<DemoOccurrence>({ ...options, resourceStatus: true }),
  // The same day, 3 days, week, month, and agenda, scrolling continuously; settings switch between
  // the sets.
  createScrollingWeekView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  createScrollingDayView<DemoOccurrence>(options),
  createScrollingThreeDayView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  createScrollingMonthView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
  createScrollingAgendaView<DemoOccurrence>({ ...options, dayView: "scrolling-day" }),
] as const;
