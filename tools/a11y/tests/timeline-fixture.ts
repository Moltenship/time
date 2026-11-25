import type { CalendarAvailability, CalendarEvent, CalendarResource } from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

/*
 * One resource timeline for React's and Solid's browser files (ADR 0279): the same sites, rooms,
 * bookings and hours, so `view-twins/` compares what the two timelines render, and both files drag
 * the same bookings.
 */

export type TimelineBooking = CalendarEvent<{ readonly color: CalendarEventColor }, string, string>;
export type TimelineResource = CalendarResource<null>;

export const timelineAnchor = Temporal.PlainDate.from("2026-10-08");
export const timelineNow = Temporal.Instant.from("2026-10-08T10:20:00Z");
export const timelineWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;

/** Three sites of three rooms; a room in Tokyo keeps its own clock, and the third site is closed. */
export const timelineResources: readonly TimelineResource[] = Array.from(
  { length: 3 },
  (_, site) => [
    { data: null, id: `site-${site}`, title: `Site ${site + 1}` },
    ...Array.from({ length: 3 }, (_, room) => ({
      data: null,
      id: `site-${site}-room-${room}`,
      parentId: `site-${site}`,
      title: `Room ${site + 1}.${room + 1}`,
      ...(site === 0 && room === 2 ? { timeZone: "Asia/Tokyo" } : {}),
    })),
  ],
).flat();

/** The sites open; the third stays collapsed. */
export const timelineExpanded = ["site-0", "site-1"] as const;

/** Weekdays 09:00 to 17:00; Friday is an offsite. */
export const timelineAvailability: CalendarAvailability = {
  exceptions: [{ date: Temporal.PlainDate.from("2026-10-09"), label: "Offsite" }],
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};

function booking(
  color: CalendarEventColor,
  title: string,
  resourceIds: readonly string[],
  start: string,
  hours: number,
): TimelineBooking {
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

/** Bookings across the week: one in two rooms, one over two days, overlaps, and one unassigned. */
export const timelineBookings: readonly TimelineBooking[] = [
  booking("blue", "Standup", ["site-0-room-0"], "2026-10-08T09:00:00Z", 1),
  booking("green", "Review", ["site-0-room-0", "site-0-room-2"], "2026-10-08T13:00:00Z", 2),
  booking("red", "Overlap", ["site-0-room-0"], "2026-10-08T09:30:00Z", 1),
  booking("purple", "Workshop", ["site-0-room-1"], "2026-10-07T09:00:00Z", 30),
  booking("orange", "Audit", ["site-1-room-2"], "2026-10-08T10:00:00Z", 1),
  booking("pink", "Check-in", ["site-1-room-0"], "2026-10-06T08:00:00Z", 0.25),
  booking("teal", "Lunch", [], "2026-10-08T12:00:00Z", 1),
];
