import type {
  CalendarAvailability,
  CalendarEvent,
  CalendarResource,
  IsoDayOfWeek,
} from "@moltenship/calendar";
import type { RecurringCalendarEvent } from "@moltenship/calendar-recurrence";

import {
  buildAllDayEvent,
  buildAvailability,
  buildEvent,
  buildRecurringEvent,
  buildResource,
} from "./builders";
import { createTestEnvironment, type TestEnvironment } from "./environment";

/**
 * A ready dataset for contract tests: the events, and the environment, resources and `Root`
 * props they're meant for. Each field is a harness option, so `renderCalendar(Calendar,
 * { ...fixture, view })` renders it; merge `rootProps` when you pass your own. Every call builds
 * new records.
 */
export interface CalendarFixture<TEvent, TResource = never> {
  readonly environment: TestEnvironment;
  readonly events: readonly TEvent[];
  readonly resources?: readonly TResource[];
  /** `Root` props the dataset needs, such as its working hours. */
  readonly rootProps?: { readonly availability?: CalendarAvailability };
}

/** The canonical event shape the fixtures use, with data you can match on. */
export type FixtureEvent = CalendarEvent<{ readonly group: string }>;

/** A fixture resource: `group` names its team or room kind. */
export type FixtureResource = CalendarResource<{ readonly group: string }>;

const sequence = (count: number) => Array.from({ length: count }, (_, index) => index);

/**
 * Thursday 8 October 2026 in UTC, as busy as a day gets: 30 timed events in overlapping groups,
 * from back-to-back half hours whose ends touch to a stack of four at once, a staircase, events of
 * five to fifteen minutes, two that cross midnight, and three all-day events, one over the whole
 * week. For overlap layouts, "+N more", lists and performance budgets.
 */
export function denseDayFixture(): CalendarFixture<FixtureEvent> {
  const environment = createTestEnvironment({ now: "2026-10-08T12:00:00Z" });
  const day = "2026-10-08";
  const at = (time: string) => `${day}T${time}Z`;
  const timed = (id: string, start: string, minutes: number, group: string) =>
    buildEvent({ data: { group }, duration: { minutes }, id, start, title: `${group} ${id}` });

  const events: FixtureEvent[] = [
    // Back-to-back half hours from 08:00 to 12:00: touching ends never overlap.
    ...sequence(8).map((index) =>
      timed(
        `b${index + 1}`,
        at(
          `${String(8 + Math.floor(index / 2)).padStart(2, "0")}:${index % 2 === 0 ? "00" : "30"}`,
        ),
        30,
        "Back-to-back",
      ),
    ),
    // Four at once at 13:00, each a different length.
    ...[60, 45, 90, 30].map((minutes, index) =>
      timed(`s${index + 1}`, at("13:00"), minutes, "Stack"),
    ),
    // A staircase: each starts 15 minutes after the last and overlaps the two before it.
    ...sequence(8).map((index) => {
      const minutes = 15 * index;
      const start = Temporal.PlainTime.from("15:00")
        .add({ minutes })
        .toString({ smallestUnit: "minute" });
      return timed(`c${index + 1}`, at(start), 45, "Staircase");
    }),
    // Short ones, five minutes to a quarter of an hour.
    ...[5, 10, 15].map((minutes, index) =>
      timed(`q${index + 1}`, at(`18:${String(index * 15).padStart(2, "0")}`), minutes, "Short"),
    ),
    // Two that cross midnight, into the 9th and from the 7th.
    timed("n1", at("22:30"), 120, "Overnight"),
    buildEvent({
      data: { group: "Overnight" },
      end: at("01:00"),
      id: "n2",
      start: "2026-10-07T23:00:00Z",
      title: "Overnight n2",
    }),
    // A long one under everything in the afternoon, and three across lunch.
    timed("l1", at("12:00"), 360, "Long"),
    ...sequence(3).map((index) => timed(`m${index + 1}`, at("12:00"), 60, "Lunch")),
    timed("e1", at("23:45"), 15, "Late"),
  ];
  const allDay: FixtureEvent[] = [
    buildAllDayEvent({ data: { group: "All day" }, id: "a1", start: day, title: "Holiday" }),
    buildAllDayEvent({ data: { group: "All day" }, id: "a2", start: day, title: "On call" }),
    buildAllDayEvent({
      data: { group: "All day" },
      end: "2026-10-12",
      id: "a3",
      start: "2026-10-05",
      title: "Conference week",
    }),
  ];
  return Object.freeze({ environment, events: Object.freeze([...events, ...allDay]) });
}

/**
 * A week in New York with a DST change: the clocks go back an hour at 02:00 on Sunday 1 November
 * 2026 (`"fall"`, the default), or forward at 02:00 on Sunday 8 March (`"spring"`). It has a 09:00
 * meeting every day, which stays at 09:00 on the wall clock; an event at 01:30, in the hour that
 * repeats or the one that's skipped; one across the change; and an all-day event over it. The
 * calendar opens on the week, with weeks from Monday.
 */
export function dstWeekFixture(change: "fall" | "spring" = "fall"): CalendarFixture<FixtureEvent> {
  const timeZone = "America/New_York";
  const sunday = change === "fall" ? "2026-11-01" : "2026-03-08";
  const monday = Temporal.PlainDate.from(sunday).subtract({ days: 6 });
  const environment = createTestEnvironment({
    anchorDate: monday,
    now: `${monday.toString()}T12:00`,
    timeZone,
  });
  const daily = sequence(7).map((index) => {
    const date = monday.add({ days: index });
    return buildEvent({
      data: { group: "Daily" },
      duration: { minutes: 30 },
      id: `d${index + 1}`,
      start: `${date.toString()}T09:00`,
      timeZone,
      title: `Standup ${date.toString()}`,
    });
  });
  const events: FixtureEvent[] = [
    ...daily,
    // In a fall-back week, the first 01:30, an hour before the second; in spring, 01:30 is the
    // last half hour before the skipped one.
    buildEvent({
      data: { group: "Change" },
      duration: { minutes: 30 },
      id: "t1",
      start: `${sunday}T01:30`,
      timeZone,
      title: "In the changing hour",
    }),
    buildEvent({
      data: { group: "Change" },
      end: `${sunday}T04:00`,
      id: "t2",
      start: `${sunday}T00:30`,
      timeZone,
      title: "Across the change",
    }),
    buildAllDayEvent({
      data: { group: "All day" },
      end: Temporal.PlainDate.from(sunday).add({ days: 2 }),
      id: "a1",
      start: Temporal.PlainDate.from(sunday).subtract({ days: 1 }),
      title: "Weekend away",
    }),
  ];
  return Object.freeze({ environment, events: Object.freeze(events) });
}

/**
 * Three series in three zones, shown in UTC from Monday 19 October 2026: a standup at 09:00 in
 * Berlin on weekdays, a review at 10:00 in Los Angeles on the first Tuesday of each month, and a
 * daily 08:00 check-in in Tokyo for ten days, with one day off. Berlin's clocks go back on
 * 25 October and Los Angeles' on 1 November, a week apart, so their occurrences shift in UTC on
 * different days while each stays put on its own wall clock; Tokyo has no DST. Expand the masters
 * with `createOccurrenceExpander(createCanonicalRecurrenceAdapter())`.
 */
export function multiZoneSeriesFixture(): CalendarFixture<
  RecurringCalendarEvent<{ readonly group: string }>
> {
  const environment = createTestEnvironment({
    anchorDate: "2026-10-19",
    now: "2026-10-19T07:00:00Z",
  });
  const events = [
    buildRecurringEvent({
      data: { group: "Berlin" },
      duration: { minutes: 15 },
      id: "berlin-standup",
      rule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      start: "2026-10-19T09:00",
      timeZone: "Europe/Berlin",
      title: "Standup (Berlin)",
    }),
    buildRecurringEvent({
      data: { group: "Los Angeles" },
      duration: { hours: 1 },
      id: "la-review",
      rule: "FREQ=MONTHLY;BYDAY=1TU",
      start: "2026-10-06T10:00",
      timeZone: "America/Los_Angeles",
      title: "Review (Los Angeles)",
    }),
    buildRecurringEvent({
      data: { group: "Tokyo" },
      duration: { minutes: 30 },
      exceptionDates: ["2026-10-24"],
      id: "tokyo-check-in",
      rule: "FREQ=DAILY;COUNT=10",
      start: "2026-10-19T08:00",
      timeZone: "Asia/Tokyo",
      title: "Check-in (Tokyo)",
    }),
  ];
  return Object.freeze({ environment, events: Object.freeze(events) });
}

/**
 * Thursday 8 October 2026 for a team and two rooms, in UTC: people in three time zones, one with
 * hours of their own, rooms grouped under a parent, working hours from 9 to 6 on weekdays, events
 * on one resource, on two at once (a meeting in a room), on none (unassigned), and an all-day
 * event for one person.
 */
export function resourceDayFixture(): CalendarFixture<FixtureEvent, FixtureResource> {
  const environment = createTestEnvironment({ now: "2026-10-08T08:00:00Z" });
  const weekdays: readonly IsoDayOfWeek[] = [1, 2, 3, 4, 5];
  const resources: FixtureResource[] = [
    buildResource({ data: { group: "Team" }, id: "ana", title: "Ana", timeZone: "Europe/Lisbon" }),
    buildResource({
      availability: buildAvailability({ days: weekdays, hours: "12:00-20:00" }),
      data: { group: "Team" },
      id: "ben",
      timeZone: "America/New_York",
      title: "Ben",
    }),
    buildResource({
      data: { group: "Team" },
      id: "chen",
      title: "Chen",
      timeZone: "Asia/Shanghai",
    }),
    buildResource({ data: { group: "Rooms" }, id: "rooms", title: "Rooms" }),
    buildResource({ data: { group: "Rooms" }, id: "orchid", parentId: "rooms", title: "Orchid" }),
    buildResource({ data: { group: "Rooms" }, id: "lotus", parentId: "rooms", title: "Lotus" }),
  ];
  const at = (time: string) => `2026-10-08T${time}Z`;
  const events: FixtureEvent[] = [
    buildEvent({
      data: { group: "Work" },
      id: "ana-1",
      resourceIds: ["ana"],
      start: at("09:00"),
      title: "Design review",
    }),
    buildEvent({
      data: { group: "Work" },
      duration: { hours: 2 },
      id: "ben-1",
      resourceIds: ["ben"],
      start: at("14:00"),
      title: "Planning",
    }),
    buildEvent({
      data: { group: "Work" },
      duration: { minutes: 30 },
      id: "chen-1",
      resourceIds: ["chen"],
      start: at("02:00"),
      title: "Early sync",
    }),
    buildEvent({
      data: { group: "Meeting" },
      id: "meet-1",
      resourceIds: ["ana", "orchid"],
      start: at("11:00"),
      title: "Interview",
    }),
    buildEvent({
      data: { group: "Meeting" },
      duration: { minutes: 90 },
      id: "meet-2",
      resourceIds: ["ben", "chen", "lotus"],
      start: at("15:00"),
      title: "All hands",
    }),
    buildEvent({
      data: { group: "Unassigned" },
      id: "open-1",
      start: at("10:00"),
      title: "Unassigned task",
    }),
    buildAllDayEvent({
      data: { group: "Leave" },
      id: "leave-1",
      resourceIds: ["chen"],
      start: "2026-10-08",
      title: "Chen away",
    }),
  ];
  return Object.freeze({
    environment,
    events: Object.freeze(events),
    resources: Object.freeze(resources),
    rootProps: Object.freeze({ availability: buildAvailability({ hours: "09:00-18:00" }) }),
  });
}
