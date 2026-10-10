import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  keyboardSessionProposal,
  moveKeyboardCursor,
  startKeyboardSession,
  type CalendarCellFocus,
  type CalendarEventPlacement,
  type CalendarKeyboardSession,
} from "../src/index";
import { allDay, timed, type FixtureEvent } from "./view-fixtures";

const timeZone = "America/New_York";
const options = { snap: { increment: 15, smallestUnit: "minute" }, timeZone } as const;

function normalized(event: FixtureEvent) {
  return createEventSnapshot([event], createCanonicalEventAdapter<null, string, string>()).get(
    event.id,
  )!;
}

const day = (date: string): CalendarCellFocus => ({
  date: Temporal.PlainDate.from(date),
  kind: "day",
});
function slot(dateTime: string): CalendarCellFocus {
  const wall = Temporal.PlainDateTime.from(dateTime);
  return { date: wall.toPlainDate(), kind: "slot", time: wall.toPlainTime() };
}

function local(instant: Temporal.Instant): string {
  return instant
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}

function wall(placement: CalendarEventPlacement): string {
  if (placement.kind === "all-day") {
    return `all-day ${placement.start.toString()}/${placement.end.toString()}`;
  }
  if (placement.kind === "floating") {
    return `${placement.start.toString()}/${placement.end.toString()}`;
  }
  return `${local(placement.start)}/${local(placement.end)}`;
}

function cell(focus: CalendarCellFocus): string {
  return focus.kind === "day"
    ? focus.date.toString()
    : `${focus.date.toString()}T${focus.time.toString({ smallestUnit: "minute" })}`;
}

function walk(session: CalendarKeyboardSession, cursors: readonly CalendarCellFocus[]) {
  return cursors.reduce((current, cursor) => moveKeyboardCursor(current, cursor, options), session);
}

const nyTimed = (id: string, start: string, end: string) =>
  timed(
    id,
    Temporal.ZonedDateTime.from(`${start}[${timeZone}]`).toInstant().toString(),
    Temporal.ZonedDateTime.from(`${end}[${timeZone}]`).toInstant().toString(),
  );

describe("keyboard move", () => {
  test("moves by whole days in day cells and keeps the wall time across a DST change", () => {
    const event = normalized(nyTimed("standup", "2026-10-30T09:00", "2026-10-30T09:30"));
    const start = startKeyboardSession({ cause: "move", cell: day("2026-10-30"), event }, options);
    expect(start.proposed).toEqual(start.original);
    expect(keyboardSessionProposal(start)).toBeNull();

    const moved = walk(start, [day("2026-10-31"), day("2026-11-01"), day("2026-11-02")]);
    expect(cell(moved.cursor)).toBe("2026-11-02");
    expect(wall(moved.proposed)).toBe("2026-11-02T09:00/2026-11-02T09:30");
    expect(keyboardSessionProposal(moved)).toEqual({
      cause: "move",
      eventId: "standup",
      proposed: moved.proposed,
    });
  });

  test("steps by slots through a spring-forward gap by elapsed time", () => {
    const event = normalized(nyTimed("call", "2026-03-08T01:00", "2026-03-08T01:30"));
    const start = startKeyboardSession(
      { cause: "move", cell: slot("2026-03-08T01:00"), event },
      options,
    );
    // From 01:45 the next slot that exists is 03:00, an hour after 01:00 in elapsed time.
    expect(wall(walk(start, [slot("2026-03-08T01:45")]).proposed)).toBe(
      "2026-03-08T01:45/2026-03-08T03:15",
    );
    expect(wall(walk(start, [slot("2026-03-08T03:00")]).proposed)).toBe(
      "2026-03-08T03:00/2026-03-08T03:30",
    );
  });

  test("moving onto a day cell makes a timed event all-day, and back restores its time", () => {
    const event = normalized(nyTimed("review", "2026-10-07T14:00", "2026-10-07T15:00"));
    const start = startKeyboardSession(
      { cause: "move", cell: slot("2026-10-07T14:00"), event },
      options,
    );
    const allDayMove = walk(start, [day("2026-10-08")]);
    expect(wall(allDayMove.proposed)).toBe("all-day 2026-10-08/2026-10-09");
    expect(wall(walk(allDayMove, [slot("2026-10-07T14:00")]).proposed)).toBe(
      "2026-10-07T14:00/2026-10-07T15:00",
    );
  });

  test("an all-day event moved onto a slot lasts an hour", () => {
    const event = normalized(allDay("offsite", "2026-10-07", "2026-10-09"));
    const start = startKeyboardSession({ cause: "move", cell: day("2026-10-07"), event }, options);
    expect(wall(walk(start, [slot("2026-10-08T10:00")]).proposed)).toBe(
      "2026-10-08T10:00/2026-10-08T11:00",
    );
  });
});

describe("keyboard resize", () => {
  test("grabs the end edge on the event's last day and keeps at least one day", () => {
    const event = normalized(allDay("trip", "2026-10-06", "2026-10-09"));
    const start = startKeyboardSession(
      { cause: "resize-end", cell: day("2026-10-06"), event },
      options,
    );
    expect(cell(start.cursor)).toBe("2026-10-08");
    expect(wall(walk(start, [day("2026-10-09"), day("2026-10-10")]).proposed)).toBe(
      "all-day 2026-10-06/2026-10-11",
    );

    const shortest = walk(start, [day("2026-10-07"), day("2026-10-06")]);
    expect(wall(shortest.proposed)).toBe("all-day 2026-10-06/2026-10-07");
    // Past the minimum the cursor stays, so focus stays on the event.
    expect(moveKeyboardCursor(shortest, day("2026-10-05"), options)).toBe(shortest);
  });

  test("a jump past the minimum stops at it, with the cursor on the edge it reached", () => {
    const event = normalized(allDay("trip", "2026-10-07", "2026-10-10"));
    const end = startKeyboardSession(
      { cause: "resize-end", cell: day("2026-10-07"), event },
      options,
    );
    const shrunk = moveKeyboardCursor(end, day("2026-10-02"), options);
    expect(wall(shrunk.proposed)).toBe("all-day 2026-10-07/2026-10-08");
    expect(cell(shrunk.cursor)).toBe("2026-10-07");
    expect(moveKeyboardCursor(shrunk, day("2026-09-25"), options)).toBe(shrunk);

    const start = startKeyboardSession(
      { cause: "resize-start", cell: day("2026-10-07"), event },
      options,
    );
    const raised = moveKeyboardCursor(start, day("2026-10-14"), options);
    expect(wall(raised.proposed)).toBe("all-day 2026-10-09/2026-10-10");
    expect(cell(raised.cursor)).toBe("2026-10-09");
  });

  test("a timed resize jumping a day past its minimum keeps one slot", () => {
    const event = normalized(nyTimed("focus", "2026-10-07T09:00", "2026-10-07T10:00"));
    const start = startKeyboardSession(
      { cause: "resize-end", cell: slot("2026-10-07T09:00"), event },
      options,
    );
    const shrunk = moveKeyboardCursor(start, slot("2026-10-06T09:45"), options);
    expect(wall(shrunk.proposed)).toBe("2026-10-07T09:00/2026-10-07T09:15");
    expect(cell(shrunk.cursor)).toBe("2026-10-07T09:00");
  });

  test("grabs the start edge on the event's first day", () => {
    const event = normalized(allDay("trip", "2026-10-06", "2026-10-09"));
    const start = startKeyboardSession(
      { cause: "resize-start", cell: day("2026-10-08"), event },
      options,
    );
    expect(cell(start.cursor)).toBe("2026-10-06");
    const resized = walk(start, [day("2026-10-05")]);
    expect(wall(resized.proposed)).toBe("all-day 2026-10-05/2026-10-09");
    expect(keyboardSessionProposal(resized)?.cause).toBe("resize-start");
  });

  test("resizes a timed event by slots from its last slot, down to one slot", () => {
    const event = normalized(nyTimed("focus", "2026-10-07T09:00", "2026-10-07T10:00"));
    const start = startKeyboardSession(
      { cause: "resize-end", cell: slot("2026-10-07T09:00"), event },
      options,
    );
    expect(cell(start.cursor)).toBe("2026-10-07T09:45");
    expect(wall(walk(start, [slot("2026-10-07T10:00")]).proposed)).toBe(
      "2026-10-07T09:00/2026-10-07T10:15",
    );
    const shortest = walk(start, [
      slot("2026-10-07T09:30"),
      slot("2026-10-07T09:15"),
      slot("2026-10-07T09:00"),
    ]);
    expect(wall(shortest.proposed)).toBe("2026-10-07T09:00/2026-10-07T09:15");
    expect(moveKeyboardCursor(shortest, slot("2026-10-07T08:45"), options)).toBe(shortest);
  });

  test("a resize does not cross into the all-day row", () => {
    const event = normalized(nyTimed("focus", "2026-10-07T09:00", "2026-10-07T10:00"));
    const start = startKeyboardSession(
      { cause: "resize-end", cell: slot("2026-10-07T09:00"), event },
      options,
    );
    expect(moveKeyboardCursor(start, day("2026-10-07"), options)).toBe(start);
  });
});

describe("keyboard create", () => {
  test("creates in the grabbed cell and extends to the cursor in either direction", () => {
    const start = startKeyboardSession({ cause: "create", cell: day("2026-10-07") }, options);
    expect(wall(start.proposed)).toBe("all-day 2026-10-07/2026-10-08");
    expect(keyboardSessionProposal(start)).toEqual({ cause: "create", proposed: start.proposed });
    expect(wall(walk(start, [day("2026-10-09")]).proposed)).toBe("all-day 2026-10-07/2026-10-10");
    expect(wall(walk(start, [day("2026-10-05")]).proposed)).toBe("all-day 2026-10-05/2026-10-08");
  });

  test("creates slots and stays on the axis it started on", () => {
    const start = startKeyboardSession(
      { cause: "create", cell: slot("2026-10-07T09:00") },
      options,
    );
    expect(wall(walk(start, [slot("2026-10-07T09:45")]).proposed)).toBe(
      "2026-10-07T09:00/2026-10-07T10:00",
    );
    expect(moveKeyboardCursor(start, day("2026-10-07"), options)).toBe(start);
  });

  test("a slot off the snap creates from the slot it rounds to", () => {
    // As from a view with five-minute slots.
    const start = startKeyboardSession(
      { cause: "create", cell: slot("2026-10-07T09:10") },
      options,
    );
    expect(cell(start.cursor)).toBe("2026-10-07T09:15");
    expect(wall(start.proposed)).toBe("2026-10-07T09:15/2026-10-07T09:30");
    expect(wall(walk(start, [slot("2026-10-07T09:30")]).proposed)).toBe(
      "2026-10-07T09:15/2026-10-07T09:45",
    );
  });

  test("a slot that rounds into a gap creates from the gap's end, without snapping it again", () => {
    // Nepal went from +05:30 to +05:45 at midnight on January 1, 1986: 00:00 to 00:15 never was.
    const nepal = {
      snap: { increment: 30, smallestUnit: "minute" },
      timeZone: "Asia/Kathmandu",
    } as const;
    const start = startKeyboardSession({ cause: "create", cell: slot("1985-12-31T23:45") }, nepal);
    const { proposed } = start;

    expect(cell(start.cursor)).toBe("1986-01-01T00:15");
    expect(
      proposed.kind === "timed" && `${proposed.start.toString()}/${proposed.end.toString()}`,
    ).toBe("1985-12-31T18:30:00Z/1985-12-31T19:00:00Z");
  });
});
