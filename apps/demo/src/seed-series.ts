import type { DemoEvent } from "./calendar";

const workweek = (["MO", "TU", "WE", "TH", "FR"] as const).map((weekday) => ({ weekday }));

/** The day of a DST change nearest `today` in `timeZone`, within half a year; `null` without one. */
export function nearestClockChange(
  today: Temporal.PlainDate,
  timeZone: string,
): Temporal.PlainDate | null {
  const noon = today.toZonedDateTime({ plainTime: Temporal.PlainTime.from("12:00"), timeZone });
  const nearest = [noon.getTimeZoneTransition("previous"), noon.getTimeZoneTransition("next")]
    .flatMap((change) => (change === null ? [] : [change.toPlainDate()]))
    .map((date) => ({ date, days: Math.abs(today.until(date).days) }))
    .filter(({ days }) => days <= 183)
    .toSorted((left, right) => left.days - right.days)[0];
  return nearest?.date ?? null;
}

/**
 * Repeating events around `today`, at wall-clock times in `timeZone`, where they repeat:
 *
 * - a standup at 09:30 on weekdays, one occurrence moved by an override and next week's offsite
 *   days excluded;
 * - a review on the second Tuesday of each month;
 * - a birthday each year, all day;
 * - a daily dog walk across the DST change nearest today, which stays at 08:00 on both sides.
 */
export function createSeriesEvents(today: Temporal.PlainDate, timeZone: string): DemoEvent[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const at = (date: Temporal.PlainDate, time: string) =>
    date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone });

  // Started a year ago, so last year's weeks have it too.
  const standupStart = at(monday.subtract({ weeks: 52 }), "09:30");
  const standupOn = (days: number) => at(monday.add({ days }), "09:30").toInstant();
  const standup: DemoEvent = {
    calendarId: "work",
    end: standupStart.add({ minutes: 15 }).toInstant(),
    id: "standup",
    kind: "timed",
    recurrence: {
      // Next Wednesday to Friday, the team is at the offsite.
      exceptionDates: [9, 10, 11].map(standupOn),
      rule: { byDay: workweek, frequency: "WEEKLY" },
    },
    resourceIds: ["room-orchid"],
    sourceTimeZone: timeZone,
    start: standupStart.toInstant(),
    title: "Standup",
  };
  // This Wednesday's standup, half an hour later for the release freeze.
  const moved = at(monday.add({ days: 2 }), "10:00");
  const standupMoved: DemoEvent = {
    calendarId: "work",
    description: "Half an hour later this week, after the release freeze kickoff.",
    end: moved.add({ minutes: 15 }).toInstant(),
    id: "standup-moved",
    kind: "timed",
    override: { recurrenceId: standupOn(2), seriesId: "standup" },
    resourceIds: ["room-orchid"],
    start: moved.toInstant(),
    title: "Standup",
  };

  // The second Tuesday of the month, six months back.
  const month = today.with({ day: 1 }).subtract({ months: 6 });
  const firstTuesday = month.add({ days: (2 - month.dayOfWeek + 7) % 7 });
  const reviewStart = at(firstTuesday.add({ weeks: 1 }), "14:00");
  const review: DemoEvent = {
    calendarId: "work",
    description: "Metrics, roadmap and hiring, on the second Tuesday of each month.",
    end: reviewStart.add({ hours: 1 }).toInstant(),
    id: "monthly-review",
    kind: "timed",
    recurrence: { rule: { byDay: [{ ordinal: 2, weekday: "TU" }], frequency: "MONTHLY" } },
    resourceIds: ["room-cedar"],
    sourceTimeZone: timeZone,
    start: reviewStart.toInstant(),
    title: "Monthly review",
  };

  // On this week's Saturday, four years back, so a 29 February stays one.
  const birthdayStart = monday.add({ days: 5 }).subtract({ years: 4 });
  const birthday: DemoEvent = {
    calendarId: "family",
    end: birthdayStart.add({ days: 1 }),
    id: "moms-birthday",
    kind: "all-day",
    recurrence: { rule: { frequency: "YEARLY" } },
    start: birthdayStart,
    title: "Mom's birthday",
  };

  // From this week, or a week before the clock change if that's earlier, to a week after it.
  const change = nearestClockChange(today, timeZone);
  const first = change === null ? monday : earlierOf(monday, change.subtract({ weeks: 1 }));
  const last =
    change === null
      ? monday.add({ days: 13 })
      : laterOf(monday.add({ days: 13 }), change.add({ weeks: 1 }));
  const walkStart = at(first, "08:00");
  const changeDay = change?.toLocaleString("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
  const walk: DemoEvent = {
    calendarId: "personal",
    description:
      changeDay === undefined
        ? "Every morning for two weeks."
        : `Every morning at 08:00, on either side of the clock change on ${changeDay}.`,
    end: walkStart.add({ minutes: 30 }).toInstant(),
    id: "dog-walk",
    kind: "timed",
    recurrence: { rule: { count: first.until(last).days + 1, frequency: "DAILY" } },
    sourceTimeZone: timeZone,
    start: walkStart.toInstant(),
    title: "Walk the dog",
  };

  return [standup, standupMoved, review, birthday, walk];
}

const earlierOf = (left: Temporal.PlainDate, right: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(left, right) <= 0 ? left : right;
const laterOf = (left: Temporal.PlainDate, right: Temporal.PlainDate) =>
  Temporal.PlainDate.compare(left, right) >= 0 ? left : right;

/** One-off seeded events that are series now. Saved data from before has them one by one. */
const replacedBySeries = new Set(["Mom's birthday", "Standup"]);
const seededId = /^(?:seed|routine)-\d+$/;

/**
 * Events saved before the demo had recurrence, brought up to date: the seeded one-off standups and
 * birthday give way to the series, and everything else, the visitor's own events and edits to other
 * seeded events included, stays as it was.
 */
export function upgradeSavedEvents(
  events: readonly DemoEvent[],
  today: Temporal.PlainDate,
  timeZone: string,
): DemoEvent[] {
  return [
    ...events.filter(({ id, title }) => !(seededId.test(id) && replacedBySeries.has(title))),
    ...createSeriesEvents(today, timeZone),
  ];
}
