import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  createPlacementBetween,
  keyboardSessionProposal,
  movePlacementToTarget,
  moveKeyboardCursor,
  readOnlyResourcesPolicy,
  resizePlacementToTarget,
  startKeyboardSession,
  type CalendarCellFocus,
  type CalendarEventChange,
  type CalendarEventPlacement,
  type CalendarInteractionTarget,
  type CalendarPolicyContext,
  type ResourceId,
} from "../src/index";
import { allDay, timed, type FixtureEvent } from "./view-fixtures";

const timeZone = "America/New_York";
const options = { snap: { increment: 15, smallestUnit: "minute" }, timeZone } as const;

const zoned = (wall: string) => Temporal.ZonedDateTime.from(`${wall}[${timeZone}]`);

function at(wall: string, resourceId?: ResourceId | null): CalendarInteractionTarget {
  return { at: zoned(wall), kind: "time", ...(resourceId === undefined ? {} : { resourceId }) };
}

function day(date: string, resourceId?: ResourceId | null): CalendarInteractionTarget {
  return {
    date: Temporal.PlainDate.from(date),
    kind: "day",
    ...(resourceId === undefined ? {} : { resourceId }),
  };
}

function slot(wall: string, resourceId: ResourceId | null): CalendarCellFocus {
  const dateTime = Temporal.PlainDateTime.from(wall);
  return { date: dateTime.toPlainDate(), kind: "slot", resourceId, time: dateTime.toPlainTime() };
}

function event(start: string, end: string, resourceIds: readonly string[]): FixtureEvent {
  return {
    ...timed("meeting", zoned(start).toInstant().toString(), zoned(end).toInstant().toString()),
    resourceIds,
  };
}

function normalized(fixture: FixtureEvent) {
  return createEventSnapshot([fixture], createCanonicalEventAdapter<null, string, string>()).get(
    fixture.id,
  )!;
}

function placement(start: string, end: string, resourceIds: readonly string[]) {
  return {
    end: zoned(end).toInstant(),
    kind: "timed",
    resourceIds,
    start: zoned(start).toInstant(),
  } satisfies CalendarEventPlacement<string>;
}

/** `start/end resources`, with wall times. */
function read(value: CalendarEventPlacement | null): string {
  if (value === null) return "none";
  const wall = (point: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime) =>
    point instanceof Temporal.Instant
      ? point.toZonedDateTimeISO(timeZone).toPlainDateTime().toString({ smallestUnit: "minute" })
      : point.toString();
  return `${wall(value.start)}/${wall(value.end)} [${value.resourceIds.join(",")}]`;
}

describe("moving between resources", () => {
  const standup = placement("2026-10-08T09:00", "2026-10-08T09:30", ["orchid"]);

  test("swaps the resource and moves in time in one step", () => {
    expect(
      read(
        movePlacementToTarget(
          standup,
          at("2026-10-08T09:00", "orchid"),
          at("2026-10-08T11:00", "lotus"),
          options,
        ),
      ),
    ).toBe("2026-10-08T11:00/2026-10-08T11:30 [lotus]");
    expect(
      read(
        movePlacementToTarget(
          standup,
          day("2026-10-08", "orchid"),
          day("2026-10-09", "lotus"),
          options,
        ),
      ),
    ).toBe("2026-10-09T09:00/2026-10-09T09:30 [lotus]");
  });

  test("moves only the dragged fragment's resource of a multi-resource event", () => {
    const pairing = placement("2026-10-08T13:00", "2026-10-08T14:00", [
      "orchid",
      "lotus",
      "garage",
    ]);
    const grab = at("2026-10-08T13:00", "lotus");

    expect(
      read(movePlacementToTarget(pairing, grab, at("2026-10-08T13:00", "attic"), options)),
    ).toBe("2026-10-08T13:00/2026-10-08T14:00 [orchid,attic,garage]");
    // Onto a resource the event already has: the fragments merge rather than repeat it.
    expect(
      read(movePlacementToTarget(pairing, grab, at("2026-10-08T13:00", "garage"), options)),
    ).toBe("2026-10-08T13:00/2026-10-08T14:00 [orchid,garage]");
  });

  test("leaves and enters the unassigned bucket", () => {
    const unassigned = placement("2026-10-08T09:00", "2026-10-08T09:30", []);

    expect(
      read(
        movePlacementToTarget(
          unassigned,
          at("2026-10-08T09:00", null),
          at("2026-10-08T09:00", "lotus"),
          options,
        ),
      ),
    ).toBe("2026-10-08T09:00/2026-10-08T09:30 [lotus]");
    expect(
      read(
        movePlacementToTarget(
          standup,
          at("2026-10-08T09:00", "orchid"),
          at("2026-10-08T09:00", null),
          options,
        ),
      ),
    ).toBe("2026-10-08T09:00/2026-10-08T09:30 []");
  });

  test("keeps the resources in views without a resource dimension", () => {
    const moved = movePlacementToTarget(
      standup,
      at("2026-10-08T09:00"),
      at("2026-10-09T09:00"),
      options,
    );
    const same = movePlacementToTarget(
      standup,
      at("2026-10-08T09:00", "orchid"),
      at("2026-10-08T10:00", "orchid"),
      options,
    );

    expect(moved.resourceIds).toBe(standup.resourceIds);
    expect(same.resourceIds).toBe(standup.resourceIds);
  });

  test("creates in the anchor's resource and refuses to create or resize across resources", () => {
    expect(
      read(
        createPlacementBetween(
          at("2026-10-08T09:00", "lotus"),
          at("2026-10-08T10:00", "lotus"),
          options,
        ),
      ),
    ).toBe("2026-10-08T09:00/2026-10-08T10:15 [lotus]");
    expect(
      read(createPlacementBetween(day("2026-10-08", null), day("2026-10-09", null), options)),
    ).toBe("2026-10-08/2026-10-10 []");
    expect(
      createPlacementBetween(
        at("2026-10-08T09:00", "lotus"),
        at("2026-10-08T10:00", "orchid"),
        options,
      ),
    ).toBeNull();
    expect(
      resizePlacementToTarget(
        standup,
        "end",
        at("2026-10-08T09:30", "orchid"),
        at("2026-10-08T11:00", "lotus"),
        options,
      ),
    ).toBeNull();
    expect(
      read(
        resizePlacementToTarget(
          standup,
          "end",
          at("2026-10-08T09:30", "orchid"),
          at("2026-10-08T11:00", "orchid"),
          options,
        ),
      ),
    ).toBe("2026-10-08T09:00/2026-10-08T11:00 [orchid]");
  });
});

describe("keyboard and pointer give the same change", () => {
  test("for a move to another resource and time", () => {
    const fixture = event("2026-10-08T13:00", "2026-10-08T14:00", ["orchid", "lotus"]);
    const grab = slot("2026-10-08T13:00", "lotus");
    const start = startKeyboardSession(
      { cause: "move", cell: grab, event: normalized(fixture) },
      options,
    );
    const moved = [slot("2026-10-08T13:15", "lotus"), slot("2026-10-08T13:15", "garage")].reduce(
      (session, cursor) => moveKeyboardCursor(session, cursor, options),
      start,
    );
    // The pointer layer hands the same snapped targets to the same placement rules.
    const pointer = movePlacementToTarget(
      start.original!,
      at("2026-10-08T13:00", "lotus"),
      at("2026-10-08T13:15", "garage"),
      options,
    );

    expect(moved.cursor).toEqual(slot("2026-10-08T13:15", "garage"));
    expect(moved.proposed).toEqual(pointer);
    expect(read(moved.proposed)).toBe("2026-10-08T13:15/2026-10-08T14:15 [orchid,garage]");
    expect(keyboardSessionProposal(moved)).toEqual({
      cause: "move",
      eventId: "meeting",
      proposed: pointer,
    });
  });

  test("for a move that only changes the resource", () => {
    const fixture = event("2026-10-08T09:00", "2026-10-08T09:30", ["orchid"]);
    const start = startKeyboardSession(
      { cause: "move", cell: slot("2026-10-08T09:00", "orchid"), event: normalized(fixture) },
      options,
    );
    const moved = moveKeyboardCursor(start, slot("2026-10-08T09:00", null), options);

    expect(keyboardSessionProposal(moved)).toEqual({
      cause: "move",
      eventId: "meeting",
      proposed: movePlacementToTarget(
        start.original!,
        at("2026-10-08T09:00", "orchid"),
        at("2026-10-08T09:00", null),
        options,
      ),
    });
    expect(read(moved.proposed)).toBe("2026-10-08T09:00/2026-10-08T09:30 []");
  });

  test("across resources onto a fall-back day, keeping the wall time", () => {
    // America/New_York repeats 01:00–02:00 on 2026-11-01, so that day lasts 25 hours.
    const fixture = event("2026-10-31T09:00", "2026-10-31T09:30", ["orchid"]);
    const start = startKeyboardSession(
      { cause: "move", cell: slot("2026-10-31T09:00", "orchid"), event: normalized(fixture) },
      options,
    );
    const moved = moveKeyboardCursor(start, slot("2026-11-01T09:00", "lotus"), options);
    const pointer = movePlacementToTarget(
      start.original!,
      at("2026-10-31T09:00", "orchid"),
      at("2026-11-01T09:00", "lotus"),
      options,
    );

    expect(moved.proposed).toEqual(pointer);
    expect(read(moved.proposed)).toBe("2026-11-01T09:00/2026-11-01T09:30 [lotus]");
  });

  test("for a resize that stays in its resource and refuses one that leaves it", () => {
    const fixture = event("2026-10-08T09:00", "2026-10-08T10:00", ["orchid"]);
    const start = startKeyboardSession(
      { cause: "resize-end", cell: slot("2026-10-08T09:00", "orchid"), event: normalized(fixture) },
      options,
    );

    expect(start.cursor).toEqual(slot("2026-10-08T09:45", "orchid"));
    expect(moveKeyboardCursor(start, slot("2026-10-08T09:45", "lotus"), options)).toBe(start);
    expect(
      read(moveKeyboardCursor(start, slot("2026-10-08T10:15", "orchid"), options).proposed),
    ).toBe("2026-10-08T09:00/2026-10-08T10:30 [orchid]");
  });

  test("for a create, which starts in the focused resource", () => {
    const start = startKeyboardSession(
      { cause: "create", cell: slot("2026-10-08T09:00", "lotus") },
      options,
    );

    expect(read(start.proposed)).toBe("2026-10-08T09:00/2026-10-08T09:15 [lotus]");
    expect(moveKeyboardCursor(start, slot("2026-10-08T09:15", "orchid"), options)).toBe(start);
    expect(start.proposed).toEqual(
      createPlacementBetween(
        at("2026-10-08T09:00", "lotus"),
        at("2026-10-08T09:00", "lotus"),
        options,
      ),
    );
  });
});

describe("readOnlyResourcesPolicy", () => {
  type Change = CalendarEventChange<FixtureEvent, string, string>;
  const policy = readOnlyResourcesPolicy<FixtureEvent, string, string>(
    (resourceId) => resourceId === "boardroom",
  );
  const context = {} as CalendarPolicyContext<FixtureEvent, string, string>;
  const fixture = allDay("offsite", "2026-10-08", "2026-10-09");
  const original = (resourceIds: readonly string[], days = 0): CalendarEventPlacement<string> => ({
    end: Temporal.PlainDate.from("2026-10-09").add({ days }),
    kind: "all-day",
    resourceIds,
    start: Temporal.PlainDate.from("2026-10-08").add({ days }),
  });
  const update = (from: readonly string[], to: CalendarEventPlacement<string>): Change => ({
    cause: "move",
    event: fixture,
    eventId: "offsite",
    id: "change",
    original: original(from),
    proposed: to,
  });
  const later = (resourceIds: readonly string[]) => original(resourceIds, 1);
  const decide = (change: Change) => policy(change, context);
  const rejected = { reason: "read-only-resource", type: "reject" };

  test("rejects adding, removing, or rescheduling a read-only resource's events", () => {
    expect(decide(update(["lotus"], original(["boardroom"])))).toEqual(rejected);
    expect(decide(update(["boardroom"], original(["lotus"])))).toEqual(rejected);
    expect(decide(update(["boardroom", "lotus"], later(["boardroom", "lotus"])))).toEqual(rejected);
    expect(
      decide({
        cause: "create",
        event: null,
        eventId: null,
        id: "new",
        original: null,
        proposed: original(["boardroom"]),
      }),
    ).toEqual(rejected);
    expect(
      decide({
        cause: "delete",
        event: fixture,
        eventId: "offsite",
        id: "delete",
        original: original(["boardroom"]),
        proposed: null,
      }),
    ).toEqual(rejected);
  });

  test("lets an event keep a read-only resource while it moves between its others", () => {
    expect(decide(update(["boardroom", "lotus"], original(["boardroom", "orchid"])))).toEqual({
      type: "accept",
    });
    expect(decide(update(["lotus"], later(["orchid"])))).toEqual({ type: "accept" });
  });
});
