import { describe, expect, test } from "vite-plus/test";

import {
  createResourceTree,
  projectTimeGrid,
  resolveViewInstantRange,
  timeGridStrategy,
} from "../src/index";
import { allDay, dates, environment, floating, snapshotOf, timed } from "./view-fixtures";

const events = [
  allDay("holiday", "2026-10-06", "2026-10-07"),
  timed("conference", "2026-10-07T13:00Z", "2026-10-08T15:00Z"),
  timed("overnight", "2026-10-07T02:00Z", "2026-10-07T06:00Z"),
  timed("standup", "2026-10-08T13:00Z", "2026-10-08T13:15Z"),
  floating("focus", "2026-10-08T09:00", "2026-10-08T11:00"),
];

describe("time-grid projection", () => {
  const projection = projectTimeGrid({
    environment: environment("America/New_York"),
    range: dates("2026-10-04", "2026-10-11"),
    snapshot: snapshotOf(events),
    today: Temporal.PlainDate.from("2026-10-08"),
  });

  test("puts all-day events and events of a day or longer in the all-day row", () => {
    expect(
      projection.allDay.segments.map(({ column, event, lane, span }) => [
        event.id,
        column,
        span,
        lane,
      ]),
    ).toEqual([
      ["holiday", 2, 1, 0],
      ["conference", 3, 2, 0],
    ]);
  });

  test("positions shorter timed and floating events in their day columns", () => {
    const ids = projection.days.map(({ events: placed }) =>
      placed.map(({ fragment }) => fragment.event.id),
    );

    expect(projection.days.map(({ column }) => column.date.day)).toEqual([4, 5, 6, 7, 8, 9, 10]);
    expect(ids).toEqual([[], [], ["overnight"], ["overnight"], ["focus", "standup"], [], []]);
    expect(projection.days.map(({ isToday }) => isToday)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
  });
});

describe("time-grid strategy", () => {
  const week = timeGridStrategy({ kind: "week" });
  const day = timeGridStrategy({ count: 1, kind: "days" });
  const env = environment("UTC", { firstDay: 1 });
  const anchor = Temporal.PlainDate.from("2026-10-08");

  test("wires range, navigation, and title for week and day spans", () => {
    const range = week.getRange(anchor, env, undefined);

    expect(`${range.start.toString()}/${range.end.toString()}`).toBe("2026-10-05/2026-10-12");
    expect(week.navigate(anchor, -2, undefined).toString()).toBe("2026-09-24");
    expect(week.getTitle(range, env, undefined)).toBe("Oct 5 – 11, 2026");
    expect(day.getTitle(day.getRange(anchor, env, undefined), env, undefined)).toBe(
      "October 8, 2026",
    );
    expect(day.navigate(anchor, 1, undefined).toString()).toBe("2026-10-09");
  });

  test("projects the visible range without reading a clock when today is unknown", () => {
    const range = day.getRange(anchor, env, undefined);
    const projection = day.project({
      environment: env,
      expandedResourceIds: [],
      instantRange: resolveViewInstantRange(range, "UTC"),
      loadRange: range,
      options: undefined,
      range,
      resources: createResourceTree([]),
      snapshot: snapshotOf(events),
      today: null,
    });

    expect(projection.days).toHaveLength(1);
    expect(projection.days[0]!.isToday).toBe(false);
  });
});
