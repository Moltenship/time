import { describe, expect, test } from "vite-plus/test";

import {
  availabilityAt,
  busyAt,
  createAvailabilitySnapshot,
  createCanonicalEventAdapter,
  createEventSnapshot,
  projectTimelineAvailability,
  resourceStatusAt,
  timeGridColumns,
  type CalendarEvent,
} from "../src/index";
import { plainDateInterval } from "@moltenship/calendar-temporal";

type TestEvent = CalendarEvent<null, string, string>;

const newYork = "America/New_York";
const time = (value: string) => Temporal.PlainTime.from(value);
const date = (value: string) => Temporal.PlainDate.from(value);
const at = (value: string, zone = newYork) =>
  Temporal.ZonedDateTime.from(`${value}[${zone}]`).toInstant();
/** An instant as a wall time in New York, with its offset, for readable expectations. */
const wall = (instant: Temporal.Instant | null | undefined) =>
  instant?.toZonedDateTimeISO(newYork).toString({ timeZoneName: "never" }).slice(0, 25) ?? null;

const availability = createAvailabilitySnapshot({
  availability: {
    exceptions: [
      { date: date("2026-12-25"), label: "Christmas" },
      { date: date("2026-12-24"), hours: [{ end: time("12:00"), start: time("09:00") }] },
    ],
    weekly: [{ days: [1, 2, 3, 4, 5], end: time("17:00"), start: time("09:00") }],
  },
  resources: [{ id: "london", timeZone: "Europe/London" }],
  timeZone: newYork,
});

describe("availability at an instant", () => {
  test("inside working hours it says when they close", () => {
    const status = availabilityAt(availability, at("2026-10-08T10:00"));
    expect(status.available).toBe(true);
    expect(wall(status.available ? status.closesAt : null)).toBe("2026-10-08T17:00:00-04:00");
  });

  test("outside them it says why and when they open; the end of the hours is outside", () => {
    expect(availabilityAt(availability, at("2026-10-08T17:00"))).toMatchObject({
      available: false,
      reason: "outside-hours",
    });
    const weekend = availabilityAt(availability, at("2026-10-10T12:00"));
    expect(weekend).toMatchObject({ available: false, reason: "closed-day" });
    expect(wall(weekend.available ? null : weekend.opensAt)).toBe("2026-10-12T09:00:00-04:00");
  });

  test("an exception gives its label, and its own hours", () => {
    const christmas = availabilityAt(availability, at("2026-12-25T10:00"));
    expect(christmas).toMatchObject({ available: false, label: "Christmas", reason: "exception" });
    // The weekend follows, so the office opens on Monday.
    expect(wall(christmas.available ? null : christmas.opensAt)).toBe("2026-12-28T09:00:00-05:00");
    const eve = availabilityAt(availability, at("2026-12-24T11:00"));
    expect(wall(eve.available ? eve.closesAt : null)).toBe("2026-12-24T12:00:00-05:00");
    expect(availabilityAt(availability, at("2026-12-24T13:00"))).toMatchObject({
      available: false,
      reason: "outside-hours",
    });
  });

  test("a resource's hours are on its own time zone", () => {
    // 10:00 in New York is 15:00 in London, which closes at 17:00 London time.
    const london = availabilityAt(availability, at("2026-10-08T10:00"), "london");
    expect(wall(london.available ? london.closesAt : null)).toBe("2026-10-08T12:00:00-04:00");
    expect(availabilityAt(availability, at("2026-10-08T13:00"), "london").available).toBe(false);
  });

  test("across a change of offset it opens at the hours' wall time", () => {
    // US clocks spring forward on March 8, 2026.
    const friday = availabilityAt(availability, at("2026-03-06T18:00"));
    expect(wall(friday.available ? null : friday.opensAt)).toBe("2026-03-09T09:00:00-04:00");
  });

  test("without hours it is always open", () => {
    const open = createAvailabilitySnapshot({ timeZone: newYork });
    expect(availabilityAt(open, at("2026-10-10T03:00"))).toEqual({
      available: true,
      closesAt: null,
    });
  });
});

describe("closed time's reasons", () => {
  test("closed time splits where its reason changes, and opens only at its ends", () => {
    const columns = timeGridColumns(
      plainDateInterval(date("2026-12-24"), date("2026-12-29")),
      newYork,
    );
    const day = 1 / 5;
    expect(
      projectTimelineAvailability(columns, availability.calendar).map(
        ({ end, label, opensAfter, opensBefore, reason, start }) => [
          Math.round(start / (day / 24)),
          Math.round(end / (day / 24)),
          reason,
          label,
          opensBefore,
          opensAfter,
        ],
      ),
    ).toEqual([
      [0, 9, "outside-hours", undefined, false, true],
      [12, 24, "outside-hours", undefined, true, false],
      [24, 48, "exception", "Christmas", false, false],
      [48, 96, "closed-day", undefined, false, false],
      [96, 105, "outside-hours", undefined, false, true],
      [113, 120, "outside-hours", undefined, true, false],
    ]);
  });
});

function timed(id: string, start: string, end: string, resourceIds: string[] = []): TestEvent {
  return {
    data: null,
    end: at(end),
    id,
    kind: "timed",
    resourceIds,
    start: at(start),
    title: id,
  };
}

const events = createEventSnapshot<TestEvent, string, string>(
  [
    timed("standup", "2026-10-08T10:00", "2026-10-08T11:00", ["ana"]),
    timed("review", "2026-10-08T10:30", "2026-10-08T12:00", ["ana"]),
    timed("lunch", "2026-10-08T12:00", "2026-10-08T13:00", ["ana"]),
    timed("night", "2026-10-08T22:00", "2026-10-09T02:00", ["ben"]),
    {
      data: null,
      end: date("2026-10-13"),
      id: "offsite",
      kind: "all-day",
      resourceIds: ["cy"],
      start: date("2026-10-12"),
      title: "offsite",
    },
    timed("fall-back", "2026-11-01T01:30-04:00", "2026-11-01T01:15-05:00", ["dee"]),
  ],
  createCanonicalEventAdapter<null, string, string>(),
);
const ids = (status: ReturnType<typeof busyAt<TestEvent, string, string>>) =>
  status.busy ? status.events.map(({ id }) => id) : [];

describe("busy at an instant", () => {
  test("overlapping and back-to-back events keep a resource busy until the last ends", () => {
    const status = busyAt(events, at("2026-10-08T10:45"), { resourceId: "ana", timeZone: newYork });
    expect(ids(status)).toEqual(["standup", "review"]);
    expect(wall(status.busy ? status.freeAt : null)).toBe("2026-10-08T13:00:00-04:00");
    // An event's end is free.
    expect(
      busyAt(events, at("2026-10-08T13:00"), { resourceId: "ana", timeZone: newYork }),
    ).toEqual({ busy: false, nextEventAt: null });
  });

  test("before its events a resource is free until the next starts", () => {
    const status = busyAt(events, at("2026-10-08T09:00"), { resourceId: "ana", timeZone: newYork });
    expect(wall(status.busy ? null : status.nextEventAt)).toBe("2026-10-08T10:00:00-04:00");
    // Other resources' events don't count; without a resource, every event does.
    expect(
      busyAt(events, at("2026-10-08T10:15"), { resourceId: "ben", timeZone: newYork }).busy,
    ).toBe(false);
    expect(ids(busyAt(events, at("2026-10-08T23:00"), { timeZone: newYork }))).toEqual(["night"]);
  });

  test("an event crossing midnight is busy on both dates", () => {
    const status = busyAt(events, at("2026-10-09T01:00"), { resourceId: "ben", timeZone: newYork });
    expect(ids(status)).toEqual(["night"]);
    expect(wall(status.busy ? status.freeAt : null)).toBe("2026-10-09T02:00:00-04:00");
  });

  test("an all-day event fills its dates on the given wall clock", () => {
    const query = { resourceId: "cy", timeZone: newYork };
    expect(busyAt(events, at("2026-10-11T23:59"), query).busy).toBe(false);
    const status = busyAt(events, at("2026-10-12T15:00"), query);
    expect(ids(status)).toEqual(["offsite"]);
    expect(wall(status.busy ? status.freeAt : null)).toBe("2026-10-13T00:00:00-04:00");
    // In Tokyo that date starts and ends 13 hours earlier.
    const tokyo = busyAt(events, at("2026-10-12T10:00"), { ...query, timeZone: "Asia/Tokyo" });
    expect(wall(tokyo.busy ? tokyo.freeAt : null)).toBe("2026-10-12T11:00:00-04:00");
  });

  test("an event across a fall-back lasts its real length", () => {
    // 01:30 EDT to 01:15 EST is 45 minutes, through the repeated hour.
    const status = busyAt(events, at("2026-11-01T01:10-05:00"), {
      resourceId: "dee",
      timeZone: newYork,
    });
    expect(ids(status)).toEqual(["fall-back"]);
    expect(wall(status.busy ? status.freeAt : null)).toBe("2026-11-01T01:15:00-05:00");
  });
});

describe("a resource's status", () => {
  test("working hours and events stay apart, with the first instant either changes", () => {
    const status = resourceStatusAt(availability, events, at("2026-10-08T22:30"), {
      resourceId: "ben",
      timeZone: newYork,
    });
    expect(status.availability).toMatchObject({ available: false, reason: "outside-hours" });
    expect(ids(status.busy)).toEqual(["night"]);
    expect(wall(status.changesAt)).toBe("2026-10-09T02:00:00-04:00");
    // Between overlapping events the list changes when the first ends.
    const ana = resourceStatusAt(availability, events, at("2026-10-08T10:45"), {
      resourceId: "ana",
      timeZone: newYork,
    });
    expect(wall(ana.changesAt)).toBe("2026-10-08T11:00:00-04:00");
  });
});
