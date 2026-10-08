import { describe, expect, test } from "vite-plus/test";

import {
  instantInterval,
  plainDateInterval,
  type InstantInterval,
} from "@moltenship/calendar-temporal";

import {
  applyEventOverlay,
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarEvent,
  type CalendarEventPlacement,
  type EventAdapter,
} from "../src/index";

type TestEvent = CalendarEvent<null, string, string>;

function timed(
  id: string,
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
): TestEvent {
  return {
    data: null,
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    resourceIds,
    start: Temporal.Instant.from(start),
    title: id,
  };
}

function placement(
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
): CalendarEventPlacement<string> {
  return {
    end: Temporal.Instant.from(end),
    kind: "timed",
    resourceIds,
    start: Temporal.Instant.from(start),
  };
}

const morning: InstantInterval = instantInterval(
  Temporal.Instant.from("2026-08-15T08:00Z"),
  Temporal.Instant.from("2026-08-15T12:00Z"),
);
const afternoon: InstantInterval = instantInterval(
  Temporal.Instant.from("2026-08-15T12:00Z"),
  Temporal.Instant.from("2026-08-15T18:00Z"),
);

const events = [
  timed("a", "2026-08-15T09:00Z", "2026-08-15T10:00Z", ["room-1"]),
  timed("b", "2026-08-15T10:00Z", "2026-08-15T11:00Z", ["room-2"]),
  timed("c", "2026-08-15T13:00Z", "2026-08-15T14:00Z", ["room-1"]),
];

function ids(values: readonly { readonly id: string }[]) {
  return values.map(({ id }) => id);
}

describe("event overlay", () => {
  test("returns the base snapshot when nothing it contains is pending", () => {
    const base = createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>());

    expect(applyEventOverlay(base, new Map())).toBe(base);
    expect(applyEventOverlay(base, new Map([["missing", null]]))).toBe(base);
  });

  test("moves a pending event between query results and keeps input order", () => {
    const base = createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>());
    const overlay = applyEventOverlay(
      base,
      new Map([["a", placement("2026-08-15T13:30Z", "2026-08-15T14:30Z", ["room-1"])]]),
    );

    expect(ids(overlay.queryTimed(morning))).toEqual(["b"]);
    expect(ids(overlay.queryTimed(afternoon))).toEqual(["a", "c"]);
    expect(overlay.get("a")).toMatchObject({ event: events[0], isPending: true, title: "a" });
    expect(overlay.get("b")).toBe(base.get("b"));
    expect(ids(overlay.events)).toEqual(["a", "b", "c"]);
    expect(overlay.byId.get("a")).toBe(overlay.get("a"));
    expect(overlay.size).toBe(3);

    // The base snapshot and the application's event are untouched.
    expect(ids(base.queryTimed(morning))).toEqual(["a", "b"]);
    expect(base.get("a")?.isPending).toBeUndefined();
    expect(events[0]?.start.toString()).toBe("2026-08-15T09:00:00Z");
  });

  test("hides pending deletions everywhere", () => {
    const base = createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>());
    const overlay = applyEventOverlay(base, new Map([["b", null]]));

    expect(overlay.get("b")).toBeUndefined();
    expect(ids(overlay.queryTimed(morning))).toEqual(["a"]);
    expect(ids(overlay.events)).toEqual(["a", "c"]);
    expect(overlay.byId.has("b")).toBe(false);
    expect(overlay.size).toBe(2);
    expect(ids(overlay.eventsForResource("room-2"))).toEqual([]);
  });

  test("follows kind and resource changes", () => {
    const base = createEventSnapshot(events, createCanonicalEventAdapter<null, string, string>());
    const overlay = applyEventOverlay(
      base,
      new Map<string, CalendarEventPlacement<string>>([
        [
          "a",
          {
            end: Temporal.PlainDate.from("2026-08-16"),
            kind: "all-day",
            resourceIds: ["room-1"],
            start: Temporal.PlainDate.from("2026-08-15"),
          },
        ],
        ["c", placement("2026-08-15T13:00Z", "2026-08-15T14:00Z", ["room-2"])],
      ]),
    );
    const day = plainDateInterval(
      Temporal.PlainDate.from("2026-08-15"),
      Temporal.PlainDate.from("2026-08-16"),
    );

    expect(ids(overlay.queryTimed(morning))).toEqual(["b"]);
    expect(ids(overlay.queryAllDay(day))).toEqual(["a"]);
    expect(overlay.get("a")).toMatchObject({ kind: "all-day", isPending: true });
    expect(overlay.get("a")).not.toHaveProperty("sourceTimeZone");
    expect(ids(overlay.eventsForResource("room-1"))).toEqual(["a"]);
    expect(ids(overlay.eventsForResource("room-2"))).toEqual(["b", "c"]);
    expect(ids(overlay.queryTimed(afternoon, { resourceIds: ["room-1"] }))).toEqual([]);
    expect(ids(overlay.queryTimed(afternoon, { resourceIds: ["room-2"] }))).toEqual(["c"]);
  });

  test("never reads the adapter or rebuilds the base indexes", () => {
    let adapterReads = 0;
    const canonical = createCanonicalEventAdapter<null, string, string>();
    const adapter: EventAdapter<TestEvent, string, string> = {
      ...canonical,
      getInterval(event) {
        adapterReads += 1;
        return canonical.getInterval(event);
      },
    };
    const base = createEventSnapshot(events, adapter);
    const readsAfterBase = adapterReads;

    const overlay = applyEventOverlay(
      base,
      new Map([["a", placement("2026-08-15T13:30Z", "2026-08-15T14:30Z")]]),
    );
    overlay.queryTimed(afternoon);
    overlay.queryTimed(afternoon);

    expect(adapterReads).toBe(readsAfterBase);
    // Overlay queries go through the base snapshot's index and query cache.
    expect(base.getQueryCacheStatistics()).toMatchObject({ hits: 1, misses: 1 });
  });
});
