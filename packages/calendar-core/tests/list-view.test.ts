import { describe, expect, test } from "vite-plus/test";

import {
  getListRange,
  getListTitle,
  navigateList,
  projectList,
  type CalendarEnvironmentBase,
  type EventId,
  type ListDay,
  type ListViewOptions,
  type ResourceId,
} from "../src/index";
import {
  allDay,
  environment,
  floating,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

const anchor = Temporal.PlainDate.from("2026-10-08");

function rangeOf(env = environment("UTC"), weeks?: number) {
  const range = getListRange(anchor, env, { weeks });
  return `${range.start.toString()} → ${range.end.toString()}`;
}

function project(
  events: readonly FixtureEvent[],
  env: CalendarEnvironmentBase,
  {
    at = anchor,
    options = {},
    today = null,
  }: { at?: Temporal.PlainDate; options?: ListViewOptions; today?: string | null } = {},
) {
  return projectList(viewInput(snapshotOf(events), getListRange(at, env, options), env, today));
}

function describeDay(day: ListDay<unknown, EventId, ResourceId>): string {
  const items = day.items.map((item) =>
    item.dayCount > 1 ? `${item.event.id} ${item.dayIndex}/${item.dayCount}` : item.event.id,
  );
  return `${day.date.toString()}${day.isToday ? " (today)" : ""}: ${items.join(", ")}`;
}

describe("list range, navigation, and title", () => {
  test("defaults to four weeks starting with the anchor's week", () => {
    expect(rangeOf()).toBe("2026-10-04 → 2026-11-01");
    expect(rangeOf(environment("UTC", { firstDay: 1 }))).toBe("2026-10-05 → 2026-11-02");
    expect(rangeOf(environment("UTC"), 1)).toBe("2026-10-04 → 2026-10-11");
  });

  test("rejects a non-positive or fractional length", () => {
    expect(() => rangeOf(environment("UTC"), 0)).toThrow("invalid-list-weeks");
    expect(() => navigateList(anchor, 1, { weeks: 1.5 })).toThrow("invalid-list-weeks");
  });

  test("navigates by the configured length", () => {
    expect(navigateList(anchor, 1).toString()).toBe("2026-11-05");
    expect(navigateList(anchor, -1, { weeks: 1 }).toString()).toBe("2026-10-01");
  });

  test("titles the inclusive date range", () => {
    const env = environment("UTC");

    expect(getListTitle(getListRange(anchor, env), env)).toBe("Oct 4 – 31, 2026");
  });
});

describe("list projection", () => {
  test("groups event days, all-day first, then by start, flagging multi-day items (golden)", () => {
    const events = [
      timed("redeye", "2026-10-09T02:00Z", "2026-10-09T06:00Z"),
      timed("standup", "2026-10-08T13:30Z", "2026-10-08T14:00Z"),
      floating("yoga", "2026-10-08T07:00", "2026-10-08T08:00"),
      allDay("conference", "2026-10-06", "2026-10-09"),
      timed("dinner", "2026-10-06T23:00Z", "2026-10-07T01:00Z"),
      allDay("before", "2026-10-01", "2026-10-05"),
      allDay("holiday", "2026-10-09", "2026-10-10"),
      allDay("after", "2026-10-11", "2026-10-12"),
    ];
    const list = project(events, environment("America/New_York"), {
      options: { weeks: 1 },
      today: "2026-10-08",
    });

    expect(list.days.map(describeDay)).toEqual([
      "2026-10-04: before 4/4",
      "2026-10-06: conference 1/3, dinner",
      "2026-10-07: conference 2/3",
      "2026-10-08 (today): conference 3/3, yoga, standup, redeye 1/2",
      "2026-10-09: holiday, redeye 2/2",
    ]);
  });

  test("counts multi-day timed events in display-time-zone days", () => {
    const late = timed("late", "2026-06-30T22:30Z", "2026-06-30T23:30Z");
    const describe = (timeZone: string) =>
      project([late], environment(timeZone), {
        at: Temporal.PlainDate.from("2026-06-30"),
      }).days.map(describeDay);

    expect(describe("UTC")).toEqual(["2026-06-30: late"]);
    expect(describe("Europe/London")).toEqual(["2026-06-30: late 1/2", "2026-07-01: late 2/2"]);
  });

  test("does not count a date the zone skipped", () => {
    const hop = timed("hop", "2011-12-30T09:30Z", "2011-12-30T10:30Z");
    const list = project([hop], environment("Pacific/Apia"), {
      at: Temporal.PlainDate.from("2011-12-29"),
    });

    expect(list.days.map(describeDay)).toEqual(["2011-12-29: hop 1/2", "2011-12-31: hop 2/2"]);
  });

  test("returns no days when nothing is scheduled", () => {
    const list = project([], environment("UTC"));

    expect(list.days).toEqual([]);
    expect(list.range.start.toString()).toBe("2026-10-04");
    expect(list.range.end.toString()).toBe("2026-11-01");
  });
});
