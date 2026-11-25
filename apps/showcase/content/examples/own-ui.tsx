"use client";

import {
  createCalendar,
  defineCalendarView,
  defineEventAdapter,
  plainDateInterval,
  type CalendarViewProjectionInput,
} from "@moltenship/calendar";

export interface Meeting {
  readonly id: string;
  readonly title: string;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
}

const eventAdapter = defineEventAdapter<Meeting>()({
  getId: (meeting) => meeting.id,
  getTitle: (meeting) => meeting.title,
  getInterval: (meeting) => ({ kind: "timed", start: meeting.start, end: meeting.end }),
  getResourceIds: () => [],
});

// #region ui
// The strategy picks the dates and the meetings. The Renderer is your markup.
const weekView = defineCalendarView({
  name: "week",
  strategy: {
    getRange: (anchor) => plainDateInterval(anchor, anchor.add({ days: 7 })),
    navigate: (anchor, delta) => anchor.add({ weeks: delta }),
    getTitle: (range, { locale }) => range.start.toLocaleString(locale, { dateStyle: "medium" }),
    project: ({ snapshot, instantRange }: CalendarViewProjectionInput<undefined, Meeting>) =>
      snapshot.queryTimed(instantRange),
  },
  Renderer: ({ projection, environment }) => (
    <ul className="meeting-list">
      {projection.map(({ event }) => (
        <li key={event.id}>
          <time dateTime={event.start.toString()}>
            {event.start.toLocaleString(environment.locale, {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: environment.timeZone,
            })}
          </time>{" "}
          {event.title}
        </li>
      ))}
    </ul>
  ),
});

export const Calendar = createCalendar<Meeting>()({ eventAdapter, views: [weekView] });

function Toolbar() {
  const { navigateToday } = Calendar.useCalendarActions();

  return (
    <Calendar.Toolbar className="toolbar">
      {/* A control of your own calls an action. */}
      <button
        className="button"
        type="button"
        onClick={(event) => navigateToday({ event: event.nativeEvent })}
      >
        Today
      </button>
      {/* The calendar's triggers are plain buttons that take your classes. */}
      <Calendar.PreviousTrigger className="button">Previous</Calendar.PreviousTrigger>
      <Calendar.NextTrigger className="button">Next</Calendar.NextTrigger>
      <Calendar.Title className="title" />
    </Calendar.Toolbar>
  );
}

export function MeetingCalendar({ meetings }: { readonly meetings: readonly Meeting[] }) {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-05")}
      defaultTimeZone="Europe/Berlin"
      label="Team meetings"
      locale="en-US"
      weekRules={{ firstDay: 1, minimalDays: 4, weekend: [6, 7] }}
    >
      <Calendar.Frame className="calendar">
        <Toolbar />
        <Calendar.Viewport>
          <Calendar.ActiveView />
        </Calendar.Viewport>
      </Calendar.Frame>
    </Calendar.Root>
  );
}
// #endregion ui
