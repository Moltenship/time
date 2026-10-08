// #region client
// app/calendar/team-calendar.tsx
"use client";

import { useMemo } from "react";

import { Calendar, weekRules, type Meeting } from "./calendar";

export interface MeetingJson {
  readonly id: string;
  readonly title: string;
  readonly start: string;
  readonly end: string;
}

interface TeamCalendarProps {
  readonly meetings: readonly MeetingJson[];
  readonly now: string;
  readonly timeZone: string;
}

export function TeamCalendar({ meetings, now, timeZone }: TeamCalendarProps) {
  const events = useMemo(
    () =>
      meetings.map(
        (meeting): Meeting => ({
          ...meeting,
          start: Temporal.Instant.from(meeting.start),
          end: Temporal.Instant.from(meeting.end),
        }),
      ),
    [meetings],
  );
  const nowInstant = Temporal.Instant.from(now);

  return (
    <Calendar.Root
      events={events}
      now={nowInstant}
      defaultAnchorDate={nowInstant.toZonedDateTimeISO(timeZone).toPlainDate()}
      defaultTimeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.Frame>
        <Calendar.Toolbar>
          <Calendar.PreviousTrigger>Previous</Calendar.PreviousTrigger>
          <Calendar.TodayTrigger>Today</Calendar.TodayTrigger>
          <Calendar.NextTrigger>Next</Calendar.NextTrigger>
          <Calendar.Title />
        </Calendar.Toolbar>
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion client
