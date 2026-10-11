import { iteratePlainDates, type CalendarVisibleRange } from "@moltenship/calendar";
import { useCallback, useRef, useState } from "react";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

import type { PreviewEvent } from "./events";

/** How far either way of today the sample calendar has events. */
const REACH = { years: 1 };
/** How long the pretend server takes, so the agenda's loading state shows. */
const LATENCY_MS = 600;

/** One-off plans, one each weekday, picked in turn. */
const plans: readonly [CalendarEventColor, string, string, Temporal.DurationLike][] = [
  ["orange", "Design review", "10:00", { hours: 1, minutes: 30 }],
  ["gray", "Lunch with Sam", "12:30", { hours: 1 }],
  ["orange", "Customer call", "14:00", { minutes: 30 }],
  ["gray", "Dentist", "16:00", { minutes: 45 }],
  ["orange", "Sprint planning", "13:00", { hours: 1, minutes: 30 }],
  ["gray", "Book club", "19:00", { hours: 2 }],
  ["orange", "Release retro", "15:00", { hours: 1 }],
];

/**
 * The sample calendar's events on `date`, the same whenever it's asked: weekday standups, runs and
 * yoga, a plan most days, weekend brunches, and now and then a holiday.
 */
function eventsOn(date: Temporal.PlainDate, timeZone: string): PreviewEvent[] {
  const day = Temporal.PlainDate.from("1970-01-01").until(date).days;
  const events: PreviewEvent[] = [];
  const timed = (
    color: CalendarEventColor,
    title: string,
    time: string,
    duration: Temporal.DurationLike,
  ) => {
    const start = date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone });
    events.push({
      color,
      end: start.add(duration).toInstant(),
      id: `${date.toString()}-${events.length}`,
      kind: "timed",
      start: start.toInstant(),
      title,
    });
  };

  if (day % 45 === 0) {
    events.push({
      color: "orange",
      end: date.add({ days: 1 }),
      id: `${date.toString()}-holiday`,
      kind: "all-day",
      start: date,
      title: "Holiday",
    });
  }
  if (date.dayOfWeek <= 5) {
    if (date.dayOfWeek % 2 === 1) timed("gray", "Morning run", "07:00", { minutes: 45 });
    timed("gray", "Standup", "09:30", { minutes: 15 });
    const [color, title, time, duration] = plans[day % plans.length]!;
    timed(color, title, time, duration);
    if (date.dayOfWeek % 2 === 0) timed("gray", "Yoga", "18:30", { hours: 1 });
  } else {
    timed("gray", date.dayOfWeek === 6 ? "Farmers market" : "Brunch", "10:00", { hours: 1 });
  }
  return events;
}

/**
 * A year of sample events either way of `now`, fetched from a pretend server for the dates the
 * calendar reports as it scrolls, each date once.
 */
export function useLongRangeEvents(now: Temporal.ZonedDateTime) {
  const [events, setEvents] = useState<readonly PreviewEvent[]>([]);
  const [fetching, setFetching] = useState(0);
  const requested = useRef(new Set<string>());

  const load = useCallback(
    ({ loadRange }: CalendarVisibleRange) => {
      const missing = [...iteratePlainDates(loadRange)].filter(
        (date) => !requested.current.has(date.toString()),
      );
      if (missing.length === 0) return;
      for (const date of missing) requested.current.add(date.toString());
      const today = now.toPlainDate();
      const first = today.subtract(REACH);
      const last = today.add(REACH);
      const arriving = missing
        .filter(
          (date) =>
            Temporal.PlainDate.compare(first, date) <= 0 &&
            Temporal.PlainDate.compare(date, last) <= 0,
        )
        .flatMap((date) => eventsOn(date, now.timeZoneId));
      setFetching((count) => count + 1);
      setTimeout(() => {
        setEvents((current) => [...current, ...arriving]);
        setFetching((count) => count - 1);
      }, LATENCY_MS);
    },
    [now],
  );

  return { events, load, loading: fetching > 0, setEvents };
}
