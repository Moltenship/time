import { createAgendaView } from "@registry/stylex-list-view/agenda-view";
import { createMonthView } from "@registry/stylex-month-view/month-view";
import { createResourceColumnsView } from "@registry/stylex-resource-columns-view/resource-columns-view";
import { createTimelineWeekView } from "@registry/stylex-resource-timeline-view/resource-timeline-view";
import { createScrollingAgendaView } from "@registry/stylex-scrolling-list-view/scrolling-agenda-view";
import { createScrollingMonthView } from "@registry/stylex-scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingThreeDayView,
  createScrollingWeekView,
} from "@registry/stylex-scrolling-time-grid-view/scrolling-time-grid-view";
import {
  createDayView,
  createThreeDayView,
  createWeekView,
} from "@registry/stylex-time-grid-view/time-grid-view";
import { createYearView } from "@registry/stylex-year-view/year-view";

import type { DemoOccurrence } from "../demo-model";
import type { DemoResource } from "../resources";
import { demoViewOptions as options } from "../view-options";

export const stylexDemoViews = [
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
