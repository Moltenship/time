import type { DemoEvent } from "./calendar";
import type { DemoCalendarId } from "./calendars";
import type { DemoResourceId } from "./resources";

type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * The rooms and people work events book, by title. Some book several resources, one books a
 * team, and work events left out (such as "Team lunch") stay unassigned, like every personal one.
 */
const resourceAssignments: Readonly<Record<string, readonly DemoResourceId[]>> = {
  "1:1 with Maya": ["room-lotus", "person-maya", "person-sam"],
  "Customer call: Acme": ["person-sam"],
  "Deploy window": ["person-jordan"],
  "Design review": ["room-orchid", "person-maya", "person-alex"],
  "Focus time": ["person-lee"],
  "Interview debrief": ["room-lotus", "person-alex", "person-lee"],
  "Interview: frontend engineer": ["room-lotus", "person-alex", "person-lee"],
  "Quarterly planning": ["room-cedar"],
  "Release freeze": ["team-engineering"],
  "Release retro": ["room-cedar", "team-engineering"],
  "Roadmap review": ["room-orchid"],
  "Sprint planning": ["room-cedar", "team-engineering"],
  Standup: ["room-orchid"],
  "Team offsite": ["team-design", "team-engineering"],
  "Weekly planning": ["room-cedar", "person-sam", "person-lee"],
  // The larger team's week, below.
  "Customer demo": ["room-juniper", "person-ana", "person-rosa", "person-theo"],
  "Design crit": ["room-maple", "person-noor", "person-kai", "person-zoe"],
  "Paris sync": ["person-ines", "person-ravi", "person-cleo"],
  "Pairing: payments": ["room-aspen", "person-mia", "person-omar"],
  "Pipeline review": ["room-willow", "person-ana", "person-ben", "person-cleo", "person-leo"],
  "1:1 with Ivy": ["room-birch", "person-ivy", "person-yuki"],
  "Hiring panel": ["room-lotus", "person-kai", "person-mia", "person-leo"],
};

function resourcesOf(title: string): Pick<DemoEvent, "resourceIds"> {
  const resourceIds = resourceAssignments[title];
  return resourceIds === undefined ? {} : { resourceIds };
}

/**
 * Seeds roughly two weeks of events around `today` (last week, this week, next week) at local
 * wall-clock times in `timeZone`. It covers overlaps, all-day and multi-day events, events that
 * cross midnight, 15-minute items, and work events booking rooms and people.
 */
export function createSeedEvents(today: Temporal.PlainDate, timeZone: string): DemoEvent[] {
  const monday = today.subtract({ days: today.dayOfWeek - 1 });
  const events: DemoEvent[] = [];
  const dateOf = (week: number, weekday: Weekday) => monday.add({ days: week * 7 + weekday - 1 });

  function timed(
    calendarId: DemoCalendarId,
    title: string,
    [week, weekday]: readonly [number, Weekday],
    time: string,
    duration: Temporal.DurationLike,
    description?: string,
  ) {
    const start = dateOf(week, weekday).toZonedDateTime({
      plainTime: Temporal.PlainTime.from(time),
      timeZone,
    });
    events.push({
      calendarId,
      end: start.add(duration).toInstant(),
      id: `seed-${events.length + 1}`,
      kind: "timed",
      start: start.toInstant(),
      title,
      ...(description === undefined ? {} : { description }),
      ...resourcesOf(title),
    });
  }

  function allDay(
    calendarId: DemoCalendarId,
    title: string,
    [week, weekday]: readonly [number, Weekday],
    days = 1,
  ) {
    const start = dateOf(week, weekday);
    events.push({
      calendarId,
      end: start.add({ days }),
      id: `seed-${events.length + 1}`,
      kind: "all-day",
      start,
      title,
      ...resourcesOf(title),
    });
  }

  for (const week of [-1, 0, 1]) {
    for (const weekday of [1, 2, 3, 4, 5] as const) {
      timed("work", "Standup", [week, weekday], "09:30", { minutes: 15 });
    }
    for (const weekday of [1, 3, 5] as const) {
      timed("fitness", "Morning run", [week, weekday], "07:00", { minutes: 45 });
    }
    for (const weekday of [2, 4] as const) {
      timed("fitness", "Yoga", [week, weekday], "18:30", { hours: 1 });
      timed("family", "School pickup", [week, weekday], "15:30", { minutes: 30 });
    }
  }

  // Last week, so navigating back is not empty.
  timed("work", "Roadmap review", [-1, 2], "11:00", { hours: 1 });
  timed("personal", "Haircut", [-1, 3], "17:30", { minutes: 45 });
  timed("family", "Grandma's visit", [-1, 6], "14:00", { hours: 3 });
  timed("family", "Sunday dinner", [-1, 7], "18:00", { hours: 2 });
  allDay("work", "Hack week", [-1, 3], 3);

  // This week.
  timed("work", "Weekly planning", [0, 1], "10:00", { hours: 1 });
  timed("personal", "Lunch with Sam", [0, 1], "12:30", { hours: 1 });
  timed("work", "Design review", [0, 2], "10:00", { hours: 1, minutes: 30 }, "Calendar views v2");
  timed("work", "1:1 with Maya", [0, 2], "11:00", { minutes: 30 });
  timed("personal", "Dentist", [0, 2], "16:00", { minutes: 45 });
  timed("work", "Sprint planning", [0, 3], "13:00", { hours: 1, minutes: 30 });
  timed("work", "Customer call: Acme", [0, 3], "13:30", { minutes: 30 });
  timed("personal", "Coffee with Alex", [0, 3], "15:00", { minutes: 15 });
  timed(
    "work",
    "Deploy window",
    [0, 3],
    "23:00",
    { hours: 2, minutes: 30 },
    "Database migration, then the 2.0 rollout.",
  );
  timed("work", "Focus time", [0, 4], "10:00", { hours: 2 });
  timed("personal", "Pick up dry cleaning", [0, 4], "17:45", { minutes: 15 });
  timed("personal", "Book club", [0, 4], "19:00", { hours: 2 }, "Reading: The Dispossessed");
  timed("work", "Team lunch", [0, 5], "12:00", { hours: 1, minutes: 30 });
  timed("work", "Release retro", [0, 5], "15:00", { hours: 1 });
  timed("family", "Movie night", [0, 5], "20:00", { hours: 2, minutes: 30 });
  timed("family", "Farmers market", [0, 6], "09:00", { hours: 1 });
  timed("fitness", "Climbing", [0, 6], "10:30", { hours: 2 });
  timed("personal", "Dinner party at Lee's", [0, 6], "19:30", { hours: 4 });
  timed("family", "Brunch with parents", [0, 7], "11:00", { hours: 2 });
  timed("personal", "Meal prep", [0, 7], "16:00", { hours: 1, minutes: 30 });
  allDay("work", "Release freeze", [0, 3], 3);
  allDay("family", "Mom's birthday", [0, 6]);

  // Next week.
  timed("work", "Quarterly planning", [1, 1], "10:00", { hours: 2 });
  timed("work", "Interview: frontend engineer", [1, 1], "14:00", { hours: 1 });
  timed("work", "Interview debrief", [1, 1], "15:00", { minutes: 15 });
  timed("personal", "Pack for Berlin", [1, 2], "19:00", { hours: 1 });
  timed("travel", "Flight to Berlin", [1, 2], "21:40", { hours: 8, minutes: 30 }, "Gate B12");
  allDay("travel", "Berlin trip", [1, 3], 3);
  allDay("work", "Team offsite", [1, 3], 3);
  timed("work", "Offsite kickoff", [1, 3], "10:00", { hours: 1 });
  timed("work", "Roadmap workshop", [1, 4], "09:00", { hours: 8 });
  timed("work", "Team dinner", [1, 4], "19:00", { hours: 3 });
  timed("travel", "Flight home", [1, 5], "16:20", { hours: 1, minutes: 45 });
  timed("work", "On-call shift", [1, 5], "18:00", { days: 2, hours: 15 });
  timed("family", "Kids' football match", [1, 6], "10:00", { hours: 1, minutes: 30 });
  timed("fitness", "Hike", [1, 6], "13:00", { hours: 4 });
  timed("family", "Call grandma", [1, 7], "17:00", { minutes: 15 });

  // The larger team's week, overlapping so booking a room among many shows who's busy. Times
  // shift a little each day.
  for (const week of [-1, 0, 1]) {
    for (const weekday of [1, 2, 3, 4, 5] as const) {
      const shift = (time: string) =>
        Temporal.PlainTime.from(time)
          .add({ minutes: ((weekday * 30) % 90) - 30 })
          .toString({ smallestUnit: "minute" });
      timed("work", "Pipeline review", [week, weekday], shift("09:30"), { minutes: 45 });
      timed("work", "Design crit", [week, weekday], shift("11:00"), { hours: 1 });
      timed("work", "Pairing: payments", [week, weekday], "13:00", { hours: 1, minutes: 30 });
      timed("work", "Customer demo", [week, weekday], shift("14:30"), { hours: 1 });
      timed("work", "1:1 with Ivy", [week, weekday], "16:00", { minutes: 30 });
      if (weekday % 2 === 1) {
        timed("work", "Paris sync", [week, weekday], "08:30", { minutes: 30 });
        timed("work", "Hiring panel", [week, weekday], shift("10:30"), { hours: 1, minutes: 30 });
      }
    }
  }

  return events;
}
