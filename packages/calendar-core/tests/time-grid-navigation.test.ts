import { describe, expect, test } from "vite-plus/test";

import {
  projectTimeGrid,
  timeGridRange,
  timeGridSpatialNavigation,
  type CalendarEnvironmentBase,
  type CalendarFocus,
  type CalendarNavigationCommand,
} from "../src/index";
import {
  allDay,
  environment,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

const timeZone = "America/New_York";
const snap = { increment: 15, smallestUnit: "minute" } as const;

function at(wall: string): string {
  return Temporal.ZonedDateTime.from(`${wall}[${timeZone}]`).toInstant().toString();
}

/** The week of the spring-forward change, Sunday March 8 2026, when 02:00 becomes 03:00. */
function week({
  direction = "ltr",
  events = [],
  today = null,
}: {
  readonly direction?: CalendarEnvironmentBase["direction"];
  readonly events?: readonly FixtureEvent[];
  readonly today?: string | null;
} = {}) {
  const env = { ...environment(timeZone, { firstDay: 7 }), direction };
  const range = timeGridRange(
    Temporal.PlainDate.from("2026-03-10"),
    { kind: "week" },
    env.weekRules,
  );
  const projection = projectTimeGrid(viewInput(snapshotOf(events), range, env, today));
  return (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
    const result = timeGridSpatialNavigation({
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
    const next = result.focus;
    if (next.kind === "slot") {
      return `${next.date.toString()}T${next.time.toString({ smallestUnit: "minute" })}`;
    }
    return next.kind === "event" ? `${next.eventId}@${next.date.toString()}` : next.date.toString();
  };
}

function slot(wall: string): CalendarFocus {
  const value = Temporal.PlainDateTime.from(wall);
  return { date: value.toPlainDate(), kind: "slot", time: value.toPlainTime() };
}
const day = (date: string): CalendarFocus => ({ date: Temporal.PlainDate.from(date), kind: "day" });
const event = (eventId: string, date: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  eventId,
  kind: "event",
});

describe("time-grid slots", () => {
  const navigate = week();

  test("up and down step by the snap increment, aligning an off-grid time first", () => {
    expect(navigate("down", slot("2026-03-10T09:00"))).toBe("2026-03-10T09:15");
    expect(navigate("up", slot("2026-03-10T09:00"))).toBe("2026-03-10T08:45");
    expect(navigate("up", slot("2026-03-10T09:07"))).toBe("2026-03-10T09:00");
    expect(navigate("down", slot("2026-03-10T09:07"))).toBe("2026-03-10T09:15");
  });

  test("steps skip the hour a spring-forward change removes", () => {
    expect(navigate("down", slot("2026-03-08T01:45"))).toBe("2026-03-08T03:00");
    expect(navigate("up", slot("2026-03-08T03:00"))).toBe("2026-03-08T01:45");
    // Moving onto that hour from another day lands on the first slot that exists.
    expect(navigate("left", slot("2026-03-09T02:30"))).toBe("2026-03-08T03:00");
  });

  test("the first slot leads up to the all-day cell, which leads back down", () => {
    expect(navigate("up", slot("2026-03-10T00:00"))).toBe("2026-03-10");
    expect(navigate("down", day("2026-03-10"))).toBe("2026-03-10T00:00");
    expect(navigate("up", day("2026-03-10"))).toBeNull();
    expect(navigate("down", slot("2026-03-10T23:45"))).toBeNull();
  });

  test("left, right, Home, End, and the Page keys move by days and keep the time", () => {
    expect(navigate("right", slot("2026-03-10T09:00"))).toBe("2026-03-11T09:00");
    expect(navigate("left", day("2026-03-10"))).toBe("2026-03-09");
    expect(navigate("home", slot("2026-03-10T09:00"))).toBe("2026-03-08T09:00");
    expect(navigate("end", slot("2026-03-10T09:00"))).toBe("2026-03-14T09:00");
    // Past the visible week, which the view then navigates to.
    expect(navigate("page-down", slot("2026-03-10T09:00"))).toBe("2026-03-17T09:00");
    expect(navigate("right", day("2026-03-14"))).toBe("2026-03-15");
  });

  test("left and right follow the layout in right-to-left calendars", () => {
    const rtl = week({ direction: "rtl" });
    expect(rtl("left", slot("2026-03-10T09:00"))).toBe("2026-03-11T09:00");
    expect(rtl("right", day("2026-03-10"))).toBe("2026-03-09");
  });

  test("enters on today's all-day cell when it is shown, else on the first day", () => {
    expect(week({ today: "2026-03-11" })("home", null)).toBe("2026-03-11");
    expect(week({ today: "2026-04-01" })("home", null)).toBe("2026-03-08");
    expect(week({ today: "2026-03-11" })("end", null)).toBe("2026-03-14");
  });
});

describe("time-grid events", () => {
  const navigate = week({
    events: [
      timed("standup", at("2026-03-10T09:00"), at("2026-03-10T10:00")),
      timed("review", at("2026-03-10T09:30"), at("2026-03-10T10:30")),
      timed("lunch", at("2026-03-10T12:00"), at("2026-03-10T13:00")),
      timed("flight", at("2026-03-11T22:00"), at("2026-03-12T02:00")),
      allDay("trip", "2026-03-10", "2026-03-12"),
      allDay("holiday", "2026-03-10", "2026-03-11"),
    ],
  });

  test("Enter moves from a slot to the first event covering it", () => {
    expect(navigate("enter", slot("2026-03-10T09:45"))).toBe("standup@2026-03-10");
    expect(navigate("enter", slot("2026-03-10T10:15"))).toBe("review@2026-03-10");
    expect(navigate("enter", slot("2026-03-10T11:00"))).toBeNull();
  });

  test("up and down walk a column's events, left and right move between overlapping ones", () => {
    expect(navigate("down", event("standup", "2026-03-10"))).toBe("review@2026-03-10");
    expect(navigate("down", event("review", "2026-03-10"))).toBe("lunch@2026-03-10");
    expect(navigate("down", event("lunch", "2026-03-10"))).toBeNull();
    expect(navigate("up", event("standup", "2026-03-10"))).toBeNull();
    expect(navigate("right", event("standup", "2026-03-10"))).toBe("review@2026-03-10");
    expect(navigate("left", event("review", "2026-03-10"))).toBe("standup@2026-03-10");
    expect(navigate("left", event("standup", "2026-03-10"))).toBeNull();
    expect(navigate("right", event("lunch", "2026-03-10"))).toBeNull();
  });

  test("Escape returns to the slot where the event starts on that date", () => {
    expect(navigate("exit", event("review", "2026-03-10"))).toBe("2026-03-10T09:30");
    // The second day of an overnight event starts at midnight.
    expect(navigate("exit", event("flight", "2026-03-12"))).toBe("2026-03-12T00:00");
    expect(navigate("home", event("lunch", "2026-03-10"))).toBe("2026-03-08T12:00");
  });

  test("all-day events walk like a month's and lead down into the slots", () => {
    expect(navigate("enter", day("2026-03-10"))).toBe("trip@2026-03-10");
    expect(navigate("down", event("trip", "2026-03-10"))).toBe("holiday@2026-03-10");
    expect(navigate("down", event("holiday", "2026-03-10"))).toBe("2026-03-10T00:00");
    expect(navigate("up", event("trip", "2026-03-10"))).toBe("2026-03-10");
    expect(navigate("right", event("trip", "2026-03-10"))).toBe("2026-03-11");
    expect(navigate("exit", event("trip", "2026-03-11"))).toBe("2026-03-11");
  });

  test("an event the grid no longer shows leaves from its date", () => {
    expect(navigate("exit", event("gone", "2026-03-10"))).toBe("2026-03-10");
    expect(navigate("right", event("gone", "2026-03-10"))).toBe("2026-03-11");
  });
});

describe("time-grid events across DST changes", () => {
  function navigateIn(
    zone: string,
    anchor: string,
    events: readonly FixtureEvent[],
    snapTo: { readonly increment: number; readonly smallestUnit: "hour" | "minute" },
  ) {
    const env = environment(zone, { firstDay: 7 });
    const range = timeGridRange(
      Temporal.PlainDate.from(anchor),
      { count: 1, kind: "days" },
      env.weekRules,
    );
    const projection = projectTimeGrid(viewInput(snapshotOf(events), range, env));
    return (command: CalendarNavigationCommand, focus: CalendarFocus) => {
      const result = timeGridSpatialNavigation({
        command,
        environment: env,
        focus,
        options: undefined,
        projection,
        range,
        snap: snapTo,
      });
      if (result === null || !("focus" in result)) return result;
      const next = result.focus;
      if (next.kind === "slot")
        return `${next.date.toString()}T${next.time.toString({ smallestUnit: "minute" })}`;
      return next.kind === "event"
        ? `${next.eventId}@${next.date.toString()}`
        : next.date.toString();
    };
  }

  test("Enter reaches an event whose wall-clock end precedes its start in a repeated hour", () => {
    // 01:45 daylight time to 01:15 standard time, half an hour across the fall-back change.
    const navigate = navigateIn(
      timeZone,
      "2026-11-01",
      [timed("late", "2026-11-01T05:45:00Z", "2026-11-01T06:15:00Z")],
      snap,
    );
    expect(navigate("enter", slot("2026-11-01T01:45"))).toBe("late@2026-11-01");
    expect(navigate("enter", slot("2026-11-01T02:00"))).toBeNull();
  });

  test("Escape lands on a slot that exists when the event's slot starts in a gap", () => {
    // Lord Howe moves from 02:00 to 02:30 on October 4 2026; the event starts at 02:45.
    const navigate = navigateIn(
      "Australia/Lord_Howe",
      "2026-10-04",
      [timed("call", "2026-10-03T15:45:00Z", "2026-10-03T16:15:00Z")],
      { increment: 1, smallestUnit: "hour" },
    );
    expect(navigate("exit", event("call", "2026-10-04"))).toBe("2026-10-04T03:00");
  });
});

test("Enter keeps half-open coverage at sub-second event bounds", () => {
  const quarterHour = { increment: 15, smallestUnit: "minute" } as const;
  const at = (events: readonly FixtureEvent[], wall: string) => {
    const env = environment("UTC");
    const range = timeGridRange(
      Temporal.PlainDate.from("2026-10-08"),
      { count: 1, kind: "days" },
      env.weekRules,
    );
    const projection = projectTimeGrid(viewInput(snapshotOf(events), range, env));
    const result = timeGridSpatialNavigation({
      command: "enter",
      environment: env,
      focus: slot(wall),
      options: undefined,
      projection,
      range,
      snap: quarterHour,
    });
    return result !== null && "focus" in result && result.focus.kind === "event";
  };
  const lateStart = [timed("late", "2026-10-08T09:00:00.400Z", "2026-10-08T10:00:00Z")];
  expect(at(lateStart, "2026-10-08T09:00")).toBe(false);
  expect(at(lateStart, "2026-10-08T09:15")).toBe(true);
  const lateEnd = [timed("long", "2026-10-08T09:00:00Z", "2026-10-08T10:00:00.400Z")];
  expect(at(lateEnd, "2026-10-08T10:00")).toBe(true);
  expect(at(lateEnd, "2026-10-08T10:15")).toBe(false);
});
