// #region calendar
"use client";

import { createCalendar } from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  type RecurrenceOccurrence,
  type RecurringCalendarEvent,
} from "@moltenship/calendar-recurrence";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

export interface TeamEventData {
  readonly color: CalendarEventColor;
}

/**
 * A series' master has a `recurrence`, an event that replaces one of its occurrences has an
 * `override`, and any other event happens once.
 */
export type TeamEvent = RecurringCalendarEvent<TeamEventData>;

/** What the calendar shows: one occurrence of a series, or a one-off event. */
export type TeamOccurrence = RecurrenceOccurrence<TeamEvent, string>;

export const adapters = createCanonicalRecurrenceAdapter<TeamEventData>();

export const Calendar = createCalendar<TeamOccurrence>()({
  // Occurrences are the calendar's events. It reads their titles through your adapter.
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [
    createWeekView<TeamOccurrence>({
      getEventColor: (occurrence) => occurrence.event.data.color,
    }),
  ],
});
// #endregion calendar
