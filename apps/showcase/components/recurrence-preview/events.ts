import type { TeamEvent } from "@/content/examples/recurrence-calendar";

import type { CalendarEventColor } from "@registry/calendar-theme/event-colors";

const weekdays = ["MO", "TU", "WE", "TH", "FR"] as const;

/**
 * Four series and a one-off event around the visitor's week, on their wall clock: a stand-up every
 * weekday since last week, with this Wednesday's skipped and this Thursday's moved an hour later;
 * a 1:1 every other week from this Tuesday; planning on eight Mondays from last week; and a weekly
 * all-day release day. Timed events sit around the visitor's current hour, as the time grid opens
 * there.
 */
export function createRecurringPreviewEvents(now: Temporal.ZonedDateTime): readonly TeamEvent[] {
  const { timeZoneId: timeZone } = now;
  const today = now.toPlainDate();
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  // Kept between 02:00 and 19:00, so no event crosses midnight.
  const hour = Math.min(Math.max(now.hour, 2), 19);

  /** A wall time on a day of this week (`week` 0) or another, in the visitor's zone. */
  const at = (week: number, weekday: number, hours: number, minutes = 0) =>
    monday
      .add({ days: week * 7 + weekday - 1 })
      .toZonedDateTime({ plainTime: new Temporal.PlainTime(hours, minutes), timeZone })
      .toInstant();

  const timed = (
    id: string,
    title: string,
    color: CalendarEventColor,
    start: Temporal.Instant,
    minutes: number,
  ): TeamEvent => ({
    data: { color },
    end: start.add({ minutes }),
    id,
    kind: "timed",
    sourceTimeZone: timeZone,
    start,
    title,
  });

  const standup = timed("standup", "Stand-up", "blue", at(-1, 1, hour - 1), 30);

  return [
    {
      ...standup,
      recurrence: {
        exceptionDates: [at(0, 3, hour - 1)],
        rule: { byDay: weekdays.map((weekday) => ({ weekday })), frequency: "WEEKLY" },
      },
    },
    {
      ...timed("standup-moved", "Stand-up (moved)", "blue", at(0, 4, hour), 30),
      override: { recurrenceId: at(0, 4, hour - 1), seriesId: "standup" },
    },
    {
      ...timed("one-on-one", "1:1 with Sam", "purple", at(0, 2, hour + 1), 45),
      recurrence: { rule: { frequency: "WEEKLY", interval: 2 } },
    },
    {
      ...timed("planning", "Planning", "orange", at(-1, 1, hour + 1), 60),
      recurrence: { rule: { count: 8, frequency: "WEEKLY" } },
    },
    timed("offsite-prep", "Offsite prep", "green", at(0, 3, hour + 1, 30), 60),
    {
      data: { color: "teal" },
      end: monday.add({ days: -2 }),
      id: "release-day",
      kind: "all-day",
      recurrence: { rule: { byDay: [{ weekday: "FR" }], frequency: "WEEKLY" } },
      start: monday.add({ days: -3 }),
      title: "Release day",
    },
  ];
}
