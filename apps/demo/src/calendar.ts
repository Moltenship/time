import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

import type { DemoCalendarId } from "./calendars";
import { demoViews } from "./placeholder-views";

interface DemoEventBase {
  readonly calendarId: DemoCalendarId;
  readonly description?: string;
  readonly id: string;
  readonly title: string;
}

export type DemoEvent = DemoEventBase &
  (
    | { readonly end: Temporal.Instant; readonly kind: "timed"; readonly start: Temporal.Instant }
    | {
        readonly end: Temporal.PlainDate;
        readonly kind: "all-day";
        readonly start: Temporal.PlainDate;
      }
  );

const noResourceIds: readonly never[] = [];

export const DemoCalendar = createCalendar<DemoEvent, never>()({
  eventAdapter: defineEventAdapter<DemoEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: () => noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: demoViews,
});

export type DemoView = (typeof DemoCalendar.views)[number]["name"];
