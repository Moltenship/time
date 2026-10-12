import { describe, expect, test } from "vite-plus/test";

import {
  anchorShowingDate,
  resolveViewLoadRange,
  scrollingListStrategy,
  type CalendarFocus,
  type CalendarNavigationCommand,
  type ListViewOptions,
} from "../src/index";
import { environment, snapshotOf, timed, viewInput, type FixtureEvent } from "./view-fixtures";

const date = (value: string) => Temporal.PlainDate.from(value);
const env = environment("UTC", { firstDay: 1 });
const strategy = scrollingListStrategy<ListViewOptions, FixtureEvent>();

function span(range: { readonly end: Temporal.PlainDate; readonly start: Temporal.PlainDate }) {
  return `${range.start.toString()} → ${range.end.toString()}`;
}

function ranges(anchor: string, options: ListViewOptions = {}) {
  const range = strategy.getRange(date(anchor), env, options);
  return {
    load: span(resolveViewLoadRange(strategy, date(anchor), env, options, range)),
    range: span(range),
    title: strategy.getTitle(range, env, options),
  };
}

const events = [
  timed("before", "2026-09-30T09:00:00Z", "2026-09-30T10:00:00Z"),
  timed("standup", "2026-10-07T09:00:00Z", "2026-10-07T09:15:00Z"),
  timed("review", "2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z"),
  timed("after", "2026-11-10T09:00:00Z", "2026-11-10T10:00:00Z"),
];

/** Projects the load range for `anchor` and steps keyboard navigation through it. */
function navigation(anchor: string) {
  const options = {};
  const range = strategy.getRange(date(anchor), env, options);
  const loadRange = resolveViewLoadRange(strategy, date(anchor), env, options, range);
  const projection = strategy.project({
    ...viewInput(snapshotOf(events), range, env, null, loadRange),
    options,
  });
  return {
    days: projection.days.map((day) => day.date.toString()),
    navigate: (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
      const result = strategy.getSpatialNavigation!({
        command,
        environment: env,
        focus,
        options,
        projection,
        range,
        snap: { increment: 15, smallestUnit: "minute" },
      });
      if (result === null) return null;
      if ("page" in result) return `page ${result.page}`;
      const { focus: next } = result;
      return next.kind === "event"
        ? `${next.eventId}@${next.date.toString()}`
        : next.date.toString();
    },
  };
}

const item = (eventId: string, value: string): CalendarFocus => ({
  date: date(value),
  eventId,
  kind: "event",
});

describe("scrolling agenda", () => {
  test("shows weeks from the anchor date and loads as many either way", () => {
    expect(ranges("2026-10-07")).toEqual({
      load: "2026-09-09 → 2026-12-02",
      range: "2026-10-07 → 2026-11-04",
      title: "Oct 7 – Nov 3, 2026",
    });
    // Any day, not only a week's first, starts the range: the list rests on whichever is on top.
    expect(ranges("2026-10-10", { weeks: 1 })).toEqual({
      load: "2026-10-03 → 2026-10-24",
      range: "2026-10-10 → 2026-10-17",
      title: "Oct 10 – 16, 2026",
    });
  });

  test("moves a page at a time and rejects a bad length", () => {
    expect(strategy.navigate(date("2026-10-07"), 1, {}).toString()).toBe("2026-11-04");
    expect(strategy.navigate(date("2026-10-07"), -1, { weeks: 2 }).toString()).toBe("2026-09-23");
    expect(() => strategy.getRange(date("2026-10-07"), env, { weeks: 0 })).toThrow(
      "invalid-list-weeks",
    );
  });

  test("projects every day of the load range that has events", () => {
    expect(navigation("2026-10-07").days).toEqual([
      "2026-09-30",
      "2026-10-07",
      "2026-10-20",
      "2026-11-10",
    ]);
  });

  test("keys move through the range's events and page past its ends", () => {
    const { navigate } = navigation("2026-10-07");

    expect(navigate("home", null)).toBe("standup@2026-10-07");
    expect(navigate("end", null)).toBe("review@2026-10-20");
    expect(navigate("down", item("standup", "2026-10-07"))).toBe("review@2026-10-20");
    // The events loaded beyond the range are reached by paging, which scrolls the view on.
    expect(navigate("down", item("review", "2026-10-20"))).toBe("page 1");
    expect(navigate("up", item("standup", "2026-10-07"))).toBe("page -1");
  });

  test("enters a range without events at its first date, whatever is loaded around it", () => {
    const { days, navigate } = navigation("2026-11-11");

    // October 20 and November 10 are loaded, but nothing falls in the four weeks from November 11.
    expect(days).toEqual(["2026-10-20", "2026-11-10"]);
    expect(navigate("home", null)).toBe("2026-11-11");
    expect(navigate("down", { date: date("2026-11-11"), kind: "day" })).toBe("page 1");
  });

  test("pages so the next range starts where this one ends", () => {
    const anchor = date("2026-10-07");
    const next = strategy.navigate(anchor, 1, {});

    expect(strategy.getRange(next, env, {}).start).toEqual(strategy.getRange(anchor, env, {}).end);
    expect(anchorShowingDate(strategy, anchor, date("2026-11-10"), env, {}).toString()).toBe(
      "2026-11-04",
    );
  });
});
