import { describe, expect, test } from "vite-plus/test";

import {
  anchorShowingDate,
  resolveViewLoadRange,
  scrollingMonthAnchor,
  scrollingMonthOf,
  scrollingMonthStrategy,
  scrollingTimeGridStrategy,
  type CalendarFocus,
  type CalendarNavigationCommand,
  type CalendarViewStrategy,
} from "../src/index";
import {
  dates,
  environment,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

const date = (value: string) => Temporal.PlainDate.from(value);
const snap = { increment: 15, smallestUnit: "minute" } as const;
/** Weeks start on Monday, as in most of Europe. */
const env = environment("UTC", { firstDay: 1 });

function span(range: { readonly end: Temporal.PlainDate; readonly start: Temporal.PlainDate }) {
  return `${range.start.toString()} → ${range.end.toString()}`;
}

type Strategy<TProjection> = CalendarViewStrategy<TProjection, unknown, FixtureEvent>;

function ranges<TProjection>(strategy: Strategy<TProjection>, anchor: string) {
  const range = strategy.getRange(date(anchor), env, undefined);
  return {
    load: span(resolveViewLoadRange(strategy, date(anchor), env, undefined, range)),
    range: span(range),
    // Intl separates ranges with thin spaces.
    title: strategy.getTitle(range, env, undefined).replace(/\s/g, " "),
  };
}

/** Projects the strategy's load range for `anchor` and steps keyboard navigation through it. */
function navigation<TProjection>(
  strategy: Strategy<TProjection>,
  anchor: string,
  today: string | null = null,
) {
  const range = strategy.getRange(date(anchor), env, undefined);
  const loadRange = resolveViewLoadRange(strategy, date(anchor), env, undefined, range);
  const projection = strategy.project(viewInput(snapshotOf([]), range, env, today, loadRange));
  return (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
    const result = strategy.getSpatialNavigation!({
      command,
      environment: env,
      focus,
      options: undefined,
      projection,
      range,
      snap,
    });
    if (result === null || "page" in result) return result;
    return result.focus.kind === "slot"
      ? `${result.focus.date.toString()}T${result.focus.time.toString({ smallestUnit: "minute" })}`
      : result.focus.date.toString();
  };
}

const day = (value: string): CalendarFocus => ({ date: date(value), kind: "day" });

describe("resolveViewLoadRange", () => {
  const range = dates("2026-10-05", "2026-10-12");

  test("is the visible range for a strategy without one", () => {
    expect(resolveViewLoadRange({}, date("2026-10-05"), env, undefined, range)).toBe(range);
  });

  test("rejects a load range that leaves out visible dates", () => {
    const strategy = { getLoadRange: () => dates("2026-10-06", "2026-10-20") };
    expect(() => resolveViewLoadRange(strategy, date("2026-10-05"), env, undefined, range)).toThrow(
      "view-load-range-must-contain-range",
    );
  });
});

describe("scrollingTimeGridStrategy", () => {
  const week = scrollingTimeGridStrategy<unknown, FixtureEvent>({ kind: "week" });
  const threeDays = scrollingTimeGridStrategy<unknown, FixtureEvent>({ count: 3, kind: "days" });
  const oneDay = scrollingTimeGridStrategy<unknown, FixtureEvent>({ count: 1, kind: "days" });

  test("shows the anchor's week, or days from the anchor, and loads a page on each side", () => {
    expect(ranges(week, "2026-10-07")).toEqual({
      load: "2026-09-28 → 2026-10-19",
      range: "2026-10-05 → 2026-10-12",
      title: "Oct 5 – 11, 2026",
    });
    expect(ranges(threeDays, "2026-10-07")).toEqual({
      load: "2026-10-04 → 2026-10-13",
      range: "2026-10-07 → 2026-10-10",
      title: "Oct 7 – 9, 2026",
    });
    expect(ranges(oneDay, "2026-10-08")).toEqual({
      load: "2026-10-07 → 2026-10-10",
      range: "2026-10-08 → 2026-10-09",
      title: "October 8, 2026",
    });
  });

  test("pages by its span", () => {
    expect(week.navigate(date("2026-10-07"), 1, undefined).toString()).toBe("2026-10-14");
    expect(week.navigate(date("2026-10-07"), -1, undefined).toString()).toBe("2026-09-30");
    expect(threeDays.navigate(date("2026-10-07"), 1, undefined).toString()).toBe("2026-10-10");
    expect(oneDay.navigate(date("2026-10-08"), -1, undefined).toString()).toBe("2026-10-07");
  });

  test("rejects day counts outside one to seven", () => {
    for (const count of [0, 8, 2.5]) {
      expect(() => scrollingTimeGridStrategy({ count, kind: "days" })).toThrow(
        "invalid-time-grid-day-count",
      );
    }
  });

  test("projects every loaded day, events included", () => {
    const range = week.getRange(date("2026-10-07"), env, undefined);
    const loadRange = resolveViewLoadRange(week, date("2026-10-07"), env, undefined, range);
    const projection = week.project(
      viewInput(
        snapshotOf([timed("before", "2026-10-01T09:00Z", "2026-10-01T10:00Z")]),
        range,
        env,
        null,
        loadRange,
      ),
    );

    expect(projection.days).toHaveLength(21);
    expect(projection.days[0]!.column.date.toString()).toBe("2026-09-28");
    expect(projection.days[3]!.events.map(({ fragment }) => fragment.event.id)).toEqual(["before"]);
    expect(projection.allDay.range.start.toString()).toBe("2026-09-28");
  });

  test("projects only the visible days for a caller that passes no load range", () => {
    const range = week.getRange(date("2026-10-07"), env, undefined);
    const { loadRange: _, ...input } = viewInput(snapshotOf([]), range, env);

    expect(week.project(input).days).toHaveLength(7);
    expect(scrollingMonthStrategy<unknown, FixtureEvent>().project(input).weeks).toHaveLength(1);
  });

  test("keyboard focus enters and moves through the visible days only", () => {
    // Today is loaded but not visible, so focus enters on the first visible day.
    const step = navigation(week, "2026-10-07", "2026-10-03");

    expect(step("home", null)).toBe("2026-10-05");
    expect(step("end", null)).toBe("2026-10-11");
    expect(step("home", day("2026-10-08"))).toBe("2026-10-05");
    expect(step("end", day("2026-10-08"))).toBe("2026-10-11");
    // Past either end, focus goes to the neighbouring day, which the calendar then reveals.
    expect(step("right", day("2026-10-11"))).toBe("2026-10-12");
    expect(step("left", day("2026-10-05"))).toBe("2026-10-04");
    expect(step("page-down", day("2026-10-07"))).toBe("2026-10-14");
  });

  test("enters on today when it is visible", () => {
    expect(navigation(week, "2026-10-07", "2026-10-09")("home", null)).toBe("2026-10-09");
  });

  test("reveals a date a whole page at a time, keeping to the span's pages", () => {
    const shows = (strategy: typeof week, anchor: string, target: string) =>
      strategy.getRange(
        anchorShowingDate(strategy, date(anchor), date(target), env, undefined),
        env,
        undefined,
      );

    expect(span(shows(week, "2026-10-07", "2026-10-14"))).toBe("2026-10-12 → 2026-10-19");
    expect(span(shows(week, "2026-10-07", "2026-10-02"))).toBe("2026-09-28 → 2026-10-05");
    expect(span(shows(threeDays, "2026-10-07", "2026-10-12"))).toBe("2026-10-10 → 2026-10-13");
    expect(span(shows(threeDays, "2026-10-07", "2026-10-05"))).toBe("2026-10-04 → 2026-10-07");
  });
});

describe("scrollingMonthStrategy", () => {
  const month = scrollingMonthStrategy<unknown, FixtureEvent>();

  test("shows six weeks from the week of its month's first day, and loads six each way", () => {
    // October 1, 2026 is a Thursday, in the week from Monday September 28.
    expect(ranges(month, "2026-10-08")).toEqual({
      load: "2026-08-17 → 2026-12-21",
      range: "2026-09-28 → 2026-11-09",
      title: "October 2026",
    });
    expect(ranges(month, "2026-10-31").range).toBe("2026-09-28 → 2026-11-09");
  });

  test("anchors a swipe on the month its first row holds the first day of", () => {
    expect(scrollingMonthAnchor(date("2026-10-26")).toString()).toBe("2026-11-01");
    expect(scrollingMonthAnchor(date("2026-09-28")).toString()).toBe("2026-10-01");
    expect(scrollingMonthOf(dates("2026-10-26", "2026-12-07")).toString()).toBe("2026-11-01");
  });

  test("moves a month at a time", () => {
    expect(month.navigate(date("2026-10-08"), 1, undefined).toString()).toBe("2026-11-01");
    expect(month.navigate(date("2026-10-08"), -1, undefined).toString()).toBe("2026-09-01");
    // November 1 is a Sunday, so November's first row starts in October.
    expect(ranges(month, "2026-11-01").range).toBe("2026-10-26 → 2026-12-07");
  });

  test("takes its row count", () => {
    expect(ranges(scrollingMonthStrategy<unknown, FixtureEvent>(8), "2026-10-08")).toEqual({
      load: "2026-08-03 → 2027-01-18",
      range: "2026-09-28 → 2026-11-23",
      title: "October 2026",
    });
    // Fewer than six rows leave a long month's last week on no page.
    for (const weeks of [0, 5, 13, 1.5]) {
      expect(() => scrollingMonthStrategy(weeks)).toThrow("invalid-scrolling-month-week-count");
    }
  });

  test("projects the loaded weeks, with the named month's days in the month", () => {
    const range = month.getRange(date("2026-10-08"), env, undefined);
    const loadRange = resolveViewLoadRange(month, date("2026-10-08"), env, undefined, range);
    const { weeks } = month.project(viewInput(snapshotOf([]), range, env, null, loadRange));

    expect(weeks).toHaveLength(18);
    const days = weeks.flatMap((week) => week.days);
    expect(days.filter(({ inMonth }) => inMonth).map(({ date }) => date.day)).toEqual(
      Array.from({ length: 31 }, (_, index) => index + 1),
    );
  });

  test("keyboard focus enters on a visible day of the named month", () => {
    // Today, August 20, is loaded but not visible.
    const step = navigation(month, "2026-10-08", "2026-08-20");

    expect(step("home", null)).toBe("2026-10-01");
    expect(step("end", null)).toBe("2026-10-31");
    expect(navigation(month, "2026-10-08", "2026-09-29")("home", null)).toBe("2026-09-29");
    expect(step("down", day("2026-10-29"))).toBe("2026-11-05");
  });

  test("reveals a date by whole months", () => {
    expect(
      anchorShowingDate(month, date("2026-10-08"), date("2026-11-12"), env, undefined).toString(),
    ).toBe("2026-11-01");
  });
});
