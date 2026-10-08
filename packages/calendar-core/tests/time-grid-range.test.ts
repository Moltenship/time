import { describe, expect, test } from "vite-plus/test";

import {
  navigateTimeGrid,
  timeGridRange,
  timeGridTitle,
  type CalendarWeekRules,
  type IsoDayOfWeek,
  type TimeGridSpan,
} from "../src/index";

const week: TimeGridSpan = { kind: "week" };
const day: TimeGridSpan = { count: 1, kind: "days" };
const anchor = Temporal.PlainDate.from("2026-10-08");

function weekRules(firstDay: IsoDayOfWeek): CalendarWeekRules {
  return { firstDay, minimalDays: 1, weekend: [6, 7] };
}

function dates(span: TimeGridSpan, firstDay: IsoDayOfWeek = 1): string {
  const range = timeGridRange(anchor, span, weekRules(firstDay));
  return `${range.start.toString()}/${range.end.toString()}`;
}

describe("time-grid range and navigation", () => {
  test("aligns a week to the configured first day", () => {
    expect(dates(week, 1)).toBe("2026-10-05/2026-10-12");
    expect(dates(week, 7)).toBe("2026-10-04/2026-10-11");
    expect(dates(week, 6)).toBe("2026-10-03/2026-10-10");
  });

  test("starts day and N-day ranges at the anchor", () => {
    expect(dates(day)).toBe("2026-10-08/2026-10-09");
    expect(dates({ count: 3, kind: "days" })).toBe("2026-10-08/2026-10-11");
  });

  test("navigates by one whole span", () => {
    expect(navigateTimeGrid(anchor, 1, day).toString()).toBe("2026-10-09");
    expect(navigateTimeGrid(anchor, -1, week).toString()).toBe("2026-10-01");
    expect(navigateTimeGrid(anchor, 1, { count: 4, kind: "days" }).toString()).toBe("2026-10-12");
  });

  test("rejects day counts outside one to seven", () => {
    for (const count of [0, 8, 1.5]) {
      expect(() => timeGridRange(anchor, { count, kind: "days" }, weekRules(1))).toThrow(
        "invalid-time-grid-day-count",
      );
      expect(() => navigateTimeGrid(anchor, 1, { count, kind: "days" })).toThrow(
        "invalid-time-grid-day-count",
      );
    }
  });
});

describe("time-grid titles", () => {
  function title(start: string, days: number, locale = "en-US"): string {
    const from = Temporal.PlainDate.from(start);
    return timeGridTitle(timeGridRange(from, { count: days, kind: "days" }, weekRules(1)), locale);
  }

  test("formats one day in full and several days as a compact range", () => {
    expect(title("2026-10-08", 1)).toBe("October 8, 2026");
    expect(title("2026-10-06", 7)).toBe("Oct 6\u2009–\u200912, 2026");
    expect(title("2026-09-28", 7)).toBe("Sep 28\u2009–\u2009Oct 4, 2026");
    expect(title("2026-12-28", 7)).toBe("Dec 28, 2026\u2009–\u2009Jan 3, 2027");
  });

  test("follows the locale", () => {
    expect(title("2026-10-06", 7, "de-DE")).toBe("6.–12. Okt. 2026");
    expect(title("2026-10-08", 1, "en-GB")).toBe("8 October 2026");
  });
});
