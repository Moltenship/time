import { describe, expect, test } from "vite-plus/test";

import {
  getListRange,
  listSpatialNavigation,
  projectList,
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

function agenda(events: readonly FixtureEvent[]) {
  const env = environment("UTC");
  const range = getListRange(Temporal.PlainDate.from("2026-10-08"), env);
  const projection = projectList(viewInput(snapshotOf(events), range, env));
  return (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
    const result = listSpatialNavigation({
      command,
      environment: env,
      focus,
      options: undefined,
      projection,
      range,
      snap: { increment: 15, smallestUnit: "minute" },
    });
    if (result === null) return null;
    if ("page" in result) return `page ${result.page}`;
    const { focus: next } = result;
    return next.kind === "event" ? `${next.eventId}@${next.date.toString()}` : next.date.toString();
  };
}

const item = (eventId: string, date: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  eventId,
  kind: "event",
});

describe("agenda navigation", () => {
  const navigate = agenda([
    timed("standup", "2026-10-05T09:00:00Z", "2026-10-05T09:15:00Z"),
    timed("lunch", "2026-10-05T12:00:00Z", "2026-10-05T13:00:00Z"),
    allDay("trip", "2026-10-07", "2026-10-09"),
    timed("review", "2026-10-08T15:00:00Z", "2026-10-08T16:00:00Z"),
  ]);

  test("enters on the first item, or the last for End", () => {
    expect(navigate("home", null)).toBe("standup@2026-10-05");
    expect(navigate("end", null)).toBe("review@2026-10-08");
  });

  test("up and down move through items across days, then page the view", () => {
    expect(navigate("down", item("standup", "2026-10-05"))).toBe("lunch@2026-10-05");
    expect(navigate("down", item("lunch", "2026-10-05"))).toBe("trip@2026-10-07");
    // A multi-day event is an item on each of its days.
    expect(navigate("down", item("trip", "2026-10-07"))).toBe("trip@2026-10-08");
    expect(navigate("down", item("review", "2026-10-08"))).toBe("page 1");
    expect(navigate("up", item("standup", "2026-10-05"))).toBe("page -1");
  });

  test("Page Up and Page Down move to the first item of the previous and next day", () => {
    expect(navigate("page-down", item("standup", "2026-10-05"))).toBe("trip@2026-10-07");
    expect(navigate("page-up", item("review", "2026-10-08"))).toBe("trip@2026-10-07");
    expect(navigate("page-up", item("lunch", "2026-10-05"))).toBe("page -1");
    expect(navigate("page-down", item("trip", "2026-10-08"))).toBe("page 1");
    expect(navigate("home", item("review", "2026-10-08"))).toBe("standup@2026-10-05");
  });

  test("focus on a date without items moves from where that date would be", () => {
    const day: CalendarFocus = { date: Temporal.PlainDate.from("2026-10-06"), kind: "day" };
    expect(navigate("down", day)).toBe("trip@2026-10-07");
    expect(navigate("up", day)).toBe("lunch@2026-10-05");
    expect(navigate("page-down", day)).toBe("trip@2026-10-07");
    expect(navigate("page-up", day)).toBe("standup@2026-10-05");
  });

  test("there is nothing to the side, and no cells to enter or leave", () => {
    for (const command of ["left", "right", "enter", "exit"] as const) {
      expect(navigate(command, item("lunch", "2026-10-05"))).toBeNull();
    }
  });

  test("an empty agenda has no entry and pages past its range", () => {
    const empty = agenda([]);
    expect(empty("home", null)).toBeNull();
    const day: CalendarFocus = { date: Temporal.PlainDate.from("2026-10-08"), kind: "day" };
    expect(empty("down", day)).toBe("page 1");
  });
});
