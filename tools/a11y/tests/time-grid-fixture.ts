import type {
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAvailability,
  CalendarEvent,
} from "@moltenship/calendar";

import type { CalendarEventColor } from "@registry/shared/calendar-theme/event-colors";

/*
 * One week for React's and Solid's browser files (ADR 0279): the same events and clock, so
 * `view-twins/` compares what the two week and day views render, and both files check the same
 * grid.
 */

export type TimeGridFixture = CalendarEvent<{ readonly color: CalendarEventColor }, string>;

export const timeGridAnchor = Temporal.PlainDate.from("2026-10-08");
export const timeGridNow = Temporal.Instant.from("2026-10-08T10:20:00Z");
export const timeGridWeekRules = { firstDay: 1, minimalDays: 4, weekend: [6, 7] } as const;
/** The day view's second clock, beside its own UTC hours. */
export const timeGridZones = [{ label: "Tokyo", timeZone: "Asia/Tokyo" }] as const;

function timed(
  color: CalendarEventColor,
  title: string,
  start: string,
  minutes: number,
  isReadOnly?: boolean,
) {
  const from = Temporal.Instant.from(start);
  return {
    data: { color },
    end: from.add({ minutes }),
    id: title,
    ...(isReadOnly === true && { isReadOnly }),
    kind: "timed",
    start: from,
    title,
  } as const;
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
 * Thursday has three overlapping meetings, a compact call and a long title; Friday's flight runs
 * past midnight; Tuesday's review is read-only. Five all-day events on Wednesday collapse the row
 * to "+N more", and a conference spans three days.
 */
export const timeGridEvents: readonly TimeGridFixture[] = [
  timed("blue", "Design review", "2026-10-08T09:00:00Z", 60),
  timed("green", "Planning", "2026-10-08T09:30:00Z", 60),
  timed("orange", "Pairing", "2026-10-08T10:00:00Z", 60),
  timed("purple", "Standup", "2026-10-08T13:00:00Z", 15),
  timed(
    "teal",
    "Quarterly roadmap review with the platform, design and research teams",
    "2026-10-08T15:00:00Z",
    30,
  ),
  timed("red", "Red-eye flight", "2026-10-09T22:00:00Z", 360),
  timed("yellow", "Locked review", "2026-10-06T14:00:00Z", 60, true),
  allDay("teal", "Conference", "2026-10-05", "2026-10-08"),
  ...["Moving day", "Inventory", "Team photo", "Volunteering"].map((title) =>
    allDay("pink", title, "2026-10-07", "2026-10-08"),
  ),
];

/** Weekday office hours: the week shades the nights and the weekend. */
export const timeGridAvailability: CalendarAvailability = {
  weekly: [
    {
      days: [1, 2, 3, 4, 5],
      end: Temporal.PlainTime.from("17:00"),
      start: Temporal.PlainTime.from("09:00"),
    },
  ],
};

/**
 * Two read-only sources beside the events, in colors each framework's theme has. Without icons, as
 * each framework draws its own.
 */
export const timeGridAnnotationSources = [
  {
    color: "green",
    id: "music",
    label: "Music",
    mergeGap: Temporal.Duration.from({ minutes: 5 }),
  },
  { color: "purple", id: "sleep", label: "Sleep" },
] as const satisfies readonly (CalendarAnnotationSource & { readonly color: CalendarEventColor })[];

function annotation(id: string, sourceId: string, start: string, minutes: number) {
  const from = Temporal.Instant.from(start);
  return { end: from.add({ minutes }), id, sourceId, start: from, title: id };
}

/**
 * Wednesday night's sleep runs into Thursday. Two songs a minute apart merge into one mark beside
 * Thursday's design review, which moves aside for the rail; a third plays alone in the evening.
 */
export const timeGridAnnotations: readonly CalendarAnnotation<unknown, string>[] = [
  annotation("Night", "sleep", "2026-10-07T23:00:00Z", 480),
  annotation("Nightcall", "music", "2026-10-08T09:00:00Z", 4),
  annotation("Genesis", "music", "2026-10-08T09:05:00Z", 4),
  annotation("Intro", "music", "2026-10-08T18:00:00Z", 3),
];
