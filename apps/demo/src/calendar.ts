import { createCalendar, defineEventAdapter } from "@moltenship/calendar";
import {
  createOccurrenceAdapter,
  type EventRecurrence,
  type RecurrenceAdapters,
  type RecurrenceOccurrence,
  type RecurrenceOverride,
} from "@moltenship/calendar-recurrence";

import type { DemoCalendarId } from "./calendars";
import { demoViews } from "./placeholder-views";
import type { DemoResource, DemoResourceId } from "./resources";

interface DemoEventBase {
  readonly calendarId: DemoCalendarId;
  readonly description?: string;
  readonly id: string;
  /** Made around the present on each visit, not stored, so it can't be changed; see `busyNowEvents`. */
  readonly live?: true;
  /** Set on an event that replaces one occurrence of a series, as RECURRENCE-ID does. */
  readonly override?: RecurrenceOverride<string>;
  /** Set on a series' first event: how it repeats. */
  readonly recurrence?: EventRecurrence;
  /** Rooms and people the event books; left out when it books none. */
  readonly resourceIds?: readonly DemoResourceId[];
  readonly title: string;
}

export type DemoEvent = DemoEventBase &
  (
    | {
        readonly end: Temporal.Instant;
        readonly kind: "timed";
        /** The zone a series repeats in, so its wall time holds across DST. */
        readonly sourceTimeZone?: string;
        readonly start: Temporal.Instant;
      }
    | {
        readonly end: Temporal.PlainDate;
        readonly kind: "all-day";
        readonly start: Temporal.PlainDate;
      }
  );

/** What the calendar shows: an occurrence of a series, or a one-off event passed through. */
export type DemoOccurrence = RecurrenceOccurrence<DemoEvent, string>;

const noResourceIds: readonly DemoResourceId[] = [];

export const demoEventAdapter = defineEventAdapter<DemoEvent>()({
  getId: (event) => event.id,
  getInterval: (event) => event,
  getResourceIds: (event) => event.resourceIds ?? noResourceIds,
  getTitle: (event) => event.title,
  isReadOnly: (event) => event.live === true,
});

/** The stored events' two adapters: the calendar's, and the one that reads their recurrence. */
export const demoAdapters: RecurrenceAdapters<DemoEvent, string, DemoResourceId> = {
  event: demoEventAdapter,
  recurrence: {
    getOverride: (event) => event.override,
    getRecurrence: (event) => event.recurrence,
  },
};

/** The calendar takes occurrences, which the app expands from its events for the dates shown. */
export const DemoCalendar = createCalendar<DemoOccurrence, DemoResource>()({
  eventAdapter: createOccurrenceAdapter(demoEventAdapter),
  views: demoViews,
});

export type DemoView = (typeof DemoCalendar.views)[number]["name"];
