import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  moveKeyboardCursor,
  startKeyboardSession,
  timeGridColumns,
  type CalendarEventPlacement,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import {
  createdPlacement,
  movedPlacement,
  resizedPlacement,
  type GestureOptions,
  type PointerTarget,
} from "../src/gestures";

const timeZone = "America/New_York";
const options: GestureOptions = { snap: { increment: 15, smallestUnit: "minute" }, timeZone };
const columns = timeGridColumns(
  plainDateInterval(Temporal.PlainDate.from("2026-03-05"), Temporal.PlainDate.from("2026-03-10")),
  timeZone,
);

/** A pointer at a wall time in the column for `date`; the axis is a nominal 24-hour day. */
function at(date: string, time: string): PointerTarget {
  const column = columns.find((candidate) => candidate.date.toString() === date)!;
  const { hour, minute } = Temporal.PlainTime.from(time);
  return { column, kind: "time", y: (hour * 60 + minute) / (24 * 60) };
}

function day(date: string): PointerTarget {
  return { date: Temporal.PlainDate.from(date), kind: "day" };
}

function timed(start: string, end: string): CalendarEventPlacement<string> {
  return {
    end: Temporal.ZonedDateTime.from(`${end}[${timeZone}]`).toInstant(),
    kind: "timed",
    resourceIds: ["room"],
    start: Temporal.ZonedDateTime.from(`${start}[${timeZone}]`).toInstant(),
  };
}

function wall(placement: CalendarEventPlacement<string> | null): string {
  if (placement === null) return "none";
  if (placement.kind !== "timed")
    return `${placement.kind} ${placement.start.toString()}/${placement.end.toString()}`;
  const local = (instant: Temporal.Instant) =>
    instant.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" });
  return `${local(placement.start)}/${local(placement.end)}`;
}

describe("move", () => {
  test("moves by the snapped distance between grab and pointer", () => {
    const event = timed("2026-03-06T09:00", "2026-03-06T10:00");
    expect(
      wall(movedPlacement(event, at("2026-03-06", "09:32"), at("2026-03-07", "11:28"), options)),
    ).toBe("2026-03-07T11:00/2026-03-07T12:00");
    // A day later but half an hour earlier: the delta's parts have opposite signs.
    expect(
      wall(movedPlacement(event, at("2026-03-06", "10:00"), at("2026-03-07", "09:30"), options)),
    ).toBe("2026-03-07T08:30/2026-03-07T09:30");
    expect(
      movedPlacement(event, at("2026-03-06", "10:00"), at("2026-03-07", "09:30"), options)
        .resourceIds,
    ).toEqual(["room"]);
  });

  test("keeps the wall-clock time when moved onto a DST change day", () => {
    const event = timed("2026-03-07T09:00", "2026-03-07T10:00");
    expect(
      wall(movedPlacement(event, at("2026-03-07", "09:00"), at("2026-03-08", "09:00"), options)),
    ).toBe("2026-03-08T09:00/2026-03-08T10:00");
  });

  test("moves between day cells by whole days and keeps a timed event's time", () => {
    const event = timed("2026-03-06T09:00", "2026-03-06T10:00");
    expect(wall(movedPlacement(event, day("2026-03-06"), day("2026-03-09"), options))).toBe(
      "2026-03-09T09:00/2026-03-09T10:00",
    );
  });

  test("converts between timed and all-day when crossing axes", () => {
    const event = timed("2026-03-06T09:00", "2026-03-06T10:00");
    expect(wall(movedPlacement(event, at("2026-03-06", "09:00"), day("2026-03-08"), options))).toBe(
      "all-day 2026-03-08/2026-03-09",
    );

    const allDay: CalendarEventPlacement<string> = {
      end: Temporal.PlainDate.from("2026-03-07"),
      kind: "all-day",
      resourceIds: [],
      start: Temporal.PlainDate.from("2026-03-06"),
    };
    expect(
      wall(movedPlacement(allDay, day("2026-03-06"), at("2026-03-09", "14:05"), options)),
    ).toBe("2026-03-09T14:00/2026-03-09T15:00");
  });
});

describe("across DST transitions", () => {
  const autumn = timeGridColumns(
    plainDateInterval(Temporal.PlainDate.from("2026-10-30"), Temporal.PlainDate.from("2026-11-03")),
    timeZone,
  );
  const inAutumn = (date: string, time: string): PointerTarget => {
    const { hour, minute } = Temporal.PlainTime.from(time);
    const column = autumn.find((candidate) => candidate.date.toString() === date)!;
    return { column, kind: "time", y: (hour * 60 + minute) / (24 * 60) };
  };
  const inNovember = (time: string) => inAutumn("2026-11-01", time);

  test("lands the grabbed point under the pointer across the spring gap", () => {
    const event = timed("2026-03-08T00:00", "2026-03-08T01:00");
    expect(
      wall(movedPlacement(event, at("2026-03-08", "00:00"), at("2026-03-08", "04:00"), options)),
    ).toBe("2026-03-08T04:00/2026-03-08T05:00");
    expect(
      wall(
        resizedPlacement(
          event,
          "end",
          at("2026-03-08", "01:00"),
          at("2026-03-08", "04:00"),
          options,
        ),
      ),
    ).toBe("2026-03-08T00:00/2026-03-08T04:00");
  });

  test("lands the grabbed point under the pointer across the fall fold", () => {
    const event = timed("2026-11-01T00:00", "2026-11-01T01:00");
    expect(wall(movedPlacement(event, inNovember("00:00"), inNovember("03:00"), options))).toBe(
      "2026-11-01T03:00/2026-11-01T04:00",
    );
    expect(
      wall(resizedPlacement(event, "end", inNovember("01:00"), inNovember("03:00"), options)),
    ).toBe("2026-11-01T00:00/2026-11-01T03:00");
  });

  test("moves both ends of a multi-day event by calendar days across either transition", () => {
    // Grabbed a day before the transition at 10:00 and dropped a day later at 09:30.
    const spring = timed("2026-03-06T09:00", "2026-03-09T10:00");
    expect(
      wall(movedPlacement(spring, at("2026-03-07", "10:00"), at("2026-03-08", "09:30"), options)),
    ).toBe("2026-03-07T08:30/2026-03-10T09:30");
    const fall = timed("2026-10-30T09:00", "2026-11-02T10:00");
    expect(
      wall(
        movedPlacement(
          fall,
          inAutumn("2026-10-31", "10:00"),
          inAutumn("2026-11-01", "09:30"),
          options,
        ),
      ),
    ).toBe("2026-10-31T08:30/2026-11-03T09:30");
  });

  test("moves a multi-day event's far end by calendar days when the clock moves earlier", () => {
    // A day later and half an hour earlier, with the spring gap between the two ends.
    const event = timed("2026-03-06T10:00", "2026-03-07T22:00");
    expect(
      wall(movedPlacement(event, at("2026-03-06", "10:00"), at("2026-03-07", "09:30"), options)),
    ).toBe("2026-03-07T09:30/2026-03-08T21:30");
  });

  test("moves floating events by wall time, which has no gap", () => {
    const floating: CalendarEventPlacement<string> = {
      end: Temporal.PlainDateTime.from("2026-03-08T01:00"),
      kind: "floating",
      resourceIds: [],
      start: Temporal.PlainDateTime.from("2026-03-08T00:00"),
    };
    expect(
      wall(movedPlacement(floating, at("2026-03-08", "00:00"), at("2026-03-08", "04:00"), options)),
    ).toBe("floating 2026-03-08T04:00:00/2026-03-08T05:00:00");
  });
});

describe("resize", () => {
  test("moves the dragged edge and stops one slot from the other", () => {
    const event = timed("2026-03-06T09:00", "2026-03-06T10:00");
    expect(
      wall(
        resizedPlacement(
          event,
          "end",
          at("2026-03-06", "10:00"),
          at("2026-03-06", "11:15"),
          options,
        ),
      ),
    ).toBe("2026-03-06T09:00/2026-03-06T11:15");
    expect(
      wall(
        resizedPlacement(
          event,
          "end",
          at("2026-03-06", "10:00"),
          at("2026-03-06", "07:00"),
          options,
        ),
      ),
    ).toBe("2026-03-06T09:00/2026-03-06T09:15");
    expect(
      wall(
        resizedPlacement(
          event,
          "start",
          at("2026-03-06", "09:00"),
          at("2026-03-05", "23:00"),
          options,
        ),
      ),
    ).toBe("2026-03-05T23:00/2026-03-06T10:00");
  });

  test("ignores the pointer while it is over the other axis", () => {
    const event = timed("2026-03-06T09:00", "2026-03-06T10:00");
    expect(
      resizedPlacement(event, "end", at("2026-03-06", "10:00"), day("2026-03-07"), options),
    ).toBeNull();
  });
});

describe("create", () => {
  test("spans the slots under the anchor and the pointer in either direction", () => {
    expect(
      wall(createdPlacement(at("2026-03-06", "14:20"), at("2026-03-06", "13:10"), options)),
    ).toBe("2026-03-06T13:00/2026-03-06T14:30");
    expect(
      wall(createdPlacement(at("2026-03-06", "09:05"), at("2026-03-06", "09:05"), options)),
    ).toBe("2026-03-06T09:00/2026-03-06T09:15");
  });

  test("spans day cells as an all-day event", () => {
    expect(wall(createdPlacement(day("2026-03-09"), day("2026-03-07"), options))).toBe(
      "all-day 2026-03-07/2026-03-10",
    );
    expect(createdPlacement(day("2026-03-09"), at("2026-03-06", "09:00"), options)).toBeNull();
  });
});

describe("resources", () => {
  const inRoom = (target: PointerTarget, resourceId: string | null): PointerTarget => ({
    ...target,
    resourceId,
  });
  const slot = (wall: string, resourceId: string | null) => {
    const dateTime = Temporal.PlainDateTime.from(wall);
    return {
      date: dateTime.toPlainDate(),
      kind: "slot",
      resourceId,
      time: dateTime.toPlainTime(),
    } as const;
  };

  test("a drop in another resource proposes what the keyboard does, across a DST change", () => {
    const event = createEventSnapshot(
      [{ ...timed("2026-03-07T09:00", "2026-03-07T10:00"), data: null, id: "a", title: "a" }],
      createCanonicalEventAdapter<null, string, string>(),
    ).get("a")!;
    const original = timed("2026-03-07T09:00", "2026-03-07T10:00");
    const pointer = movedPlacement(
      original,
      inRoom(at("2026-03-07", "09:00"), "room"),
      inRoom(at("2026-03-08", "11:00"), "lab"),
      options,
    );
    const keyboard = moveKeyboardCursor(
      startKeyboardSession(
        { cause: "move", cell: slot("2026-03-07T09:00", "room"), event },
        options,
      ),
      slot("2026-03-08T11:00", "lab"),
      options,
    );

    expect(wall(pointer)).toBe("2026-03-08T11:00/2026-03-08T12:00");
    expect(pointer.resourceIds).toEqual(["lab"]);
    expect(keyboard.proposed).toEqual(pointer);
  });

  test("creates in the anchor's resource and refuses to resize or create across resources", () => {
    const created = createdPlacement<string>(
      inRoom(at("2026-03-06", "09:05"), null),
      inRoom(at("2026-03-06", "09:50"), null),
      options,
    );

    expect(wall(created)).toBe("2026-03-06T09:00/2026-03-06T10:00");
    expect(created?.resourceIds).toEqual([]);
    expect(
      createdPlacement(
        inRoom(day("2026-03-06"), "room"),
        inRoom(day("2026-03-07"), "lab"),
        options,
      ),
    ).toBeNull();
    expect(
      resizedPlacement(
        timed("2026-03-06T09:00", "2026-03-06T10:00"),
        "end",
        inRoom(at("2026-03-06", "10:00"), "room"),
        inRoom(at("2026-03-06", "11:00"), "lab"),
        options,
      ),
    ).toBeNull();
  });
});
