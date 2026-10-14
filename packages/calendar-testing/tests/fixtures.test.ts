import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  createResourceTree,
  instantInterval,
} from "@moltenship/calendar";
import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceExpander,
} from "@moltenship/calendar-recurrence";
import { expect, test } from "vite-plus/test";

import {
  denseDayFixture,
  dstWeekFixture,
  multiZoneSeriesFixture,
  resourceDayFixture,
} from "../src/index";

const adapter = createCanonicalEventAdapter<{ readonly group: string }>();

test("the dense day is 30 timed and 3 all-day events the calendar takes without issues", () => {
  const { environment, events } = denseDayFixture();
  const snapshot = createEventSnapshot(events, adapter);

  expect(snapshot.issues).toEqual([]);
  expect(events.filter(({ kind }) => kind === "timed")).toHaveLength(30);
  expect(events.filter(({ kind }) => kind === "all-day")).toHaveLength(3);
  expect(new Set(events.map(({ id }) => id)).size).toBe(events.length);
  expect(environment.today.toString()).toBe("2026-10-08");
  // Four at once at 13:00.
  expect(
    snapshot.queryTimed(
      instantInterval(
        Temporal.Instant.from("2026-10-08T13:00:00Z"),
        Temporal.Instant.from("2026-10-08T13:01:00Z"),
      ),
    ).length,
  ).toBeGreaterThanOrEqual(4);
});

test("every call builds new records", () => {
  expect(denseDayFixture().events[0]).not.toBe(denseDayFixture().events[0]);
});

test("the fall DST week keeps 09:00 on the wall clock and has an event in the repeated hour", () => {
  const { environment, events } = dstWeekFixture();
  const starts = events
    .filter(({ id }) => id.startsWith("d"))
    .map((event) => (event.kind === "timed" ? event.start.toString() : ""));

  expect(environment.timeZone).toBe("America/New_York");
  expect(environment.anchorDate.toString()).toBe("2026-10-26");
  // 13:00Z in summer time, 14:00Z once the clocks go back on Sunday 1 November.
  expect(starts).toEqual([
    "2026-10-26T13:00:00Z",
    "2026-10-27T13:00:00Z",
    "2026-10-28T13:00:00Z",
    "2026-10-29T13:00:00Z",
    "2026-10-30T13:00:00Z",
    "2026-10-31T13:00:00Z",
    "2026-11-01T14:00:00Z",
  ]);
  // The first 01:30, still in summer time, and a span across the change that's 4½ hours long.
  const changing = events.find(({ id }) => id === "t1");
  const across = events.find(({ id }) => id === "t2");
  expect(changing?.kind === "timed" && changing.start.toString()).toBe("2026-11-01T05:30:00Z");
  expect(across?.kind === "timed" && across.start.until(across.end).total({ unit: "hours" })).toBe(
    4.5,
  );
});

test("the spring DST week skips an hour", () => {
  const { events } = dstWeekFixture("spring");
  const across = events.find(({ id }) => id === "t2");

  expect(across?.kind === "timed" && across.start.until(across.end).total({ unit: "hours" })).toBe(
    2.5,
  );
  expect(createEventSnapshot(events, adapter).issues).toEqual([]);
});

test("the multi-zone series keep their wall clocks, which shift in UTC on different days", () => {
  const { events } = multiZoneSeriesFixture();
  const { issues, occurrences } = createOccurrenceExpander(
    createCanonicalRecurrenceAdapter<{ readonly group: string }>(),
  ).expand(events, {
    range: {
      end: Temporal.PlainDate.from("2026-11-07"),
      start: Temporal.PlainDate.from("2026-10-18"),
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
  // Los Angeles' first Tuesday of November is after its own change on 1 November: 18:00Z.
  expect(startsOf("la-review")).toEqual(["2026-11-03T18:00:00Z"]);
  // Tokyo has no DST, and skips the 24th; COUNT counts it, so nine occurrences.
  expect(startsOf("tokyo-check-in")).toHaveLength(9);
  expect(startsOf("tokyo-check-in")).not.toContain("2026-10-23T23:00:00Z");
});

test("the resource day has a team in three zones, rooms under a parent, and unassigned work", () => {
  const { events, resources = [], rootProps } = resourceDayFixture();
  const tree = createResourceTree(resources);
  const snapshot = createEventSnapshot(events, adapter);

  expect(snapshot.issues).toEqual([]);
  expect(tree.byId.get("orchid")?.parentId).toBe("rooms");
  expect(resources.filter(({ timeZone }) => timeZone !== undefined)).toHaveLength(3);
  expect(events.filter(({ resourceIds }) => resourceIds === undefined)).toHaveLength(1);
  expect(events.find(({ id }) => id === "meet-2")?.resourceIds).toEqual(["ben", "chen", "lotus"]);
  expect(rootProps?.availability?.weekly?.[0]?.days).toEqual([1, 2, 3, 4, 5]);
});
