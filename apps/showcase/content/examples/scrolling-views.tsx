"use client";

// #region views
import {
  createCalendar,
  defineCalendarView,
  iteratePlainDates,
  scrollingTimeGridStrategy,
  type CalendarVisibleRange,
} from "@moltenship/calendar";
import { useCallback, useMemo, useRef, useState } from "react";

import { createScrollingMonthView } from "@/components/calendar/scrolling-month-view/scrolling-month-view";
import {
  createScrollingDayView,
  createScrollingWeekView,
  ScrollingTimeGridView,
} from "@/components/calendar/scrolling-time-grid-view/scrolling-time-grid-view";
import type { TimeGridViewOptions } from "@/components/calendar/time-grid-view/time-grid-view";

import { eventAdapter, weekRules, type Meeting } from "./quick-start";

const getEventColor = (meeting: Meeting) => meeting.color;

// Any number of days, swiping that many at a time: the strategy places them, and the week's
// renderer draws them.
const scrollingThreeDayView = defineCalendarView({
  defaultOptions: { dayView: "scrolling-day", getEventColor },
  name: "scrolling-3-day",
  strategy: scrollingTimeGridStrategy<TimeGridViewOptions<Meeting>, Meeting>({
    count: 3,
    kind: "days",
  }),
  Renderer: ScrollingTimeGridView<Meeting>,
});

export const Calendar = createCalendar<Meeting>()({
  eventAdapter,
  views: [
    createScrollingWeekView<Meeting>({ dayView: "scrolling-day", getEventColor }),
    scrollingThreeDayView,
    createScrollingDayView<Meeting>({ getEventColor }),
    createScrollingMonthView<Meeting>({ dayView: "scrolling-day", getEventColor }),
  ],
});
// #endregion views

// #region loading
const timeZone = "Europe/Berlin";

/** Fetches meetings for the dates the view needs, each date once, and keeps what arrived. */
export function ScrollingCalendar({
  loadMeetings,
}: {
  readonly loadMeetings: (from: Temporal.Instant, to: Temporal.Instant) => Promise<Meeting[]>;
}) {
  const [loaded, setLoaded] = useState<ReadonlyMap<string, Meeting>>(new Map());
  const requested = useRef(new Set<string>());
  const meetings = useMemo(() => [...loaded.values()], [loaded]);

  const load = useCallback(
    ({ loadRange }: CalendarVisibleRange) => {
      const missing = [...iteratePlainDates(loadRange)].filter(
        (date) => !requested.current.has(date.toString()),
      );
      if (missing.length === 0) return;
      for (const date of missing) requested.current.add(date.toString());
      const from = missing[0]!.toZonedDateTime(timeZone).toInstant();
      const to = missing.at(-1)!.add({ days: 1 }).toZonedDateTime(timeZone).toInstant();
      void loadMeetings(from, to).then((arrived) =>
        setLoaded((current) => new Map([...current, ...arrived.map((m) => [m.id, m] as const)])),
      );
    },
    [loadMeetings],
  );

  return (
    <Calendar.Root
      events={meetings}
      defaultAnchorDate={Temporal.Now.plainDateISO(timeZone)}
      onVisibleRangeChange={load}
      timeZone={timeZone}
      locale="en-US"
      weekRules={weekRules}
    >
      <Calendar.ActiveView />
    </Calendar.Root>
  );
}
// #endregion loading
