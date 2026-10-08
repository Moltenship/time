import { describe, expect, test } from "vite-plus/test";

import {
  layoutDayGridRow,
  limitDayGridLanes,
  splitEventsByDay,
  type DayGridSegment,
} from "../src/index";
import { allDay, dates, snapshotOf, timed, type FixtureEvent } from "./view-fixtures";

// Sunday 2026-10-04 through Saturday 2026-10-10.
const week = dates("2026-10-04", "2026-10-11");

function layout(events: readonly FixtureEvent[], row = week) {
  const visible = dates("2026-09-27", "2026-10-18");
  const fragments = splitEventsByDay(snapshotOf(events).events, visible, "UTC");
  return layoutDayGridRow(row, fragments);
}

/** `id@lane:column+span`, with `<` / `>` marking continuation before / after the segment. */
function describeSegment(segment: DayGridSegment<unknown, string, string>): string {
  return `${segment.startsBefore ? "<" : ""}${segment.event.id}@${segment.lane}:${segment.column}+${segment.span}${segment.endsAfter ? ">" : ""}`;
}

const packedWeek = [
  allDay("conference", "2026-10-05", "2026-10-08"),
  allDay("holiday", "2026-10-05", "2026-10-06"),
  timed("standup", "2026-10-05T09:00Z", "2026-10-05T09:15Z"),
  timed("breakfast", "2026-10-05T08:00Z", "2026-10-05T09:00Z"),
  allDay("trip", "2026-10-06", "2026-10-10"),
  allDay("review", "2026-10-08", "2026-10-09"),
];

describe("day-grid layout", () => {
  test("splits spans at row boundaries with continuation flags", () => {
    const trip = allDay("trip", "2026-10-02", "2026-10-07");

    expect(layout([trip], dates("2026-09-27", "2026-10-04")).segments.map(describeSegment)).toEqual(
      ["trip@0:5+2>"],
    );
    expect(layout([trip]).segments.map(describeSegment)).toEqual(["<trip@0:0+3"]);
  });

  test("packs by start, longer span first, then all-day before timed by start time", () => {
    const row = layout(packedWeek);

    expect(row.segments.map(describeSegment)).toEqual([
      "conference@0:1+3",
      "holiday@1:1+1",
      "breakfast@2:1+1",
      "standup@3:1+1",
      "trip@1:2+4",
      "review@0:4+1",
    ]);
    expect(row.laneCount).toBe(4);
  });

  test("lanes do not depend on input order", () => {
    const lanes = (events: readonly FixtureEvent[]) =>
      layout(events).segments.map(describeSegment).sort();

    expect(lanes([...packedWeek].reverse())).toEqual(lanes(packedWeek));
  });

  test("unrelated events do not move existing lanes", () => {
    const before = layout(packedWeek).segments.map(describeSegment);
    const after = layout([
      ...packedWeek,
      allDay("next-week", "2026-10-12", "2026-10-14"),
      allDay("saturday", "2026-10-10", "2026-10-11"),
      timed("sunday", "2026-10-04T10:00Z", "2026-10-04T11:00Z"),
    ]).segments.map(describeSegment);

    expect(after).toEqual(expect.arrayContaining([...before, "saturday@0:6+1", "sunday@0:0+1"]));
    expect(after).toHaveLength(before.length + 2);
  });
});

describe("day-grid overflow", () => {
  const row = layout(packedWeek);
  const visibleIds = (maxLanes: number) =>
    limitDayGridLanes(row, maxLanes).segments.map((segment) => segment.event.id);

  test("shows everything when every day fits", () => {
    const overflow = limitDayGridLanes(row, 4);

    expect(overflow.segments).toEqual(row.segments);
    expect(overflow.hiddenCounts).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  test("reserves the last lane for '+N more' on days that do not fit", () => {
    expect(visibleIds(3)).toEqual(["conference", "holiday", "trip", "review"]);
    expect(limitDayGridLanes(row, 3).hiddenCounts).toEqual([0, 2, 0, 0, 0, 0, 0]);

    expect(visibleIds(2)).toEqual(["conference", "trip", "review"]);
    expect(limitDayGridLanes(row, 2).hiddenCounts).toEqual([0, 3, 0, 0, 0, 0, 0]);

    expect(visibleIds(1)).toEqual([]);
    expect(limitDayGridLanes(row, 1).hiddenCounts).toEqual([0, 4, 2, 2, 2, 1, 0]);
  });

  test("hides a span on every day when one of its days overflows", () => {
    const spanning = layout([
      allDay("long", "2026-10-04", "2026-10-07"),
      allDay("short", "2026-10-05", "2026-10-07"),
      allDay("monday", "2026-10-05", "2026-10-06"),
    ]);
    const overflow = limitDayGridLanes(spanning, 2);

    expect(spanning.segments.map(describeSegment)).toEqual([
      "long@0:0+3",
      "short@1:1+2",
      "monday@2:1+1",
    ]);
    expect(overflow.segments.map((segment) => segment.event.id)).toEqual(["long"]);
    // Tuesday shows "+1 more" in lane 1, which the hidden span leaves free.
    expect(overflow.hiddenCounts).toEqual([0, 2, 1, 0, 0, 0, 0]);
  });

  test("rejects lane limits below one", () => {
    expect(() => limitDayGridLanes(row, 0)).toThrow("invalid-max-lanes");
    expect(() => limitDayGridLanes(row, 1.5)).toThrow("invalid-max-lanes");
  });
});
