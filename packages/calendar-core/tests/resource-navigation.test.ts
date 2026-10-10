import { describe, expect, test } from "vite-plus/test";

import {
  createEventSnapshot,
  createCanonicalEventAdapter,
  createResourceTree,
  keyboardSessionProposal,
  movePlacementToTarget,
  moveKeyboardCursor,
  projectResourceColumns,
  projectResourceTimeline,
  resourceColumnsSpatialNavigation,
  resizePlacementToTarget,
  resourceTimelineSpatialNavigation,
  startKeyboardSession,
  type CalendarCellFocus,
  type CalendarEnvironmentBase,
  type CalendarFocus,
  type CalendarNavigationCommand,
  type CalendarResource,
  type CalendarSpatialNavigation,
  type ResourceId,
} from "../src/index";
import {
  allDay,
  dates,
  environment,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

const timeZone = "America/New_York";
const snap = { increment: 15, smallestUnit: "minute" } as const;
const at = (wall: string) =>
  Temporal.ZonedDateTime.from(`${wall}[${timeZone}]`).toInstant().toString();
const resources = createResourceTree(
  ["orchid", "lotus", "cedar"].map((id): CalendarResource<null> => ({ data: null, id, title: id })),
);

function on(event: FixtureEvent, ...resourceIds: string[]): FixtureEvent {
  return { ...event, resourceIds };
}

/** A focus as `resource:date`, `resource:dateTtime`, or `resource:event@date`. */
function read(result: CalendarSpatialNavigation | null): string | null {
  if (result === null) return null;
  if ("page" in result) return `page ${result.page}`;
  const { focus } = result;
  const where = `${focus.resourceId === undefined ? "-" : (focus.resourceId ?? "unassigned")}:`;
  if (focus.kind === "slot") {
    return `${where}${focus.date.toString()}T${focus.time.toString({ smallestUnit: "minute" })}`;
  }
  return focus.kind === "event"
    ? `${where}${focus.eventId}@${focus.date.toString()}`
    : `${where}${focus.date.toString()}`;
}

function slot(resourceId: ResourceId | null | undefined, wall: string): CalendarFocus {
  const value = Temporal.PlainDateTime.from(wall);
  return { date: value.toPlainDate(), kind: "slot", resourceId, time: value.toPlainTime() };
}
const day = (resourceId: ResourceId | undefined, date: string): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  kind: "day",
  resourceId,
});
const event = (
  resourceId: ResourceId | undefined,
  eventId: string,
  date: string,
): CalendarFocus => ({
  date: Temporal.PlainDate.from(date),
  eventId,
  kind: "event",
  resourceId,
});

describe("resource-columns navigation", () => {
  const env = environment(timeZone);
  const events = [
    on(timed("standup", at("2026-10-08T09:00"), at("2026-10-08T09:30")), "lotus"),
    on(allDay("offsite", "2026-10-08", "2026-10-09"), "lotus"),
  ];

  function navigator(
    range = dates("2026-10-08", "2026-10-10"),
    direction: CalendarEnvironmentBase["direction"] = "ltr",
  ) {
    const environment = { ...env, direction };
    const projection = projectResourceColumns({
      ...viewInput(snapshotOf(events), range, environment, "2026-10-09"),
      expandedResourceIds: [],
      resources,
    });
    return (command: CalendarNavigationCommand, focus: CalendarFocus | null) =>
      read(
        resourceColumnsSpatialNavigation({
          command,
          environment,
          focus,
          options: undefined,
          projection,
          range,
          snap,
        }),
      );
  }

  test("left and right walk the columns resource by resource, then page", () => {
    const go = navigator();

    expect(go("right", slot("orchid", "2026-10-08T09:00"))).toBe("orchid:2026-10-09T09:00");
    expect(go("right", slot("orchid", "2026-10-09T09:00"))).toBe("lotus:2026-10-08T09:00");
    expect(go("left", day("lotus", "2026-10-08"))).toBe("orchid:2026-10-09");
    // Past either end, the column at the other end a whole range away.
    expect(go("right", slot("cedar", "2026-10-09T09:00"))).toBe("orchid:2026-10-10T09:00");
    expect(go("left", slot("orchid", "2026-10-08T09:00"))).toBe("cedar:2026-10-07T09:00");
    expect(navigator(undefined, "rtl")("left", slot("orchid", "2026-10-08T09:00"))).toBe(
      "orchid:2026-10-09T09:00",
    );
  });

  test("Home, End, and the Page keys", () => {
    const go = navigator();

    expect(go("home", slot("cedar", "2026-10-09T09:00"))).toBe("orchid:2026-10-08T09:00");
    expect(go("end", day("orchid", "2026-10-08"))).toBe("cedar:2026-10-09");
    expect(go("page-down", slot("lotus", "2026-10-08T09:00"))).toBe("lotus:2026-10-10T09:00");
    expect(go("page-up", day("lotus", "2026-10-09"))).toBe("lotus:2026-10-07");
  });

  test("up, down, Enter, and Escape stay in the focused resource's column", () => {
    const go = navigator();

    expect(go("down", slot("lotus", "2026-10-08T09:00"))).toBe("lotus:2026-10-08T09:15");
    expect(go("up", slot("lotus", "2026-10-08T00:00"))).toBe("lotus:2026-10-08");
    expect(go("enter", slot("lotus", "2026-10-08T09:15"))).toBe("lotus:standup@2026-10-08");
    // Orchid's column at the same time is empty.
    expect(go("enter", slot("orchid", "2026-10-08T09:15"))).toBeNull();
    expect(go("exit", event("lotus", "standup", "2026-10-08"))).toBe("lotus:2026-10-08T09:00");
    expect(go("enter", day("lotus", "2026-10-08"))).toBe("lotus:offsite@2026-10-08");
    expect(go("down", event("lotus", "offsite", "2026-10-08"))).toBe("lotus:2026-10-08T00:00");
  });

  test("enters on today in the first resource, and carries focus without a resource", () => {
    const go = navigator();

    expect(go("home", null)).toBe("orchid:2026-10-09");
    expect(go("end", null)).toBe("cedar:2026-10-09");
    expect(go("down", slot(undefined, "2026-10-08T09:00"))).toBe("orchid:2026-10-08T09:15");
  });
});

describe("resource-timeline navigation", () => {
  const env = environment(timeZone);
  const events = [
    on(timed("standup", at("2026-03-08T09:00"), at("2026-03-08T09:30")), "lotus"),
    on(timed("review", at("2026-03-08T11:00"), at("2026-03-08T12:00")), "lotus"),
    on(timed("pairing", at("2026-03-08T09:15"), at("2026-03-08T10:00")), "lotus", "cedar"),
    on(allDay("offsite", "2026-03-09", "2026-03-11"), "orchid"),
  ];

  function navigator(
    range: ReturnType<typeof dates>,
    direction: CalendarEnvironmentBase["direction"] = "ltr",
  ) {
    const environment = { ...env, direction };
    const projection = projectResourceTimeline({
      ...viewInput(snapshotOf(events), range, environment, "2026-03-08"),
      expandedResourceIds: [],
      resources,
    });
    return (command: CalendarNavigationCommand, focus: CalendarFocus | null) =>
      read(
        resourceTimelineSpatialNavigation({
          command,
          environment,
          focus,
          options: undefined,
          projection,
          range,
          snap,
        }),
      );
  }

  // 2026-03-08 is the spring-forward day: 02:00 becomes 03:00.
  const hours = navigator(dates("2026-03-08", "2026-03-09"));
  const week = navigator(dates("2026-03-08", "2026-03-15"));

  test("hour slots step along the row by the snap, across midnight and the gap", () => {
    expect(hours("right", slot("lotus", "2026-03-08T09:00"))).toBe("lotus:2026-03-08T09:15");
    expect(hours("right", slot("lotus", "2026-03-08T01:45"))).toBe("lotus:2026-03-08T03:00");
    expect(hours("left", slot("lotus", "2026-03-08T03:00"))).toBe("lotus:2026-03-08T01:45");
    expect(hours("right", slot("lotus", "2026-03-08T23:45"))).toBe("lotus:2026-03-09T00:00");
    expect(
      navigator(dates("2026-03-08", "2026-03-09"), "rtl")(
        "left",
        slot("lotus", "2026-03-08T09:00"),
      ),
    ).toBe("lotus:2026-03-08T09:15");
  });

  test("up and down keep the time in the neighbouring row", () => {
    expect(hours("down", slot("orchid", "2026-03-08T09:00"))).toBe("lotus:2026-03-08T09:00");
    expect(hours("up", slot("lotus", "2026-03-08T09:00"))).toBe("orchid:2026-03-08T09:00");
    expect(hours("up", slot("orchid", "2026-03-08T09:00"))).toBeNull();
    expect(hours("down", slot("cedar", "2026-03-08T09:00"))).toBeNull();
    expect(week("down", day("orchid", "2026-03-10"))).toBe("lotus:2026-03-10");
  });

  test("a slot off the snap keeps its time across rows, and steps along the row align it", () => {
    // As from a view with finer slots.
    expect(hours("down", slot("orchid", "2026-03-08T09:20"))).toBe("lotus:2026-03-08T09:20");
    expect(hours("left", slot("lotus", "2026-03-08T09:20"))).toBe("lotus:2026-03-08T09:15");
    expect(hours("right", slot("lotus", "2026-03-08T09:20"))).toBe("lotus:2026-03-08T09:30");
    // Over days it is its whole day.
    expect(week("down", slot("orchid", "2026-03-10T09:20"))).toBe("lotus:2026-03-10");
  });

  test("Home, End, and the Page keys move along the range", () => {
    expect(hours("home", slot("lotus", "2026-03-08T09:00"))).toBe("lotus:2026-03-08T00:00");
    expect(hours("end", slot("lotus", "2026-03-08T09:00"))).toBe("lotus:2026-03-08T23:45");
    expect(hours("page-down", slot("lotus", "2026-03-08T09:00"))).toBe("lotus:2026-03-09T09:00");
    expect(week("home", day("cedar", "2026-03-11"))).toBe("cedar:2026-03-08");
    expect(week("end", day("cedar", "2026-03-11"))).toBe("cedar:2026-03-14");
    expect(week("right", day("cedar", "2026-03-14"))).toBe("cedar:2026-03-15");
    expect(week("page-up", day("cedar", "2026-03-11"))).toBe("cedar:2026-03-04");
  });

  test("Enter goes into the row's events; events walk in time order and leave by row", () => {
    expect(hours("enter", slot("lotus", "2026-03-08T09:15"))).toBe("lotus:standup@2026-03-08");
    expect(hours("enter", slot("cedar", "2026-03-08T09:45"))).toBe("cedar:pairing@2026-03-08");
    expect(hours("enter", slot("orchid", "2026-03-08T09:15"))).toBeNull();
    expect(hours("right", event("lotus", "standup", "2026-03-08"))).toBe(
      "lotus:pairing@2026-03-08",
    );
    expect(hours("right", event("lotus", "pairing", "2026-03-08"))).toBe("lotus:review@2026-03-08");
    expect(hours("right", event("lotus", "review", "2026-03-08"))).toBeNull();
    expect(hours("exit", event("lotus", "review", "2026-03-08"))).toBe("lotus:2026-03-08T11:00");
    expect(hours("down", event("lotus", "pairing", "2026-03-08"))).toBe("cedar:2026-03-08T09:15");
    expect(week("enter", day("orchid", "2026-03-10"))).toBe("orchid:offsite@2026-03-10");
    expect(week("exit", event("orchid", "offsite", "2026-03-10"))).toBe("orchid:2026-03-09");
  });

  test("enters on today in the first row, or the range's last cell from the end", () => {
    expect(hours("home", null)).toBe("orchid:2026-03-08T00:00");
    expect(week("end", null)).toBe("cedar:2026-03-14");
    expect(week("down", day(undefined, "2026-03-10"))).toBe("lotus:2026-03-10");
  });
});

test("a keyboard move down a timeline row proposes what a pointer drop there does", () => {
  const range = dates("2026-03-08", "2026-03-09");
  const env = environment(timeZone);
  const fixture = on(
    timed("standup", at("2026-03-08T09:00"), at("2026-03-08T09:30")),
    "lotus",
    "orchid",
  );
  const snapshot = createEventSnapshot(
    [fixture],
    createCanonicalEventAdapter<null, string, string>(),
  );
  const projection = projectResourceTimeline({
    ...viewInput(snapshot, range, env),
    expandedResourceIds: [],
    resources,
  });
  const options = { snap, timeZone };
  const navigate = (command: CalendarNavigationCommand, focus: CalendarCellFocus) => {
    const result = resourceTimelineSpatialNavigation({
      command,
      environment: env,
      focus,
      options: undefined,
      projection,
      range,
      snap,
    });
    return (result as { readonly focus: CalendarCellFocus }).focus;
  };

  const grab = slot("lotus", "2026-03-08T09:00") as CalendarCellFocus;
  let session = startKeyboardSession(
    { cause: "move", cell: grab, event: snapshot.get("standup")! },
    options,
  );
  for (const command of ["down", "right", "right"] as const) {
    session = moveKeyboardCursor(session, navigate(command, session.cursor), options);
  }
  const pointer = movePlacementToTarget(
    session.original!,
    {
      at: Temporal.ZonedDateTime.from(`2026-03-08T09:00[${timeZone}]`),
      kind: "time",
      resourceId: "lotus",
    },
    {
      at: Temporal.ZonedDateTime.from(`2026-03-08T09:30[${timeZone}]`),
      kind: "time",
      resourceId: "cedar",
    },
    options,
  );

  expect(session.cursor).toEqual(slot("cedar", "2026-03-08T09:30"));
  expect(keyboardSessionProposal(session)).toEqual({
    cause: "move",
    eventId: "standup",
    proposed: pointer,
  });
  expect(pointer.resourceIds).toEqual(["cedar", "orchid"]);
});

test("a keyboard resize of an all-day bar in an hour timeline steps by days, as a pointer resize", () => {
  const range = dates("2026-10-08", "2026-10-09");
  const env = environment(timeZone);
  const fixture = on(allDay("offsite", "2026-10-08", "2026-10-09"), "lotus");
  const snapshot = createEventSnapshot(
    [fixture],
    createCanonicalEventAdapter<null, string, string>(),
  );
  const projection = projectResourceTimeline({
    ...viewInput(snapshot, range, env),
    expandedResourceIds: [],
    resources,
  });
  const options = { snap, timeZone };
  const navigate = (command: CalendarNavigationCommand, focus: CalendarFocus) => {
    const result = resourceTimelineSpatialNavigation({
      command,
      environment: env,
      focus,
      options: undefined,
      projection,
      range,
      snap,
    });
    return (result as { readonly focus: CalendarCellFocus }).focus;
  };

  // As the keyboard handler does: the event's cell from "exit", then its end edge.
  const cell = navigate("exit", event("lotus", "offsite", "2026-10-08"));
  let session = startKeyboardSession(
    { cause: "resize-end", cell, event: snapshot.get("offsite")! },
    options,
  );
  expect(session.cursor).toEqual(day("lotus", "2026-10-08"));
  for (const command of ["right", "page-down"] as const) {
    session = moveKeyboardCursor(session, navigate(command, session.cursor), options);
  }
  const zoned = (wall: string) => Temporal.ZonedDateTime.from(`${wall}[${timeZone}]`);
  const pointer = resizePlacementToTarget(
    session.original!,
    "end",
    { at: zoned("2026-10-08T23:00"), kind: "time", resourceId: "lotus" },
    { at: zoned("2026-10-10T23:00"), kind: "time", resourceId: "lotus" },
    options,
  );

  expect(session.cursor).toEqual(day("lotus", "2026-10-10"));
  expect(keyboardSessionProposal(session)).toEqual({
    cause: "resize-end",
    eventId: "offsite",
    proposed: pointer,
  });
  expect(pointer).toMatchObject({ end: Temporal.PlainDate.from("2026-10-11"), kind: "all-day" });
});
