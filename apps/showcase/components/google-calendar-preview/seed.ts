import type { GoogleEvent, GoogleEventTime } from "@/content/examples/google-calendar";

/** Google's ID for the instance of `seriesId` that starts at `start`: `<series>_<UTC start>`. */
export function instanceId(seriesId: string, start: Temporal.ZonedDateTime | Temporal.PlainDate) {
  const key =
    start instanceof Temporal.PlainDate
      ? start.toString()
      : start.toInstant().toString({ smallestUnit: "second" });
  return `${seriesId}_${key.replace(/[-:]/g, "")}`;
}

/** A time as the Calendar API writes it: RFC 3339 with the offset, and the zone. */
export function googleTime(at: Temporal.ZonedDateTime | Temporal.PlainDate): GoogleEventTime {
  return at instanceof Temporal.PlainDate
    ? { date: at.toString() }
    : { dateTime: at.toString({ timeZoneName: "never" }), timeZone: at.timeZoneId };
}

/**
 * A Google calendar around the visitor's week, on their clock, as `events.list` returns it: a
 * weekday stand-up with Wednesday's cancelled and Thursday's moved an hour later, a 1:1 every other
 * week, planning on eight Mondays, a release day every Friday shown as free, focus time shown as
 * free, a two-day offsite next week, and one-off events this week and either side of it. Timed
 * events sit around the visitor's current hour, as the time grid opens there.
 */
export function createSeedEvents(now: Temporal.ZonedDateTime): GoogleEvent[] {
  const { timeZoneId: timeZone } = now;
  const today = now.toPlainDate();
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  // Kept between 02:00 and 19:00, so no event crosses midnight.
  const hour = Math.min(Math.max(now.hour, 2), 19);

  /** A wall time on a day of this week (`week` 0) or another. */
  const at = (week: number, weekday: number, hours: number, minutes = 0) =>
    monday
      .add({ days: week * 7 + weekday - 1 })
      .toZonedDateTime({ plainTime: new Temporal.PlainTime(hours, minutes), timeZone });
  const day = (week: number, weekday: number) => monday.add({ days: week * 7 + weekday - 1 });

  const timed = (
    id: string,
    summary: string,
    start: Temporal.ZonedDateTime,
    minutes: number,
    fields: Partial<GoogleEvent> = {},
  ): GoogleEvent => ({
    end: googleTime(start.add({ minutes })),
    id,
    start: googleTime(start),
    status: "confirmed",
    summary,
    ...fields,
  });

  const standup = at(-1, 1, hour - 1);
  const wednesday = at(0, 3, hour - 1);
  const thursday = at(0, 4, hour - 1);

  return [
    timed("standup", "Stand-up", standup, 30, {
      colorId: "7",
      recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    }),
    {
      id: instanceId("standup", wednesday),
      originalStartTime: googleTime(wednesday),
      recurringEventId: "standup",
      status: "cancelled",
    },
    timed(instanceId("standup", thursday), "Stand-up (late)", thursday.add({ hours: 1 }), 30, {
      colorId: "7",
      originalStartTime: googleTime(thursday),
      recurringEventId: "standup",
    }),
    timed("oneonone", "1:1 with Sam", at(0, 2, hour + 1), 45, {
      colorId: "3",
      recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2"],
    }),
    timed("planning", "Planning", at(-1, 1, hour + 1), 60, {
      colorId: "6",
      recurrence: ["RRULE:FREQ=WEEKLY;COUNT=8"],
    }),
    timed("review", "Design review", at(0, 3, hour + 1, 30), 60),
    timed("focustime", "Focus time", at(0, 4, hour + 1), 120, {
      colorId: "8",
      transparency: "transparent",
    }),
    {
      colorId: "2",
      end: googleTime(day(-1, 6)),
      id: "release",
      recurrence: ["RRULE:FREQ=WEEKLY"],
      start: googleTime(day(-1, 5)),
      status: "confirmed",
      summary: "Release day",
      transparency: "transparent",
    },
    {
      colorId: "5",
      // Google's end date is the day after the last, so this is Wednesday and Thursday.
      end: googleTime(day(1, 5)),
      id: "offsite",
      start: googleTime(day(1, 3)),
      status: "confirmed",
      summary: "Team offsite",
    },
    timed("retro", "Sprint retro", at(-1, 4, hour + 1), 60, { colorId: "4" }),
    timed("quarter", "Quarterly review", at(1, 2, hour + 2), 90, { colorId: "11" }),
  ];
}
