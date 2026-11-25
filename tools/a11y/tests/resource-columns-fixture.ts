import type { CalendarAvailability, CalendarEvent, CalendarResource } from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

/*
 * One set of resource columns for React's and Solid's browser files (ADR 0279): the same team,
 * rooms, bookings and hours, so `view-twins/` compares what the two views render, and both files
 * drag the same bookings.
 */

export type ColumnsBooking = CalendarEvent<{ readonly color: CalendarEventColor }, string, string>;
export type ColumnsResource = CalendarResource<null>;

export const columnsAnchor = Temporal.PlainDate.from("2026-10-08");
export const columnsNow = Temporal.Instant.from("2026-10-08T10:20:00Z");
export const columnsWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

const weekdays = (start: string, end: string): CalendarAvailability => ({
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from(end),
      start: Temporal.PlainTime.from(start),
    },
  ],
});

/** A team of two, a room on Tokyo's clock, and a room open later than the calendar. */
export const columnsResources: readonly ColumnsResource[] = [
  { data: null, id: "team", title: "Team" },
  { data: null, id: "ada", parentId: "team", title: "Ada" },
  { data: null, id: "grace", parentId: "team", title: "Grace" },
  { data: null, id: "aurora", timeZone: "Asia/Tokyo", title: "Aurora" },
  { availability: weekdays("12:00", "20:00"), data: null, id: "borealis", title: "Borealis" },
];

/** The team opens. */
export const columnsExpanded = ["team"] as const;

/** Weekdays 09:00 to 17:00. */
export const columnsAvailability = weekdays("09:00", "17:00");

function booking(
  color: CalendarEventColor,
  title: string,
  resourceIds: readonly string[],
  start: string,
  hours: number,
): ColumnsBooking {
  const from = Temporal.Instant.from(start);
  return {
    data: { color },
    end: from.add({ minutes: hours * 60 }),
    id: title,
    kind: "timed",
    resourceIds,
    start: from,
    title,
  };
}

/** Bookings on the day: one in two columns, an overlap, an all-day leave, and one unassigned. */
export const columnsBookings: readonly ColumnsBooking[] = [
  booking("blue", "Standup", ["ada"], "2026-10-08T09:00:00Z", 1),
  booking("red", "Overlap", ["ada"], "2026-10-08T09:30:00Z", 1),
  booking("green", "Review", ["ada", "aurora"], "2026-10-08T13:00:00Z", 2),
  booking("orange", "Audit", ["borealis"], "2026-10-08T14:00:00Z", 1),
  booking("teal", "Lunch", [], "2026-10-08T12:00:00Z", 1),
  {
    data: { color: "purple" },
    end: Temporal.PlainDate.from("2026-10-10"),
    id: "Leave",
    kind: "all-day",
    resourceIds: ["grace"],
    start: Temporal.PlainDate.from("2026-10-08"),
    title: "Leave",
  },
];
