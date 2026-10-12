import type { ApiEvent } from "@/content/examples/query-api";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

/** How far either way of today the pretend server has events. */
const REACH = { months: 6 };

/** One plan each weekday, picked in turn. */
const plans: readonly [CalendarEventColor, string, string, Temporal.DurationLike][] = [
  ["purple", "Design review", "11:00", { hours: 1, minutes: 30 }],
  ["orange", "Lunch with Sam", "12:30", { hours: 1 }],
  ["teal", "Customer call", "14:00", { minutes: 45 }],
  ["green", "Sprint planning", "13:00", { hours: 1, minutes: 30 }],
  ["pink", "Book club", "17:00", { hours: 1, minutes: 30 }],
  ["orange", "Release retro", "15:00", { hours: 1 }],
];

/**
 * The pretend server's events, the same for the same day: a stand-up and a plan each weekday, a
 * weekend brunch, and things that cross the edges of the dates a calendar loads. A month-end close
 * runs from a month's last two days into the next, and every fourth week a trip runs from Friday
 * afternoon into Monday.
 */
export function createSampleEvents(today: Temporal.PlainDate, timeZone: string): ApiEvent[] {
  const events: ApiEvent[] = [];
  const at = (date: Temporal.PlainDate, time: string) =>
    date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone }).toInstant();
  const timed = (
    id: string,
    color: CalendarEventColor,
    title: string,
    start: Temporal.Instant,
    end: Temporal.Instant,
  ) =>
    events.push({
      allDay: false,
      color,
      end: end.toString(),
      id,
      start: start.toString(),
      title,
      version: 1,
    });

  const first = today.subtract(REACH);
  const last = today.add(REACH);
  for (let date = first; Temporal.PlainDate.compare(date, last) < 0; date = date.add({ days: 1 })) {
    const day = first.until(date).days;
    const key = date.toString();
    if (date.dayOfWeek <= 5) {
      timed(`${key}-standup`, "blue", "Stand-up", at(date, "09:30"), at(date, "09:45"));
      const [color, title, time, duration] = plans[day % plans.length]!;
      const start = at(date, time);
      timed(`${key}-plan`, color, title, start, start.add(duration));
    } else {
      timed(`${key}-brunch`, "gray", "Brunch", at(date, "10:30"), at(date, "12:00"));
    }
    if (date.dayOfWeek === 5 && date.weekOfYear! % 4 === 0) {
      timed(
        `${key}-trip`,
        "red",
        "Trip to the Lisbon office",
        at(date, "16:00"),
        at(date.add({ days: 3 }), "11:00"),
      );
    }
    if (date.day === date.daysInMonth - 1) {
      events.push({
        allDay: true,
        color: "yellow",
        end: date.add({ days: 4 }).toString(),
        id: `${key}-close`,
        start: date.toString(),
        title: "Month-end close",
        version: 1,
      });
    }
  }
  return events;
}
