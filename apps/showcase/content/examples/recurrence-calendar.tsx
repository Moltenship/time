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

/** Lucide's "repeat" icon, for the chips of repeating events. */
const repeatIcon = (
  <svg
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    viewBox="0 0 24 24"
  >
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
    <path d="m7 22-4-4 4-4" />
    <path d="M21 13v1a4 4 0 0 1-4 4H3" />
  </svg>
);

export const Calendar = createCalendar<TeamOccurrence>()({
  // Occurrences are the calendar's events. It reads their titles through your adapter.
  eventAdapter: createOccurrenceAdapter(adapters.event),
  views: [
    createWeekView<TeamOccurrence>({
      // The icon marks a repeating event on screen, and the description says so to screen readers.
      describeEvent: (occurrence) => (occurrence.recurrence ? "repeating event" : undefined),
      getEventColor: (occurrence) => occurrence.event.data.color,
      getEventIcon: (occurrence) => (occurrence.recurrence ? repeatIcon : null),
    }),
  ],
});
// #endregion calendar
