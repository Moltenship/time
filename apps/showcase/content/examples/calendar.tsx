// #region adapter
"use client";

import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
} from "@moltenship/calendar";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

export const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: () => [],
});
// #endregion adapter

// #region view
const dayView = defineCalendarView({
  name: "day",
  strategy: {
    // The visible dates: a half-open interval, so one day ends where the next begins.
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 1 })),
    navigate: (anchor, delta) => anchor.add({ days: delta }),
    getTitle: (range, { locale }) => range.start.toLocaleString(locale, { dateStyle: "full" }),
    // The snapshot holds only events that passed validation, already read through the adapter.
    project: ({ snapshot, instantRange }) => snapshot.queryTimed(instantRange),
  },
  Renderer: ({ projection, environment: { locale, timeZone } }) =>
    projection.length === 0 ? (
      <p>No meetings.</p>
    ) : (
      <ul>
        {projection.map((meeting) => (
          <li key={meeting.id}>
            {meeting.start
              .toZonedDateTimeISO(timeZone)
              .toLocaleString(locale, { hour: "numeric", minute: "2-digit" })}{" "}
            {meeting.title}
          </li>
        ))}
      </ul>
    ),
});

export const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [dayView] });
// #endregion view

// #region root
export const meetings: readonly Meeting[] = [
  {
    id: "standup",
    title: "Standup",
    start: Temporal.Instant.from("2026-10-08T07:00:00Z"),
    end: Temporal.Instant.from("2026-10-08T07:15:00Z"),
  },
  {
    id: "review",
    title: "Design review",
    start: Temporal.Instant.from("2026-10-08T13:00:00Z"),
    end: Temporal.Instant.from("2026-10-08T14:00:00Z"),
  },
];

export const weekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

export function TeamCalendar() {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-08")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      now={Temporal.Instant.from("2026-10-08T06:30:00Z")}
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
// #endregion root
