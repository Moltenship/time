"use client";

import { createCalendar, defineEventAdapter } from "@moltenship/calendar";

interface Meeting {
  id: string;
  title: string;
  roomIds: string[];
  start: Temporal.Instant;
  end: Temporal.Instant;
}

export const Calendar = createCalendar<Meeting, { id: string }>()({
  eventAdapter: defineEventAdapter<Meeting>()({
    getId: (meeting) => meeting.id,
    getTitle: (meeting) => meeting.title,
    getResourceIds: (meeting) => meeting.roomIds,
    getInterval: ({ start, end }) => ({ kind: "timed", start, end }),
  }),
});
