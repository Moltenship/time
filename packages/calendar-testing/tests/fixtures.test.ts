import {
  createAvailabilitySnapshot,
  createCanonicalEventAdapter,
  createEventSnapshot,
  createResourceTree,
  instantInterval,
} from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
} from "@moltenship/calendar-recurrence";
import { afterEach, expect, test, vi } from "vite-plus/test";

import {
  denseDayFixture,
  dstWeekFixture,
  multiZoneSeriesFixture,
  resourceDayFixture,
} from "../src/index";

const adapter = createCanonicalEventAdapter<{ readonly group: string }>();
const at = (instant: string) => Temporal.Instant.from(instant);

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the dense day is 30 timed and 3 all-day events the calendar takes without issues", () => {
  const { environment, events } = denseDayFixture();
  const snapshot = createEventSnapshot(events, adapter);
  const during = (start: string, end: string) =>
    snapshot
      .queryTimed(instantInterval(at(start), at(end)))
      .map(({ id }) => id)
      .sort();

  expect(snapshot.issues).toEqual([]);
  expect(events.filter(({ kind }) => kind === "timed")).toHaveLength(30);
  expect(events.filter(({ kind }) => kind === "all-day")).toHaveLength(3);
  expect(new Set(events.map(({ id }) => id)).size).toBe(events.length);
  expect(environment.today.toString()).toBe("2026-10-08");
  // Five at once at 13:00, four at noon, and the back-to-back half hours overlap nothing.
  expect(during("2026-10-08T13:00:00Z", "2026-10-08T13:01:00Z")).toEqual([
    "l1",
    "s1",
    "s2",
    "s3",
    "s4",
  ]);
  expect(during("2026-10-08T12:00:00Z", "2026-10-08T12:01:00Z")).toEqual(["l1", "m1", "m2", "m3"]);
  expect(during("2026-10-08T09:10:00Z", "2026-10-08T09:20:00Z")).toEqual(["b3"]);
});

test("every call builds new records", () => {
  expect(denseDayFixture().events[0]).not.toBe(denseDayFixture().events[0]);
});

test("the fall DST week keeps 09:00 on the wall clock and has an event in the repeated hour", () => {
  const { environment, events } = dstWeekFixture();
  const startOf = (id: string) => {
    const event = events.find((candidate) => candidate.id === id);
    return event?.kind === "timed" ? event.start.toString() : undefined;
  };

  expect(environment.timeZone).toBe("America/New_York");
  expect(environment.anchorDate.toString()).toBe("2026-10-26");
  // 13:00Z in summer time, 14:00Z once the clocks go back on Sunday 1 November.
  expect(["d1", "d6", "d7"].map(startOf)).toEqual([
    "2026-10-26T13:00:00Z",
    "2026-10-31T13:00:00Z",
    "2026-11-01T14:00:00Z",
  ]);
  // The first 01:30, still in summer time; the span across the change is 4½ hours long.
  expect(startOf("t1")).toBe("2026-11-01T05:30:00Z");
  const across = events.find(({ id }) => id === "t2");
  expect(across?.kind === "timed" && across.start.until(across.end).total({ unit: "hours" })).toBe(
    4.5,
  );
});

test("the spring DST week has an event at a time that doesn't exist, which starts an hour later", () => {
  const { environment, events } = dstWeekFixture({ change: "spring" });
  const changing = events.find(({ id }) => id === "t1");
  const across = events.find(({ id }) => id === "t2");

  expect(environment.anchorDate.toString()).toBe("2026-03-02");
  // 02:30 is skipped: the event starts at 03:30 EDT.
  expect(changing?.kind === "timed" && changing.start.toString()).toBe("2026-03-08T07:30:00Z");
  expect(across?.kind === "timed" && across.start.until(across.end).total({ unit: "hours" })).toBe(
    2.5,
  );
  expect(createEventSnapshot(events, adapter).issues).toEqual([]);
  expect(() => dstWeekFixture({ change: "winter" as "fall" })).toThrow(/"fall" or the "spring"/);
});

test("the multi-zone series keep their wall clocks, which shift in UTC on different days", () => {
  const { series } = multiZoneSeriesFixture();
  const { issues, occurrences } = createOccurrenceExpander(
    createCanonicalRecurrenceAdapter<{ readonly group: string }>(),
  ).expand(series, {
    range: {
      end: Temporal.PlainDate.from("2026-11-07"),
      start: Temporal.PlainDate.from("2026-10-19"),
    },
    timeZone: "UTC",
  });
  const startsOf = (seriesId: string) =>
    occurrences
      .filter(({ recurrence }) => recurrence?.seriesId === seriesId)
      .map(({ interval }) => interval.start.toString());

  expect(issues).toEqual([]);
  // Berlin: 07:00Z before its change on 25 October, 08:00Z after.
  expect(startsOf("berlin-standup").slice(4, 6)).toEqual([
    "2026-10-23T07:00:00Z",
    "2026-10-26T08:00:00Z",
  ]);
  // Los Angeles: 17:00Z until its own change on 1 November, a week after Berlin's.
  expect(startsOf("la-review")).toEqual([
    "2026-10-20T17:00:00Z",
    "2026-10-27T17:00:00Z",
    "2026-11-03T18:00:00Z",
  ]);
  // Tokyo has no DST, and skips the 24th; COUNT counts it, so nine occurrences.
  expect(startsOf("tokyo-check-in")).toHaveLength(9);
  expect(startsOf("tokyo-check-in")[0]).toBe("2026-10-19T23:00:00Z");
  expect(startsOf("tokyo-check-in")).not.toContain("2026-10-23T23:00:00Z");
});

test("the resource day has a team in three zones, rooms under an expanded parent, and unassigned work", () => {
  const { events, resources = [], rootProps } = resourceDayFixture();
  const tree = createResourceTree(resources);
  const snapshot = createEventSnapshot(events, adapter);
  const hours = createAvailabilitySnapshot({ resources, timeZone: "UTC" }).forResource("ben");

  expect(snapshot.issues).toEqual([]);
  expect(tree.byId.get("orchid")?.parentId).toBe("rooms");
  expect(rootProps?.defaultExpandedResourceIds).toEqual(["rooms"]);
  expect(resources.filter(({ timeZone }) => timeZone !== undefined)).toHaveLength(3);
  expect(events.filter(({ resourceIds }) => resourceIds === undefined)).toHaveLength(1);
  expect(events.find(({ id }) => id === "meet-2")?.resourceIds).toEqual(["ben", "chen", "lotus"]);
  expect(rootProps?.availability?.weekly?.[0]?.days).toEqual([1, 2, 3, 4, 5]);
  // Ben's events are inside his own hours, 08:00–16:00 in New York.
  for (const id of ["ben-1", "meet-2"]) {
    const event = events.find((candidate) => candidate.id === id);
    if (event?.kind !== "timed") throw new Error(`${id} isn't timed`);
    expect(hours?.isAvailable(instantInterval(event.start, event.end)), id).toBe(true);
  }
});

test("without Temporal, fixtures say how to install it", () => {
  vi.stubGlobal("Temporal", undefined);

  expect(() => dstWeekFixture()).toThrow(/needs Temporal/);
});
