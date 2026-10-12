import { describe, expect, test } from "vite-plus/test";

import {
  getYearRange,
  getYearTitle,
  navigateYear,
  projectYear,
  yearSpatialNavigation,
  type CalendarEnvironmentBase,
  type CalendarFocus,
  type CalendarNavigationCommand,
  type EventId,
  type IsoDayOfWeek,
  type ResourceId,
  type YearMonth,
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
const snap = { increment: 15, smallestUnit: "minute" } as const;

function project(
  events: readonly FixtureEvent[] = [],
  {
    env = environment("UTC"),
    today = null,
  }: { readonly env?: CalendarEnvironmentBase; readonly today?: string | null } = {},
) {
  return projectYear(viewInput(snapshotOf(events), getYearRange(anchor), env, today));
}

/** A month's rows as day numbers, with `·` where the week leaves the month. */
function rows(month: YearMonth<unknown, EventId, ResourceId>): string[] {
  return month.weeks.map((week) =>
    week.days.map((day) => (day === null ? "·" : String(day.date.day))).join(" "),
  );
}

/** The events on a date, in display order. */
function eventsOn(projection: ReturnType<typeof project>, date: string): string[] {
  const target = Temporal.PlainDate.from(date);
  const month = projection.months[target.month - 1]!;
  const day = month.weeks.flatMap((week) => week.days).find((cell) => cell?.date.equals(target));
  return day?.fragments.map((fragment) => String(fragment.event.id)) ?? [];
}

describe("year range, navigation, and title", () => {
  test("covers the anchor's calendar year", () => {
    const range = getYearRange(anchor);
    expect(`${range.start.toString()} → ${range.end.toString()}`).toBe("2026-01-01 → 2027-01-01");
    expect(getYearRange(Temporal.PlainDate.from("2028-02-29")).start.toString()).toBe("2028-01-01");
  });

  test("navigates by whole years, constraining a leap day", () => {
    expect(navigateYear(anchor, 1).toString()).toBe("2027-10-08");
    expect(navigateYear(anchor, -2).toString()).toBe("2024-10-08");
    expect(navigateYear(Temporal.PlainDate.from("2028-02-29"), 1).toString()).toBe("2029-02-28");
  });

  test("titles the year in the calendar's locale", () => {
    const range = getYearRange(anchor);
    expect(getYearTitle(range, environment("UTC"))).toBe("2026");
    expect(getYearTitle(range, { ...environment("UTC"), locale: "ja-JP" })).toBe("2026年");
  });
});

describe("year projection", () => {
  test("projects twelve months of whole weeks, each date once", () => {
    const { months, range } = project();
    expect(months.map((month) => month.range.start.toString())).toEqual(
      Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}-01`),
    );
    expect(months.map((month) => month.weeks.length)).toEqual([5, 4, 5, 5, 6, 5, 5, 6, 5, 5, 5, 5]);
    // January 1, 2026 is a Thursday; weeks start on Sunday.
    expect(rows(months[0]!)).toEqual([
      "· · · · 1 2 3",
      "4 5 6 7 8 9 10",
      "11 12 13 14 15 16 17",
      "18 19 20 21 22 23 24",
      "25 26 27 28 29 30 31",
    ]);
    expect(months[0]!.weeks[0]!.range.start.toString()).toBe("2025-12-28");
    const dates = months.flatMap((month) =>
      month.weeks.flatMap((week) => week.days.flatMap((day) => (day === null ? [] : [day.date]))),
    );
    expect(dates).toHaveLength(365);
    expect(dates[0]!.equals(range.start)).toBe(true);
    expect(dates.at(-1)!.toString()).toBe("2026-12-31");
  });

  test.each([
    [
      1,
      [
        "· · · · · · 1",
        "2 3 4 5 6 7 8",
        "9 10 11 12 13 14 15",
        "16 17 18 19 20 21 22",
        "23 24 25 26 27 28 ·",
      ],
    ],
    [7, ["1 2 3 4 5 6 7", "8 9 10 11 12 13 14", "15 16 17 18 19 20 21", "22 23 24 25 26 27 28"]],
  ] as const)("starts February's weeks on day %i", (firstDay: IsoDayOfWeek, february) => {
    expect(rows(project([], { env: environment("UTC", { firstDay }) }).months[1]!)).toEqual(
      february,
    );
  });

  test("lists each day's events, all-day first and then by start time", () => {
    const projection = project([
      timed("late", "2026-03-04T15:00:00Z", "2026-03-04T16:00:00Z"),
      timed("early", "2026-03-04T09:00:00Z", "2026-03-04T10:00:00Z"),
      allDay("holiday", "2026-03-04", "2026-03-05"),
      floating("floating", "2026-03-04T12:00", "2026-03-04T12:30"),
    ]);
    expect(eventsOn(projection, "2026-03-04")).toEqual(["holiday", "early", "floating", "late"]);
    expect(eventsOn(projection, "2026-03-05")).toEqual([]);
  });

  test("puts a multi-day event on every date it covers, across months", () => {
    const projection = project([allDay("trip", "2026-01-30", "2026-02-03")]);
    expect(
      ["2026-01-29", "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02", "2026-02-03"].map(
        (date) => eventsOn(projection, date).length,
      ),
    ).toEqual([0, 1, 1, 1, 1, 0]);
  });

  test("keeps only the year's dates of events that cross New Year", () => {
    const projection = project([
      allDay("new-year", "2025-12-31", "2026-01-02"),
      allDay("party", "2026-12-31", "2027-01-02"),
      allDay("last-year", "2025-12-30", "2025-12-31"),
    ]);
    expect(eventsOn(projection, "2026-01-01")).toEqual(["new-year"]);
    expect(eventsOn(projection, "2026-12-31")).toEqual(["party"]);
    expect(
      projection.months
        .flatMap((month) => month.weeks)
        .flatMap((week) => week.days)
        .reduce((count, day) => count + (day?.fragments.length ?? 0), 0),
    ).toBe(2);
  });

  test("dates timed events in the display time zone", () => {
    // 04:30 UTC on March 8 is still March 7 in New York.
    const events = [timed("night", "2026-03-08T04:30:00Z", "2026-03-08T05:00:00Z")];
    const newYork = project(events, { env: environment("America/New_York") });
    expect(eventsOn(newYork, "2026-03-07")).toEqual(["night"]);
    expect(eventsOn(project(events), "2026-03-08")).toEqual(["night"]);
  });

  test("marks today", () => {
    const today = project([], { today: "2026-10-08" })
      .months.flatMap((month) => month.weeks)
      .flatMap((week) => week.days)
      .filter((day) => day?.isToday === true);
    expect(today.map((day) => day!.date.toString())).toEqual(["2026-10-08"]);
  });
});

function navigation({
  direction = "ltr",
  firstDay = 7,
  today = null,
}: {
  readonly direction?: CalendarEnvironmentBase["direction"];
  readonly firstDay?: IsoDayOfWeek;
  readonly today?: string | null;
} = {}) {
  const env = { ...environment("UTC", { firstDay }), direction };
  const range = getYearRange(anchor);
  const projection = projectYear(viewInput(snapshotOf([]), range, env, today));
  return (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
    const result = yearSpatialNavigation({
      command,
      environment: env,
      focus,
      options: undefined,
      projection,
      range,
      snap,
    });
    if (result === null) return null;
    if ("page" in result) return `page ${result.page}`;
    return result.focus.kind === "day" ? result.focus.date.toString() : result.focus.kind;
  };
}

const day = (date: string): CalendarFocus => ({ date: Temporal.PlainDate.from(date), kind: "day" });

describe("year navigation", () => {
  test("enters on today when the year shows it, else on its first day; End on its last", () => {
    expect(navigation({ today: "2026-10-08" })("home", null)).toBe("2026-10-08");
    expect(navigation({ today: "2027-10-08" })("down", null)).toBe("2026-01-01");
    expect(navigation({ today: "2026-10-08" })("end", null)).toBe("2026-12-31");
  });

  test("arrows move by a day or a week, across months", () => {
    const navigate = navigation();
    expect(navigate("left", day("2026-10-08"))).toBe("2026-10-07");
    expect(navigate("right", day("2026-01-31"))).toBe("2026-02-01");
    expect(navigate("up", day("2026-03-03"))).toBe("2026-02-24");
    expect(navigate("down", day("2026-01-29"))).toBe("2026-02-05");
  });

  test("moving past the year names a date in the next or previous one", () => {
    const navigate = navigation();
    expect(navigate("right", day("2026-12-31"))).toBe("2027-01-01");
    expect(navigate("up", day("2026-01-03"))).toBe("2025-12-27");
    expect(navigate("page-down", day("2026-12-15"))).toBe("2027-01-15");
  });

  test.each([
    // Weeks start on Sunday: January 1 is a Thursday, March 31 a Tuesday.
    [7, "2026-01-02", "2026-01-01", "2026-01-03"],
    [7, "2026-03-31", "2026-03-29", "2026-03-31"],
    [7, "2026-10-08", "2026-10-04", "2026-10-10"],
    [1, "2026-03-01", "2026-03-01", "2026-03-01"],
    [1, "2026-10-08", "2026-10-05", "2026-10-11"],
  ] as const)(
    "Home and End stay in the week's row of its month (weeks from day %i, from %s)",
    (firstDay, from, start, end) => {
      const navigate = navigation({ firstDay });
      expect(navigate("home", day(from))).toBe(start);
      expect(navigate("end", day(from))).toBe(end);
    },
  );

  test("Page Up and Page Down move by a month and keep the day where the month has it", () => {
    const navigate = navigation();
    expect(navigate("page-down", day("2026-01-31"))).toBe("2026-02-28");
    expect(navigate("page-up", day("2026-03-31"))).toBe("2026-02-28");
  });

  test("left and right follow the layout in right-to-left calendars", () => {
    const navigate = navigation({ direction: "rtl" });
    expect(navigate("left", day("2026-10-08"))).toBe("2026-10-09");
    expect(navigate("right", day("2026-10-08"))).toBe("2026-10-07");
  });

  test("days have no events to enter, and focus from other views continues from its date", () => {
    const navigate = navigation();
    expect(navigate("enter", day("2026-10-08"))).toBeNull();
    expect(navigate("exit", day("2026-10-08"))).toBeNull();
    const event: CalendarFocus = {
      date: Temporal.PlainDate.from("2026-10-08"),
      eventId: "standup",
      kind: "event",
    };
    const slot: CalendarFocus = {
      date: Temporal.PlainDate.from("2026-10-08"),
      kind: "slot",
      time: Temporal.PlainTime.from("09:00"),
    };
    expect(navigate("right", event)).toBe("2026-10-09");
    expect(navigate("down", slot)).toBe("2026-10-15");
  });
});
