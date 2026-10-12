import type { DemoEvent } from "./calendar";
import type { DemoCalendarId } from "./calendars";

/** Weeks of routine either way of this week: about a year. */
const REACH = 52;

interface Habit {
  readonly calendarId: DemoCalendarId;
  readonly duration: Temporal.DurationLike;
  /** Which weeks it happens in, by the week's number from this week. */
  readonly every?: (week: number) => boolean;
  readonly time: string;
  readonly title: string;
  /** ISO weekdays, Monday 1 to Sunday 7. */
  readonly weekdays: readonly number[];
}

const fortnightly = (week: number) => week % 2 === 0;

const habits: readonly Habit[] = [
  {
    calendarId: "fitness",
    duration: { minutes: 45 },
    time: "07:00",
    title: "Morning run",
    weekdays: [1, 3, 5],
  },
  { calendarId: "fitness", duration: { hours: 1 }, time: "18:30", title: "Yoga", weekdays: [2, 4] },
  {
    calendarId: "family",
    duration: { minutes: 30 },
    time: "15:30",
    title: "School pickup",
    weekdays: [2, 4],
  },
  {
    calendarId: "work",
    duration: { hours: 1 },
    time: "10:00",
    title: "Weekly planning",
    weekdays: [1],
  },
  {
    calendarId: "work",
    duration: { minutes: 30 },
    every: fortnightly,
    time: "11:00",
    title: "1:1 with Maya",
    weekdays: [2],
  },
  {
    calendarId: "work",
    duration: { hours: 1, minutes: 30 },
    every: (week) => !fortnightly(week),
    time: "13:00",
    title: "Sprint planning",
    weekdays: [3],
  },
  {
    calendarId: "family",
    duration: { hours: 2 },
    time: "18:00",
    title: "Sunday dinner",
    weekdays: [7],
  },
  {
    calendarId: "family",
    duration: { hours: 1 },
    every: fortnightly,
    time: "09:00",
    title: "Farmers market",
    weekdays: [6],
  },
];

/** One-off plans, a few a week, picked in turn so every week differs from the last. */
const plans: readonly Omit<Habit, "every" | "weekdays">[] = [
  { calendarId: "personal", duration: { minutes: 45 }, time: "16:00", title: "Dentist" },
  { calendarId: "personal", duration: { hours: 1 }, time: "12:30", title: "Lunch with Sam" },
  {
    calendarId: "work",
    duration: { hours: 1, minutes: 30 },
    time: "10:00",
    title: "Design review",
  },
  { calendarId: "personal", duration: { minutes: 15 }, time: "15:00", title: "Coffee with Alex" },
  { calendarId: "work", duration: { minutes: 30 }, time: "13:30", title: "Customer call: Acme" },
  {
    calendarId: "family",
    duration: { hours: 2, minutes: 30 },
    time: "20:00",
    title: "Movie night",
  },
  { calendarId: "fitness", duration: { hours: 2 }, time: "10:30", title: "Climbing" },
  { calendarId: "work", duration: { hours: 1 }, time: "15:00", title: "Release retro" },
  { calendarId: "personal", duration: { hours: 2 }, time: "19:00", title: "Book club" },
  { calendarId: "family", duration: { minutes: 15 }, time: "17:00", title: "Call grandma" },
  { calendarId: "work", duration: { hours: 1 }, time: "11:00", title: "Roadmap review" },
  { calendarId: "fitness", duration: { hours: 4 }, time: "13:00", title: "Hike" },
];

/**
 * A year either way of the three weeks `createSeedEvents` details: runs and yoga, fortnightly
 * one-on-ones, a few one-off plans each week, and an all-day "Hack week" each quarter, at local
 * wall-clock times in `timeZone`. Enough for the agenda to scroll through thousands of events.
 * They're one-off events, as an imported calendar's often are; the standup is a series.
 */
export function createRoutineEvents(today: Temporal.PlainDate, timeZone: string): DemoEvent[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const events: DemoEvent[] = [];
  const id = () => `routine-${events.length + 1}`;

  function timed(
    { calendarId, duration, time, title }: Omit<Habit, "every" | "weekdays">,
    date: Temporal.PlainDate,
  ) {
    const start = date.toZonedDateTime({ plainTime: Temporal.PlainTime.from(time), timeZone });
    events.push({
      calendarId,
      end: start.add(duration).toInstant(),
      id: id(),
      kind: "timed",
      start: start.toInstant(),
      title,
    });
  }

  for (let week = -REACH; week <= REACH; week += 1) {
    // Last week, this week, and next week are seeded in detail.
    if (Math.abs(week) <= 1) continue;
    const start = monday.add({ weeks: week });
    for (const habit of habits) {
      if (habit.every?.(week) === false) continue;
      for (const weekday of habit.weekdays) timed(habit, start.add({ days: weekday - 1 }));
    }
    for (let index = 0; index < 3; index += 1) {
      const plan = plans[(week * 3 + index + plans.length * REACH) % plans.length]!;
      timed(plan, start.add({ days: (week + index * 2 + 7 * REACH) % 7 }));
    }
    if (week % 13 === 0) {
      events.push({
        calendarId: "work",
        end: start.add({ days: 5 }),
        id: id(),
        kind: "all-day",
        start,
        title: "Hack week",
      });
    }
  }
  return events;
}
