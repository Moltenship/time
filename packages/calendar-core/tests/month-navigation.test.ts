import { describe, expect, test } from "vite-plus/test";

import {
  getMonthRange,
  monthSpatialNavigation,
  projectMonth,
  type CalendarEnvironmentBase,
  type CalendarFocus,
  type CalendarNavigationCommand,
  type IsoDayOfWeek,
} from "../src/index";
import {
  allDay,
  environment,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

const snap = { increment: 15, smallestUnit: "minute" } as const;

function month(
  anchor: string,
  {
    direction = "ltr",
    events = [],
    firstDay = 7,
    today = null,
  }: {
    readonly direction?: CalendarEnvironmentBase["direction"];
    readonly events?: readonly FixtureEvent[];
    readonly firstDay?: IsoDayOfWeek;
    readonly today?: string | null;
  } = {},
) {
  const env = { ...environment("UTC", { firstDay }), direction };
  const range = getMonthRange(Temporal.PlainDate.from(anchor), env);
  const projection = projectMonth(viewInput(snapshotOf(events), range, env, today));
  return (command: CalendarNavigationCommand, focus: CalendarFocus | null) => {
    const result = monthSpatialNavigation({
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
    const { focus: next } = result;
    return next.kind === "event" ? `${next.eventId}@${next.date.toString()}` : next.date.toString();
  };
}

const day = (date: string): CalendarFocus => ({ date: Temporal.PlainDate.from(date), kind: "day" });
const event = (eventId: string, date: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  eventId,
  kind: "event",
});

describe("month day cells", () => {
  test("arrows move by a day or a week, crossing week and month boundaries", () => {
    const navigate = month("2026-10-08");
    expect(navigate("left", day("2026-10-08"))).toBe("2026-10-07");
    expect(navigate("right", day("2026-10-10"))).toBe("2026-10-11");
    expect(navigate("up", day("2026-10-08"))).toBe("2026-10-01");
    expect(navigate("down", day("2026-10-29"))).toBe("2026-11-05");
  });

  test("moving past the visible weeks names a date outside the range", () => {
    // The October grid ends on Saturday, October 31 for Sunday week starts.
    const navigate = month("2026-10-08");
    expect(navigate("right", day("2026-10-31"))).toBe("2026-11-01");
    expect(navigate("up", day("2026-09-27"))).toBe("2026-09-20");
  });

  test.each([
    [1, "2026-10-05", "2026-10-11"],
    [7, "2026-10-04", "2026-10-10"],
    [6, "2026-10-03", "2026-10-09"],
  ] as const)(
    "Home and End go to the week's ends when weeks start on day %i",
    (firstDay, start, end) => {
      const navigate = month("2026-10-08", { firstDay });
      expect(navigate("home", day("2026-10-08"))).toBe(start);
      expect(navigate("end", day("2026-10-08"))).toBe(end);
      expect(navigate("home", day(start))).toBe(start);
    },
  );

  test("Page Up and Page Down move by a month and keep the day where the month has it", () => {
    const navigate = month("2026-01-15");
    expect(navigate("page-down", day("2026-01-31"))).toBe("2026-02-28");
    expect(navigate("page-up", day("2026-03-31"))).toBe("2026-02-28");
    expect(navigate("page-down", day("2026-12-15"))).toBe("2027-01-15");
  });

  test("left and right follow the layout in right-to-left calendars", () => {
    const navigate = month("2026-10-08", { direction: "rtl" });
    expect(navigate("left", day("2026-10-08"))).toBe("2026-10-09");
    expect(navigate("right", day("2026-10-08"))).toBe("2026-10-07");
  });

  test("slot focus from a time grid continues from its date", () => {
    const navigate = month("2026-10-08");
    const slot: CalendarFocus = {
      date: Temporal.PlainDate.from("2026-10-08"),
      kind: "slot",
      time: Temporal.PlainTime.from("09:00"),
    };
    expect(navigate("right", slot)).toBe("2026-10-09");
  });
});

describe("entering a month", () => {
  test("enters on today when it is shown, else on the month's first day", () => {
    expect(month("2026-10-08", { today: "2026-10-20" })("home", null)).toBe("2026-10-20");
    expect(month("2026-10-08", { today: "2026-11-20" })("home", null)).toBe("2026-10-01");
    // Today in a padding day is still shown.
    expect(month("2026-10-08", { today: "2026-09-28" })("down", null)).toBe("2026-09-28");
  });

  test("enters on the month's last day for End", () => {
    expect(month("2026-10-08", { today: "2026-10-20" })("end", null)).toBe("2026-10-31");
  });
});

describe("events in a day", () => {
  const events = [
    allDay("trip", "2026-10-06", "2026-10-09"),
    timed("standup", "2026-10-08T09:00:00Z", "2026-10-08T09:15:00Z"),
    timed("lunch", "2026-10-08T12:00:00Z", "2026-10-08T13:00:00Z"),
  ];
  const navigate = month("2026-10-08", { events });

  test("Enter moves to a day's first event, top to bottom; an empty day has none", () => {
    expect(navigate("enter", day("2026-10-08"))).toBe("trip@2026-10-08");
    expect(navigate("enter", day("2026-10-07"))).toBe("trip@2026-10-07");
    expect(navigate("enter", day("2026-10-12"))).toBeNull();
    expect(navigate("enter", event("trip", "2026-10-08"))).toBeNull();
  });

  test("up and down walk the day's events and leave to the day and the next week", () => {
    expect(navigate("down", event("trip", "2026-10-08"))).toBe("standup@2026-10-08");
    expect(navigate("down", event("standup", "2026-10-08"))).toBe("lunch@2026-10-08");
    expect(navigate("down", event("lunch", "2026-10-08"))).toBe("2026-10-15");
    expect(navigate("up", event("lunch", "2026-10-08"))).toBe("standup@2026-10-08");
    expect(navigate("up", event("trip", "2026-10-08"))).toBe("2026-10-08");
  });

  test("a multi-day event is walked within the day focus is on", () => {
    expect(navigate("down", event("trip", "2026-10-07"))).toBe("2026-10-14");
  });

  test("Escape and the other keys leave an event as they would leave its day", () => {
    expect(navigate("exit", event("lunch", "2026-10-08"))).toBe("2026-10-08");
    expect(navigate("right", event("lunch", "2026-10-08"))).toBe("2026-10-09");
    expect(navigate("page-down", event("lunch", "2026-10-08"))).toBe("2026-11-08");
    expect(navigate("exit", day("2026-10-08"))).toBeNull();
  });

  test("an event that is no longer shown leaves from its date", () => {
    expect(navigate("down", event("gone", "2026-10-08"))).toBe("2026-10-15");
    expect(navigate("exit", event("gone", "2026-10-08"))).toBe("2026-10-08");
  });
});
