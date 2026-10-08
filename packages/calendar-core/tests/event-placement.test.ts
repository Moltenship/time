import { describe, expect, test } from "vite-plus/test";

import {
  createEventPlacement,
  moveEventPlacement,
  resizeEventPlacement,
  toAllDayPlacement,
  toTimedPlacement,
  type CalendarEventPlacement,
} from "../src/index";

const timeZone = "America/New_York";

function zoned(value: string): Temporal.ZonedDateTime {
  return Temporal.ZonedDateTime.from(value.includes("[") ? value : `${value}[${timeZone}]`);
}

function timed(start: string, end: string, resourceIds: readonly string[] = []) {
  return {
    end: zoned(end).toInstant(),
    kind: "timed",
    resourceIds,
    start: zoned(start).toInstant(),
  } satisfies CalendarEventPlacement<string>;
}

function allDay(start: string, end: string): CalendarEventPlacement<string> {
  return {
    end: Temporal.PlainDate.from(end),
    kind: "all-day",
    resourceIds: [],
    start: Temporal.PlainDate.from(start),
  };
}

function floating(start: string, end: string): CalendarEventPlacement<string> {
  return {
    end: Temporal.PlainDateTime.from(end),
    kind: "floating",
    resourceIds: [],
    start: Temporal.PlainDateTime.from(start),
  };
}

/** Wall-clock endpoints in the display zone, or plain endpoints for other kinds. */
function wall(placement: CalendarEventPlacement<string>): readonly [string, string, string] {
  if (placement.kind !== "timed") {
    return [placement.kind, placement.start.toString(), placement.end.toString()];
  }
  const local = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toPlainDateTime().toString();
  return [placement.kind, local(placement.start), local(placement.end)];
}

describe("moveEventPlacement", () => {
  test("keeps the wall-clock time when a timed event moves across DST changes", () => {
    const spring = timed("2026-03-02T09:00", "2026-03-02T10:00");
    const movedIntoDst = moveEventPlacement(spring, { weeks: 1 }, { timeZone });
    expect(wall(movedIntoDst)).toEqual(["timed", "2026-03-09T09:00:00", "2026-03-09T10:00:00"]);
    expect(
      (movedIntoDst.start as Temporal.Instant).since(spring.start).total({ unit: "hours" }),
    ).toBe(7 * 24 - 1);

    const autumn = timed("2026-10-30T09:00", "2026-10-30T10:00");
    expect(wall(moveEventPlacement(autumn, { days: 3 }, { timeZone }))).toEqual([
      "timed",
      "2026-11-02T09:00:00",
      "2026-11-02T10:00:00",
    ]);
  });

  test("applies calendar days on the wall clock before exact time units", () => {
    const moved = moveEventPlacement(
      timed("2026-03-07T09:00", "2026-03-07T10:00", ["room-a"]),
      { days: 1, minutes: -30 },
      { timeZone },
    );
    expect(wall(moved)).toEqual(["timed", "2026-03-08T08:30:00", "2026-03-08T09:30:00"]);
    expect(moved.resourceIds).toEqual(["room-a"]);
  });

  test("keeps the exact duration when the wall clock would invert an event in a fold", () => {
    const inFold = {
      end: zoned("2026-11-01T01:10-05:00[America/New_York]").toInstant(),
      kind: "timed",
      resourceIds: [],
      start: zoned("2026-11-01T01:30-04:00[America/New_York]").toInstant(),
    } satisfies CalendarEventPlacement<string>;

    const moved = moveEventPlacement(inFold, { days: 1 }, { timeZone });
    expect(wall(moved)).toEqual(["timed", "2026-11-02T01:30:00", "2026-11-02T02:10:00"]);
  });

  test("moves all-day events by whole days and floating events on their own clock", () => {
    expect(
      wall(
        moveEventPlacement(allDay("2026-03-07", "2026-03-09"), { days: 2, hours: 5 }, { timeZone }),
      ),
    ).toEqual(["all-day", "2026-03-09", "2026-03-11"]);
    expect(
      wall(
        moveEventPlacement(
          floating("2026-03-07T09:00", "2026-03-07T10:00"),
          { days: 1, hours: 1 },
          { timeZone },
        ),
      ),
    ).toEqual(["floating", "2026-03-08T10:00:00", "2026-03-08T11:00:00"]);
  });
});

describe("resizeEventPlacement", () => {
  test("moves only the dragged edge", () => {
    const event = timed("2026-08-15T09:00", "2026-08-15T10:00");
    expect(wall(resizeEventPlacement(event, "end", { minutes: 30 }, { timeZone }))).toEqual([
      "timed",
      "2026-08-15T09:00:00",
      "2026-08-15T10:30:00",
    ]);
    expect(wall(resizeEventPlacement(event, "start", { hours: -1 }, { timeZone }))).toEqual([
      "timed",
      "2026-08-15T08:00:00",
      "2026-08-15T10:00:00",
    ]);
  });

  test("stops at the minimum duration", () => {
    const event = timed("2026-08-15T09:00", "2026-08-15T10:00");
    expect(wall(resizeEventPlacement(event, "end", { hours: -2 }, { timeZone }))).toEqual([
      "timed",
      "2026-08-15T09:00:00",
      "2026-08-15T09:15:00",
    ]);
    expect(
      wall(
        resizeEventPlacement(
          event,
          "start",
          { hours: 2 },
          { minimumDuration: { minutes: 30 }, timeZone },
        ),
      ),
    ).toEqual(["timed", "2026-08-15T09:30:00", "2026-08-15T10:00:00"]);
    expect(() =>
      resizeEventPlacement(
        event,
        "end",
        { minutes: 5 },
        { minimumDuration: { minutes: 0 }, timeZone },
      ),
    ).toThrow(RangeError);
  });

  test("never lengthens an event that is already shorter than the minimum", () => {
    const short = timed("2026-08-15T09:00", "2026-08-15T09:05");
    expect(wall(resizeEventPlacement(short, "end", { minutes: -10 }, { timeZone }))).toEqual(
      wall(short),
    );
    expect(wall(resizeEventPlacement(short, "start", { minutes: 0 }, { timeZone }))).toEqual(
      wall(short),
    );
  });

  test("keeps all-day events at least one day and resizes floating events", () => {
    const days = allDay("2026-08-15", "2026-08-17");
    expect(wall(resizeEventPlacement(days, "end", { days: -5 }, { timeZone }))).toEqual([
      "all-day",
      "2026-08-15",
      "2026-08-16",
    ]);
    expect(wall(resizeEventPlacement(days, "start", { days: 3 }, { timeZone }))).toEqual([
      "all-day",
      "2026-08-16",
      "2026-08-17",
    ]);
    expect(
      wall(
        resizeEventPlacement(
          floating("2026-08-15T09:00", "2026-08-15T10:00"),
          "end",
          { minutes: 45 },
          { timeZone },
        ),
      ),
    ).toEqual(["floating", "2026-08-15T09:00:00", "2026-08-15T10:45:00"]);
  });
});

describe("createEventPlacement", () => {
  test("covers both cells regardless of drag direction", () => {
    const later = timed("2026-08-15T11:00", "2026-08-15T11:15");
    const earlier = timed("2026-08-15T09:30", "2026-08-15T09:45");
    expect(wall(createEventPlacement(later, earlier, ["room-a"]))).toEqual([
      "timed",
      "2026-08-15T09:30:00",
      "2026-08-15T11:15:00",
    ]);
    expect(createEventPlacement(later, earlier, ["room-a"]).resourceIds).toEqual(["room-a"]);
    expect(
      wall(
        createEventPlacement(
          allDay("2026-08-19", "2026-08-20"),
          allDay("2026-08-17", "2026-08-18"),
        ),
      ),
    ).toEqual(["all-day", "2026-08-17", "2026-08-20"]);
  });

  test("rejects cells of different kinds", () => {
    expect(() =>
      createEventPlacement(
        allDay("2026-08-17", "2026-08-18"),
        timed("2026-08-15T09:00", "2026-08-15T10:00"),
      ),
    ).toThrow(TypeError);
  });
});

describe("timed and all-day conversion", () => {
  test("converts to the display-zone dates an event touches", () => {
    expect(
      wall(toAllDayPlacement(timed("2026-08-15T09:00", "2026-08-15T10:00"), { timeZone })),
    ).toEqual(["all-day", "2026-08-15", "2026-08-16"]);
    expect(
      wall(toAllDayPlacement(timed("2026-08-15T22:00", "2026-08-16T02:00"), { timeZone })),
    ).toEqual(["all-day", "2026-08-15", "2026-08-17"]);
    expect(
      wall(toAllDayPlacement(timed("2026-08-15T22:00", "2026-08-16T00:00"), { timeZone })),
    ).toEqual(["all-day", "2026-08-15", "2026-08-16"]);
    expect(
      wall(toAllDayPlacement(floating("2026-08-15T09:00", "2026-08-15T10:00"), { timeZone })),
    ).toEqual(["all-day", "2026-08-15", "2026-08-16"]);

    const days = allDay("2026-08-15", "2026-08-16");
    expect(toAllDayPlacement(days, { timeZone })).toBe(days);
  });

  test("converts to a timed event at a display-zone wall time", () => {
    const converted = toTimedPlacement(
      { ...allDay("2026-08-15", "2026-08-16"), resourceIds: ["room-a"] },
      zoned("2026-08-17T14:00"),
      { hours: 1 },
    );
    expect(wall(converted)).toEqual(["timed", "2026-08-17T14:00:00", "2026-08-17T15:00:00"]);
    expect(converted).toMatchObject({ resourceIds: ["room-a"], sourceTimeZone: timeZone });
  });
});
