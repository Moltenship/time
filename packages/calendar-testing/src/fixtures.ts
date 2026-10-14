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
import { createTestEnvironment, requireTemporal, type TestEnvironment } from "./environment";

/**
 * A ready dataset of canonical events for contract tests, with the environment, resources and
 * `Root` props it's meant for. Each field is a harness option, so
 * `renderCalendar(Calendar, { ...fixture, view })` renders it; merge `rootProps` when you pass
 * your own. Every call builds new records. A fixture's IDs, titles, times and counts are part of
 * the API: they change only in a major version.
 */
export interface CalendarFixture<TEvent, TResource = never> {
  readonly environment: TestEnvironment;
  readonly events: readonly TEvent[];
  readonly resources?: readonly TResource[];
  /** `Root` props the dataset needs: its working hours, the resources it opens expanded. */
  readonly rootProps?: {
    readonly availability?: CalendarAvailability;
    readonly defaultExpandedResourceIds?: readonly string[];
  };
}

/**
 * Series masters, which a calendar shows only once they're expanded into occurrences, with the
 * environment they're meant for. Expand them with `@moltenship/calendar-recurrence`'s
 * `createOccurrenceExpander` and show them through `createOccurrenceAdapter`.
 */
export interface SeriesFixture<TEvent> {
  readonly environment: TestEnvironment;
  readonly series: readonly TEvent[];
}

/** The canonical event shape the fixtures use: `group` names what an event is part of. */
export type FixtureEvent = CalendarEvent<{ readonly group: string }>;

/** A series master of `multiZoneSeriesFixture`. */
export type FixtureSeriesEvent = RecurringCalendarEvent<{ readonly group: string }>;

/** A fixture resource: `group` names its team or room kind. */
export type FixtureResource = CalendarResource<{ readonly group: string }>;

const sequence = (count: number) => Array.from({ length: count }, (_, index) => index);

/**
 * Thursday 8 October 2026 in UTC, as busy as a day gets: 30 timed events and 3 all-day ones.
 *
 * - `b1`–`b8` ("Back-to-back"): half hours from 08:00 to 12:00 whose ends touch, overlapping none.
 * - `l1` ("Long"): 12:00–18:00, under everything from noon to six.
 * - `m1`–`m3` ("Lunch"): 12:00–13:00; with `l1`, four at once.
 * - `s1`–`s4` ("Stack"): from 13:00, 60, 45, 90 and 30 minutes long; with `l1`, five at once.
 * - `c1`–`c8` ("Staircase"): 45 minutes each, from 15:00 every 15 minutes, each overlapping the two
 *   before it, and `l1`.
 * - `q1`–`q3` ("Short"): 5, 10 and 15 minutes, at 18:00, 18:15 and 18:30.
 * - `n1` ("Overnight", 22:30–00:30 the next day) under `e1` ("Late", 23:45–24:00), and `n2`
 *   ("Overnight", from 23:00 the day before to 01:00).
 * - `a1` "Holiday" and `a2` "On call" on the day, `a3` "Conference week" from Monday 5 to Sunday
 *   11 October ("All day").
 *
 * For overlap layouts, "+N more", lists and performance budgets.
 */
export function denseDayFixture(): CalendarFixture<FixtureEvent> {
  requireTemporal();
  const environment = createTestEnvironment({ now: "2026-10-08T12:00:00Z" });
  const at = (time: string) => `2026-10-08T${time}Z`;
  const timed = (id: string, start: string, minutes: number, group: string) =>
    buildEvent({ data: { group }, duration: { minutes }, id, start, title: `${group} ${id}` });
  const clock = (minutes: number) =>
    Temporal.PlainTime.from("00:00").add({ minutes }).toString({ smallestUnit: "minute" });

  const events: FixtureEvent[] = [
    ...sequence(8).map((index) =>
      timed(`b${index + 1}`, at(clock(8 * 60 + index * 30)), 30, "Back-to-back"),
    ),
    timed("l1", at("12:00"), 360, "Long"),
    ...sequence(3).map((index) => timed(`m${index + 1}`, at("12:00"), 60, "Lunch")),
    ...[60, 45, 90, 30].map((minutes, index) =>
      timed(`s${index + 1}`, at("13:00"), minutes, "Stack"),
    ),
    ...sequence(8).map((index) =>
      timed(`c${index + 1}`, at(clock(15 * 60 + index * 15)), 45, "Staircase"),
    ),
    ...[5, 10, 15].map((minutes, index) =>
      timed(`q${index + 1}`, at(clock(18 * 60 + index * 15)), minutes, "Short"),
    ),
    timed("n1", at("22:30"), 120, "Overnight"),
    timed("e1", at("23:45"), 15, "Late"),
    buildEvent({
      data: { group: "Overnight" },
      end: at("01:00"),
      id: "n2",
      start: "2026-10-07T23:00:00Z",
      title: "Overnight n2",
    }),
    buildAllDayEvent({
      data: { group: "All day" },
      id: "a1",
      start: "2026-10-08",
      title: "Holiday",
    }),
    buildAllDayEvent({
      data: { group: "All day" },
      id: "a2",
      start: "2026-10-08",
      title: "On call",
    }),
    buildAllDayEvent({
      data: { group: "All day" },
      end: "2026-10-12",
      id: "a3",
      start: "2026-10-05",
      title: "Conference week",
    }),
  ];
  return Object.freeze({ environment, events: Object.freeze(events) });
}

export interface DstWeekOptions {
  /**
   * `"fall"`, the default: the week to Sunday 1 November 2026, when New York's clocks go back
   * from 02:00 to 01:00. `"spring"`: the week to Sunday 8 March 2026, when they go forward from
   * 02:00 to 03:00.
   */
  readonly change?: "fall" | "spring";
}

/**
 * A week in New York, Monday to Sunday, with a DST change on the Sunday. The calendar opens on the
 * Monday at noon.
 *
 * - `d1`–`d7` ("Daily", "Standup <date>"): 09:00–09:30 every day, the same on the wall clock
 *   before and after the change.
 * - `t1` ("Change", "In the changing hour"): in the fall, 01:30–02:00, the first of the two 01:30s;
 *   in the spring, 02:30, a time that doesn't exist, which starts at 03:30.
 * - `t2` ("Change", "Across the change"): 00:30–04:00 on the wall clock, 4½ hours in the fall and
 *   2½ in the spring.
 * - `a1` ("All day", "Weekend away"): Saturday to Monday.
 */
export function dstWeekFixture(options: DstWeekOptions = {}): CalendarFixture<FixtureEvent> {
  requireTemporal();
  const { change = "fall" } = options;
  if (change !== "fall" && change !== "spring") {
    throw new RangeError(
      `A DST week changes in the "fall" or the "spring", not ${JSON.stringify(change)}.`,
    );
  }
  const timeZone = "America/New_York";
  const sunday = Temporal.PlainDate.from(change === "fall" ? "2026-11-01" : "2026-03-08");
  const monday = sunday.subtract({ days: 6 });
  const environment = createTestEnvironment({
    anchorDate: monday,
    now: `${monday.toString()}T12:00`,
    timeZone,
  });
  const events: FixtureEvent[] = [
    ...sequence(7).map((index) => {
      const date = monday.add({ days: index }).toString();
      return buildEvent({
        data: { group: "Daily" },
        duration: { minutes: 30 },
        id: `d${index + 1}`,
        start: `${date}T09:00`,
        timeZone,
        title: `Standup ${date}`,
      });
    }),
    buildEvent({
      data: { group: "Change" },
      duration: { minutes: 30 },
      id: "t1",
      start: `${sunday.toString()}T${change === "fall" ? "01:30" : "02:30"}`,
      timeZone,
      title: "In the changing hour",
    }),
    buildEvent({
      data: { group: "Change" },
      end: `${sunday.toString()}T04:00`,
      id: "t2",
      start: `${sunday.toString()}T00:30`,
      timeZone,
      title: "Across the change",
    }),
    buildAllDayEvent({
      data: { group: "All day" },
      end: sunday.add({ days: 2 }),
      id: "a1",
      start: sunday.subtract({ days: 1 }),
      title: "Weekend away",
    }),
  ];
  return Object.freeze({ environment, events: Object.freeze(events) });
}

/**
 * Three series in three zones, for a calendar in UTC that opens on Monday 19 October 2026. Berlin's
 * clocks go back on 25 October and Los Angeles' on 1 November, so in the week of 26 October
 * Berlin's occurrences have moved an hour later in UTC and Los Angeles' haven't yet; each stays put
 * on its own wall clock. Tokyo has no DST.
 *
 * - `berlin-standup` ("Berlin", "Standup (Berlin)"): 09:00–09:15 in Berlin on weekdays, from
 *   Monday 19 October.
 * - `la-review` ("Los Angeles", "Review (Los Angeles)"): 10:00–11:00 in Los Angeles every Tuesday,
 *   from 20 October.
 * - `tokyo-check-in` ("Tokyo", "Check-in (Tokyo)"): 08:00–08:30 in Tokyo for ten days from Tuesday
 *   20 October, but not on the 24th; COUNT counts the skipped day, so nine occurrences.
 *
 * The masters are series, not events a calendar shows: expand them first.
 */
export function multiZoneSeriesFixture(): SeriesFixture<FixtureSeriesEvent> {
  requireTemporal();
  const environment = createTestEnvironment({
    anchorDate: "2026-10-19",
    now: "2026-10-19T07:00:00Z",
  });
  const series = [
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
      rule: "FREQ=WEEKLY;BYDAY=TU",
      start: "2026-10-20T10:00",
      timeZone: "America/Los_Angeles",
      title: "Review (Los Angeles)",
    }),
    buildRecurringEvent({
      data: { group: "Tokyo" },
      duration: { minutes: 30 },
      exceptionDates: ["2026-10-24"],
      id: "tokyo-check-in",
      rule: "FREQ=DAILY;COUNT=10",
      start: "2026-10-20T08:00",
      timeZone: "Asia/Tokyo",
      title: "Check-in (Tokyo)",
    }),
  ];
  return Object.freeze({ environment, series: Object.freeze(series) });
}

/**
 * Thursday 8 October 2026 for a team and two rooms, in UTC, with working hours from 09:00 to 18:00
 * on weekdays and the rooms' parent expanded.
 *
 * - Resources ("Team"): `ana` in Lisbon, `ben` in New York with his own hours, 08:00–16:00 there
 *   (12:00–20:00 UTC), and `chen` in Shanghai. ("Rooms"): `rooms`, the parent of `orchid` and
 *   `lotus`.
 * - `ana-1` "Design review" (Ana, 09:00–10:00), `ben-1` "Planning" (Ben, 14:00–16:00) and `chen-1`
 *   "Early sync" (Chen, 02:00–02:30), all "Work".
 * - `meet-1` "Interview" (Ana and Orchid, 11:00–12:00) and `meet-2` "All hands" (Ben, Chen and
 *   Lotus, 15:00–16:30), "Meeting".
 * - `open-1` "Unassigned task" (no resource, 10:00–11:00), and `leave-1` "Chen away" (Chen, all
 *   day).
 */
export function resourceDayFixture(): CalendarFixture<FixtureEvent, FixtureResource> {
  requireTemporal();
  const environment = createTestEnvironment({ now: "2026-10-08T08:00:00Z" });
  const weekdays: readonly IsoDayOfWeek[] = [1, 2, 3, 4, 5];
  const team = { group: "Team" };
  const rooms = { group: "Rooms" };
  const resources: FixtureResource[] = [
    buildResource({ data: team, id: "ana", timeZone: "Europe/Lisbon", title: "Ana" }),
    buildResource({
      availability: buildAvailability({ days: weekdays, hours: "08:00-16:00" }),
      data: team,
      id: "ben",
      timeZone: "America/New_York",
      title: "Ben",
    }),
    buildResource({ data: team, id: "chen", timeZone: "Asia/Shanghai", title: "Chen" }),
    buildResource({ data: rooms, id: "rooms", title: "Rooms" }),
    buildResource({ data: rooms, id: "orchid", parentId: "rooms", title: "Orchid" }),
    buildResource({ data: rooms, id: "lotus", parentId: "rooms", title: "Lotus" }),
  ];
  const at = (time: string) => `2026-10-08T${time}Z`;
  const work = { group: "Work" };
  const meeting = { group: "Meeting" };
  const events: FixtureEvent[] = [
    buildEvent({
      data: work,
      id: "ana-1",
      resourceIds: ["ana"],
      start: at("09:00"),
      title: "Design review",
    }),
    buildEvent({
      data: work,
      duration: { hours: 2 },
      id: "ben-1",
      resourceIds: ["ben"],
      start: at("14:00"),
      title: "Planning",
    }),
    buildEvent({
      data: work,
      duration: { minutes: 30 },
      id: "chen-1",
      resourceIds: ["chen"],
      start: at("02:00"),
      title: "Early sync",
    }),
    buildEvent({
      data: meeting,
      id: "meet-1",
      resourceIds: ["ana", "orchid"],
      start: at("11:00"),
      title: "Interview",
    }),
    buildEvent({
      data: meeting,
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
    rootProps: Object.freeze({
      availability: buildAvailability({ hours: "09:00-18:00" }),
      defaultExpandedResourceIds: Object.freeze(["rooms"]),
    }),
  });
}
