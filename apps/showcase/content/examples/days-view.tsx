"use client";

// #region view
import {
  createCalendar,
  defineCalendarView,
  iteratePlainDates,
  plainDateInterval,
  zonedDayRange,
} from "@moltenship/calendar";

import { eventAdapter, meetings, weekRules, type Meeting } from "./calendar";

export const daysView = defineCalendarView({
  name: "days",
  defaultOptions: { days: 3 },
  strategy: {
    getRange: (anchor, _environment, { days }) => plainDateInterval(anchor, anchor.add({ days })),
    navigate: (anchor, delta, { days }) => anchor.add({ days: delta * days }),
    getTitle: (range, { locale }) =>
      new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).formatRange(
        range.start,
        range.end.subtract({ days: 1 }),
      ),
    project: ({ snapshot, range, environment }) =>
      Array.from(iteratePlainDates(range), (date) => {
        const day = zonedDayRange(date, environment.timeZone);
        return { date, events: day.interval ? snapshot.queryTimed(day.interval) : [] };
      }),
  },
  Renderer: ({ projection, actions }) => (
    <ol>
      {projection.map(({ date, events }) => (
        <li key={date.toString()}>
          <button type="button" onClick={() => actions.setAnchorDate(date)}>
            {date.toString()}
          </button>{" "}
          {events.length} meetings
        </li>
      ))}
    </ol>
  ),
});
// #endregion view

// #region root
export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [daysView],
});

export function WorkWeek() {
  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.PlainDate.from("2026-10-05")}
      defaultTimeZone="Europe/Berlin"
      locale="en-US"
      weekRules={weekRules}
      viewOptions={{ days: { days: 5 } }}
    >
      <Calendar.Title />
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion root

// #region hooks
export function VisibleRange() {
  const range = Calendar.useVisibleRange();
  if (range === null) return null;
  return (
    <p>
      {range.start.toString()} to {range.end.subtract({ days: 1 }).toString()}
    </p>
  );
}
// #endregion hooks
