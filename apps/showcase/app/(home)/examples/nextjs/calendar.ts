"use client";

// #region calendar
import {
  createCalendar,
  defineEventAdapter,
  minimumDurationPolicy,
  snapPolicy,
  type CalendarEventChange,
  type CalendarPolicy,
} from "@moltenship/calendar";

import type { CalendarEventColor } from "@/components/calendar/event-colors";
import { createMonthView } from "@/components/calendar/month-view/month-view";
import { createDayView, createWeekView } from "@/components/calendar/time-grid-view/time-grid-view";

export interface Meeting {
  readonly color: CalendarEventColor;
  readonly end: Temporal.Instant;
  readonly id: string;
  /** Created in this tab and not saved yet, so it has no ID from the server. */
  readonly pending?: true;
  readonly start: Temporal.Instant;
  readonly title: string;
}

export type MeetingChange = CalendarEventChange<Meeting, string, never>;

const getEventColor = (meeting: Meeting) => meeting.color;

export const Calendar = createCalendar<Meeting>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getInterval: ({ end, start }) => ({ end, kind: "timed", start }),
    getResourceIds: () => [],
    getTitle: (meeting) => meeting.title,
    // The server knows a new meeting by the ID it gives it, so it can't move until then.
    isReadOnly: (meeting) => meeting.pending === true,
  }),
  views: [
    createWeekView<Meeting>({ dayView: "day", getEventColor }),
    createDayView<Meeting>({ getEventColor }),
    createMonthView<Meeting>({ getEventColor }),
  ],
});

// Meetings always have a time, so drops on the all-day row stop here, before the server.
const timedOnly: CalendarPolicy<Meeting, string, never> = ({ proposed }) =>
  proposed === null || proposed.kind === "timed"
    ? { type: "accept" }
    : { reason: "meetings-need-a-time", type: "reject" };

export const policies = [
  timedOnly,
  snapPolicy<Meeting, string, never>({ minutes: 15 }),
  minimumDurationPolicy<Meeting, string, never>({ minutes: 15 }),
];
// #endregion calendar
