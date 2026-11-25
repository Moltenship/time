import type { CalendarAvailability, CalendarEvent } from "@moltenship/calendar";

import {
  calendarEventColors,
  type CalendarEventColor,
} from "@registry/shared/calendar-theme/event-colors";

/*
 * One month for React's and Solid's browser files (ADR 0279): the same events, hours and closed
 * day, so `view-twins/` compares what the two month views render, and both files drag the same
 * events.
 */

export type MonthFixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

export const monthAnchor = Temporal.PlainDate.from("2026-10-08");
export const monthNow = Temporal.Instant.from("2026-10-08T10:20:00Z");
export const monthWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

/** Weekdays 09:00 to 17:00; a closed Friday mutes its day. */
export const monthAvailability: CalendarAvailability = {
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};

const firstMeeting = Temporal.Instant.from("2026-10-08T08:00:00Z");
const firstCall = Temporal.Instant.from("2026-10-05T15:00:00Z");

function timed(color: CalendarEventColor, title: string, start: Temporal.Instant, minutes: number) {
  const end = start.add({ minutes });
  return { data: { color }, end, id: title, kind: "timed", start, title } as const;
}

function allDay(color: CalendarEventColor, title: string, start: string, end: string) {
  return {
    data: { color },
    end: Temporal.PlainDate.from(end),
    id: title,
    kind: "all-day",
    start: Temporal.PlainDate.from(start),
    title,
  } as const;
}

/**
 * Every palette colour as a 45-minute meeting on the anchor day and a 30-minute call across the
 * week, plus all-day bars, one crossing into the next week: the anchor day shows "+N more".
 */
export const monthEvents: readonly MonthFixture[] = [
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} meeting`, firstMeeting.add({ hours: index }), 45),
  ),
  ...calendarEventColors.map((color, index) =>
    timed(color, `${color} call`, firstCall.add({ hours: 24 * (index % 7) }), 30),
  ),
  allDay("teal", "Conference", "2026-10-06", "2026-10-10"),
  allDay("orange", "Holiday", "2026-10-08", "2026-10-09"),
  allDay("purple", "Offsite", "2026-10-10", "2026-10-14"),
];

/** `count` events over the month's six weeks, for timing drags across a busy grid. */
export function busyMonth(count: number): readonly MonthFixture[] {
  const first = Temporal.Instant.from("2026-09-28T07:00:00Z");
  return Array.from({ length: count }, (_, index): MonthFixture => {
    const color = calendarEventColors[index % calendarEventColors.length]!;
    const start = first.add({ hours: 24 * (index % 42) + Math.floor(index / 42) });
    return timed(color, `busy ${index}`, start, 30);
  });
}
