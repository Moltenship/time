import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

import type { DemoCalendarId } from "./calendars";
import { demoViews } from "./placeholder-views";
import type { DemoResource, DemoResourceId } from "./resources";

interface DemoEventBase {
  readonly calendarId: DemoCalendarId;
  readonly description?: string;
  readonly id: string;
  /** Rooms and people the event books; left out when it books none. */
  readonly resourceIds?: readonly DemoResourceId[];
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

const noResourceIds: readonly DemoResourceId[] = [];

export const DemoCalendar = createCalendar<DemoEvent, DemoResource>()({
  eventAdapter: defineEventAdapter<DemoEvent>()({
    getId: (event) => event.id,
    getInterval: (event) => event,
    getResourceIds: (event) => event.resourceIds ?? noResourceIds,
    getTitle: (event) => event.title,
  }),
  views: demoViews,
});

export type DemoView = (typeof DemoCalendar.views)[number]["name"];
