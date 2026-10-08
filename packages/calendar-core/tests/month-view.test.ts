import { describe, expect, test } from "vite-plus/test";

import {
  getMonthRange,
  getMonthTitle,
  navigateMonth,
  projectMonth,
  type CalendarEnvironmentBase,
  type DayGridSegment,
  type EventId,
  type IsoDayOfWeek,
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

const october = Temporal.PlainDate.from("2026-10-08");

function rangeOf(anchor: Temporal.PlainDate, firstDay: IsoDayOfWeek) {
  const range = getMonthRange(anchor, environment("UTC", { firstDay }));
  return `${range.start.toString()} → ${range.end.toString()}`;
}

function project(
  events: readonly FixtureEvent[],
  env: CalendarEnvironmentBase,
  { anchor = october, today = null }: { anchor?: Temporal.PlainDate; today?: string | null } = {},
) {
  return projectMonth(viewInput(snapshotOf(events), getMonthRange(anchor, env), env, today));
}

function describeSegment(segment: DayGridSegment<unknown, EventId, ResourceId>): string {
  return `${segment.startsBefore ? "<" : ""}${segment.event.id}@${segment.lane}:${segment.column}+${segment.span}${segment.endsAfter ? ">" : ""}`;
}

describe("month range, navigation, and title", () => {
  test("covers whole weeks for Monday, Sunday, and Saturday week starts", () => {
    expect(rangeOf(october, 1)).toBe("2026-09-28 → 2026-11-02");
    expect(rangeOf(october, 7)).toBe("2026-09-27 → 2026-11-01");
    expect(rangeOf(october, 6)).toBe("2026-09-26 → 2026-11-07");
    expect(rangeOf(Temporal.PlainDate.from("2026-02-14"), 7)).toBe("2026-02-01 → 2026-03-01");
  });

  test("navigates by whole months, constraining the day", () => {
    expect(navigateMonth(Temporal.PlainDate.from("2026-01-31"), 1).toString()).toBe("2026-02-28");
    expect(navigateMonth(Temporal.PlainDate.from("2026-03-31"), -1).toString()).toBe("2026-02-28");
    expect(navigateMonth(Temporal.PlainDate.from("2026-12-15"), 1).toString()).toBe("2027-01-15");
  });

  test("titles the anchored month even when the grid starts in the previous month", () => {
    const env = environment("UTC", { firstDay: 6 });
    const range = getMonthRange(october, env);

    expect(getMonthTitle(range, env)).toBe("October 2026");
    expect(getMonthTitle(range, { ...env, locale: "de-DE" })).toBe("Oktober 2026");
  });
});

describe("month projection", () => {
  const events = [
    allDay("before-grid", "2026-09-20", "2026-09-21"),
    allDay("trip", "2026-10-02", "2026-10-06"),
    timed("redeye", "2026-10-09T02:00Z", "2026-10-09T06:00Z"),
    timed("lunch", "2026-10-08T16:00Z", "2026-10-08T17:00Z"),
    timed("standup", "2026-10-08T13:30Z", "2026-10-08T14:00Z"),
    floating("yoga", "2026-10-08T07:00", "2026-10-08T08:00"),
    allDay("holiday", "2026-10-12", "2026-10-13"),
  ];
  const env = environment("America/New_York", { firstDay: 1 });

  test("packs every week of October 2026 (golden)", () => {
    const month = project(events, env);

    expect(month.weeks.map((week) => week.segments.map(describeSegment))).toEqual([
      ["trip@0:4+3>"],
      ["<trip@0:0+1", "redeye@0:3+2", "yoga@1:3+1", "standup@2:3+1", "lunch@3:3+1"],
      ["holiday@0:0+1"],
      [],
      [],
    ]);
    expect(month.weeks.map((week) => week.laneCount)).toEqual([1, 4, 1, 0, 0]);
  });

  test("marks out-of-month days and the root's today", () => {
    const month = project([], env, { today: "2026-10-08" });
    const days = month.weeks.flatMap((week) => week.days);

    expect(days.filter((day) => !day.inMonth).map((day) => day.date.toString())).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-11-01",
    ]);
    expect(days.filter((day) => day.isToday).map((day) => day.date.toString())).toEqual([
      "2026-10-08",
    ]);
    expect(
      project([], env)
        .weeks.flatMap((week) => week.days)
        .some((day) => day.isToday),
    ).toBe(false);
  });

  test("splits a bar around a date the zone skipped", () => {
    const month = project(
      [timed("hop", "2011-12-30T09:30Z", "2011-12-30T10:30Z")],
      environment("Pacific/Apia"),
      {
        anchor: Temporal.PlainDate.from("2011-12-01"),
      },
    );

    expect(month.weeks.at(-1)?.segments.map(describeSegment)).toEqual(["hop@0:4+1>", "<hop@0:6+1"]);
  });

  test("lanes of a week survive changes to events in other weeks", () => {
    const lanes = (snapshotEvents: readonly FixtureEvent[]) =>
      project(snapshotEvents, env).weeks[1]!.segments.map(describeSegment);

    expect(
      lanes([
        ...events.filter((event) => event.id !== "holiday"),
        { ...allDay("holiday", "2026-10-13", "2026-10-15"), title: "Moved" },
        allDay("later", "2026-10-20", "2026-10-23"),
      ]),
    ).toEqual(lanes(events));
  });
});
