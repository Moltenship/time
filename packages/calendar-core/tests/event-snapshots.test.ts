import fc from "fast-check";
import { describe, expect, expectTypeOf, test } from "vite-plus/test";

import {
  instantInterval,
  plainDateInterval,
  plainDateTimeInterval,
} from "@moltenship/calendar-temporal";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  createEventSnapshotCache,
  InvalidCalendarEventSnapshotError,
  type CalendarEvent,
  type CalendarEventInterval,
  type CalendarEventSource,
  type EventAdapter,
  type EventSnapshot,
} from "../src/index.ts";

type TestEvent = CalendarEvent<Readonly<{ readonly revision: number }>, string, string>;

const canonicalAdapter = createCanonicalEventAdapter<
  Readonly<{ readonly revision: number }>,
  string,
  string
>();

function timedEvent(
  id: string,
  start: string,
  end: string,
  resourceIds: readonly string[] = [],
  revision = 1,
): TestEvent {
  return Object.freeze({
    data: Object.freeze({ revision }),
    end: Temporal.Instant.from(end),
    id,
    kind: "timed",
    resourceIds: Object.freeze([...resourceIds]),
    start: Temporal.Instant.from(start),
    title: id,
  });
}

describe("event snapshots", () => {
  test("reuses a complete snapshot for stable array and adapter identities", () => {
    let intervalReads = 0;
    const adapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getInterval(event) {
        intervalReads += 1;
        return event;
      },
    };
    const events = Object.freeze([timedEvent("a", "2026-08-15T09:00Z", "2026-08-15T10:00Z")]);
    const cache = createEventSnapshotCache(adapter);

    const first = cache.getSnapshot(events);
    const second = cache.getSnapshot(events);

    expect(second).toBe(first);
    expect(second.version).toBe(1);
    expect(intervalReads).toBe(1);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);
    expect("set" in first.byId).toBe(false);
  });

  test("normalizes a new array once and structurally reuses matching revisions", () => {
    interface RevisionEvent {
      readonly end: Temporal.Instant;
      readonly id: string;
      readonly revision: number;
      readonly start: Temporal.Instant;
      readonly title: string;
    }

    const calls = { id: 0, interval: 0, resources: 0, revision: 0, title: 0 };
    const adapter: EventAdapter<RevisionEvent, string, string> = {
      getId(event) {
        calls.id += 1;
        return event.id;
      },
      getInterval(event) {
        calls.interval += 1;
        return { end: event.end, kind: "timed", start: event.start };
      },
      getResourceIds() {
        calls.resources += 1;
        return [];
      },
      getRevision(event) {
        calls.revision += 1;
        return event.revision;
      },
      getTitle(event) {
        calls.title += 1;
        return event.title;
      },
    };
    const firstEvent = Object.freeze({
      end: Temporal.Instant.from("2026-08-15T10:00Z"),
      id: "a",
      revision: 4,
      start: Temporal.Instant.from("2026-08-15T09:00Z"),
      title: "A",
    });
    const recreatedEvent = Object.freeze({ ...firstEvent });
    const cache = createEventSnapshotCache(adapter);

    const first = cache.getSnapshot(Object.freeze([firstEvent]));
    const second = cache.getSnapshot(Object.freeze([recreatedEvent]));

    expect(second).not.toBe(first);
    expect(second.version).toBe(2);
    expect(second.get("a")?.event).toBe(recreatedEvent);
    expect(calls).toEqual({ id: 2, interval: 1, resources: 1, revision: 2, title: 1 });

    const changed = Object.freeze({ ...recreatedEvent, revision: 5, title: "A changed" });
    const third = cache.getSnapshot(Object.freeze([changed]));
    expect(third.version).toBe(3);
    expect(third.get("a")?.title).toBe("A changed");
    expect(calls).toEqual({ id: 3, interval: 2, resources: 2, revision: 3, title: 2 });
  });

  test("structurally reuses unchanged string revisions while exposing the latest record", () => {
    interface RevisionEvent {
      readonly end: Temporal.Instant;
      readonly id: string;
      readonly revision: string;
      readonly start: Temporal.Instant;
      readonly title: string;
    }

    let intervalReads = 0;
    const adapter: EventAdapter<RevisionEvent, string, string> = {
      getId: ({ id }) => id,
      getInterval(event) {
        intervalReads += 1;
        return { end: event.end, kind: "timed", start: event.start };
      },
      getResourceIds: () => [],
      getRevision: ({ revision }) => revision,
      getTitle: ({ title }) => title,
    };
    const firstEvent = Object.freeze({
      end: Temporal.Instant.from("2026-08-15T10:00Z"),
      id: "string-revision",
      revision: "v1",
      start: Temporal.Instant.from("2026-08-15T09:00Z"),
      title: "String revision",
    });
    const latestEvent = Object.freeze({ ...firstEvent });
    const cache = createEventSnapshotCache(adapter);

    cache.getSnapshot(Object.freeze([firstEvent]));
    const reused = cache.getSnapshot(Object.freeze([latestEvent]));

    expect(reused.get("string-revision")?.event).toBe(latestEvent);
    expect(intervalReads).toBe(1);
  });

  test("queries every Temporal kind and resource with half-open adjacency", () => {
    const events: readonly TestEvent[] = Object.freeze([
      timedEvent("left", "2026-08-15T09:00Z", "2026-08-15T10:00Z", ["room-a"]),
      timedEvent("right", "2026-08-15T10:00Z", "2026-08-15T11:00Z", ["room-b"]),
      Object.freeze({
        data: Object.freeze({ revision: 1 }),
        end: Temporal.PlainDate.from("2026-08-17"),
        id: "all-day",
        kind: "all-day",
        resourceIds: Object.freeze(["room-a"]),
        start: Temporal.PlainDate.from("2026-08-15"),
        title: "all-day",
      }),
      Object.freeze({
        data: Object.freeze({ revision: 1 }),
        end: Temporal.PlainDateTime.from("2026-08-15T11:00"),
        id: "floating",
        kind: "floating",
        resourceIds: Object.freeze(["room-a", "room-b"]),
        start: Temporal.PlainDateTime.from("2026-08-15T10:00"),
        title: "floating",
      }),
    ]);
    const snapshot = createEventSnapshot(events, canonicalAdapter);

    expect(
      snapshot
        .queryTimed(
          instantInterval(
            Temporal.Instant.from("2026-08-15T10:00Z"),
            Temporal.Instant.from("2026-08-15T11:00Z"),
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["right"]);
    expect(
      snapshot
        .queryTimed(
          instantInterval(
            Temporal.Instant.from("2026-08-15T09:30Z"),
            Temporal.Instant.from("2026-08-15T10:30Z"),
          ),
          { resourceIds: ["room-a"] },
        )
        .map(({ id }) => id),
    ).toEqual(["left"]);
    expect(
      snapshot.queryTimed(
        instantInterval(
          Temporal.Instant.from("2026-08-15T09:30Z"),
          Temporal.Instant.from("2026-08-15T10:30Z"),
        ),
        { resourceIds: [] },
      ),
    ).toEqual([]);
    expect(
      snapshot
        .queryAllDay(
          plainDateInterval(
            Temporal.PlainDate.from("2026-08-16"),
            Temporal.PlainDate.from("2026-08-17"),
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["all-day"]);
    expect(
      snapshot
        .queryFloating(
          plainDateTimeInterval(
            Temporal.PlainDateTime.from("2026-08-15T10:30"),
            Temporal.PlainDateTime.from("2026-08-15T11:30"),
          ),
        )
        .map(({ id }) => id),
    ).toEqual(["floating"]);
    expect(snapshot.eventsForResource("room-a").map(({ id }) => id)).toEqual([
      "left",
      "all-day",
      "floating",
    ]);
  });

  test("reports and skips invalid events by default, while strict mode throws", () => {
    const valid = timedEvent("valid", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const duplicate = timedEvent("valid", "2026-08-15T11:00Z", "2026-08-15T12:00Z");
    const empty = {
      ...timedEvent("empty", "2026-08-15T13:00Z", "2026-08-15T14:00Z"),
      end: Temporal.Instant.from("2026-08-15T13:00Z"),
    };
    const invalidResource = {
      ...timedEvent("bad-resource", "2026-08-15T15:00Z", "2026-08-15T16:00Z"),
      resourceIds: [Number.NaN] as unknown as readonly string[],
    };
    const events = Object.freeze([valid, duplicate, empty, invalidResource]);
    const snapshot = createEventSnapshot(events, canonicalAdapter);

    expect(snapshot.events.map(({ id }) => id)).toEqual(["valid"]);
    expect(snapshot.issues.map(({ code }) => code)).toEqual([
      "duplicate-event-id",
      "start-not-before-end",
      "invalid-resource-id",
    ]);
    expect(() =>
      createEventSnapshot(events, canonicalAdapter, { invalidEventPolicy: "throw" }),
    ).toThrow(InvalidCalendarEventSnapshotError);
  });

  test("reports adapter failures without publishing a partial record", () => {
    const event = timedEvent("broken", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const adapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getTitle() {
        throw new Error("title-read-failed");
      },
    };

    const snapshot = createEventSnapshot(Object.freeze([event]), adapter);

    expect(snapshot.size).toBe(0);
    expect(snapshot.issues).toEqual([
      {
        accessor: "getTitle",
        code: "adapter-error",
        event,
        eventId: "broken",
        index: 0,
        message: "title-read-failed",
      },
    ]);
  });

  test("distinguishes interval accessor failures from malformed returned intervals", () => {
    const event = timedEvent("broken", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const throwingAdapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getInterval() {
        throw new Error("interval-read-failed");
      },
    };
    const malformedEndpointAdapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getInterval(currentEvent) {
        return {
          ...currentEvent,
          start: 42 as unknown as Temporal.Instant,
        } as unknown as CalendarEventInterval;
      },
    };
    const malformedTimeZoneAdapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getInterval(currentEvent) {
        return {
          ...currentEvent,
          sourceTimeZone: 42 as unknown as string,
        };
      },
    };

    expect(createEventSnapshot(Object.freeze([event]), throwingAdapter).issues).toEqual([
      {
        accessor: "getInterval",
        code: "adapter-error",
        event,
        eventId: "broken",
        index: 0,
        message: "interval-read-failed",
      },
    ]);
    expect(createEventSnapshot(Object.freeze([event]), malformedEndpointAdapter).issues).toEqual([
      {
        accessor: "getInterval",
        code: "invalid-event-interval",
        event,
        eventId: "broken",
        index: 0,
        message: "interval-endpoints-must-match-kind",
      },
    ]);
    expect(createEventSnapshot(Object.freeze([event]), malformedTimeZoneAdapter).issues).toEqual([
      {
        accessor: "getInterval",
        code: "invalid-event-interval",
        event,
        eventId: "broken",
        index: 0,
        message: "source-time-zone-must-be-a-string",
      },
    ]);
  });

  test("contains throwing returned interval properties inside the invalid-record policy", () => {
    const event = timedEvent("broken", "2026-08-15T09:00Z", "2026-08-15T10:00Z");

    for (const property of ["kind", "start", "end", "sourceTimeZone"] as const) {
      const returnedInterval = {
        end: event.end,
        kind: "timed" as const,
        sourceTimeZone: "UTC",
        start: event.start,
      };
      Object.defineProperty(returnedInterval, property, {
        get() {
          throw new Error(`${property}-read-failed`);
        },
      });
      const adapter: EventAdapter<TestEvent, string, string> = {
        ...canonicalAdapter,
        getInterval: () => returnedInterval as CalendarEventInterval,
      };

      const snapshot = createEventSnapshot(Object.freeze([event]), adapter);

      expect(snapshot.size).toBe(0);
      expect(snapshot.issues).toEqual([
        {
          accessor: "getInterval",
          code: "invalid-event-interval",
          event,
          eventId: "broken",
          index: 0,
          message: `${property}-read-failed`,
        },
      ]);
    }
  });

  test("preserves nanosecond adjacency without numeric millisecond conversion", () => {
    const atZero = Temporal.Instant.fromEpochNanoseconds(0n);
    const atOne = Temporal.Instant.fromEpochNanoseconds(1n);
    const atTwo = Temporal.Instant.fromEpochNanoseconds(2n);
    const snapshot = createEventSnapshot(
      Object.freeze([
        {
          data: Object.freeze({ revision: 1 }),
          end: atOne,
          id: "first",
          kind: "timed",
          start: atZero,
          title: "first",
        },
        {
          data: Object.freeze({ revision: 1 }),
          end: atTwo,
          id: "second",
          kind: "timed",
          start: atOne,
          title: "second",
        },
      ] satisfies readonly TestEvent[]),
      canonicalAdapter,
    );

    expect(snapshot.queryTimed(instantInterval(atOne, atTwo)).map(({ id }) => id)).toEqual([
      "second",
    ]);
  });

  test("bounds query results with an observable LRU cache", () => {
    const snapshot = createEventSnapshot(
      Object.freeze([timedEvent("a", "2026-08-15T09:00Z", "2026-08-15T12:00Z", ["room-a"])]),
      canonicalAdapter,
      { queryCacheSize: 2 },
    );
    const range = (hour: number) =>
      instantInterval(
        Temporal.Instant.from(`2026-08-15T${String(hour).padStart(2, "0")}:00Z`),
        Temporal.Instant.from(`2026-08-15T${String(hour + 1).padStart(2, "0")}:00Z`),
      );

    const first = snapshot.queryTimed(range(9));
    expect(snapshot.queryTimed(range(9))).toBe(first);
    snapshot.queryTimed(range(10));
    snapshot.queryTimed(range(11));

    expect(snapshot.getQueryCacheStatistics()).toEqual({
      capacity: 2,
      evictions: 1,
      hits: 1,
      misses: 3,
      size: 2,
    });
  });

  test("canonicalizes cache keys across every query kind and resource-filter order", () => {
    const events: readonly TestEvent[] = Object.freeze([
      timedEvent("timed", "2026-08-15T09:00Z", "2026-08-15T12:00Z", ["room-a", "room-b"]),
      Object.freeze({
        data: Object.freeze({ revision: 1 }),
        end: Temporal.PlainDate.from("2026-08-17"),
        id: "all-day",
        kind: "all-day",
        resourceIds: Object.freeze(["room-a"]),
        start: Temporal.PlainDate.from("2026-08-15"),
        title: "all-day",
      }),
      Object.freeze({
        data: Object.freeze({ revision: 1 }),
        end: Temporal.PlainDateTime.from("2026-08-15T12:00"),
        id: "floating",
        kind: "floating",
        resourceIds: Object.freeze(["room-b"]),
        start: Temporal.PlainDateTime.from("2026-08-15T09:00"),
        title: "floating",
      }),
    ]);
    const snapshot = createEventSnapshot(events, canonicalAdapter, { queryCacheSize: 8 });
    const timedRange = instantInterval(
      Temporal.Instant.from("2026-08-15T10:00Z"),
      Temporal.Instant.from("2026-08-15T11:00Z"),
    );
    const allDayRange = plainDateInterval(
      Temporal.PlainDate.from("2026-08-15"),
      Temporal.PlainDate.from("2026-08-16"),
    );
    const floatingRange = plainDateTimeInterval(
      Temporal.PlainDateTime.from("2026-08-15T10:00"),
      Temporal.PlainDateTime.from("2026-08-15T11:00"),
    );

    const timed = snapshot.queryTimed(timedRange);
    const allDay = snapshot.queryAllDay(allDayRange);
    const floating = snapshot.queryFloating(floatingRange);
    const resource = snapshot.eventsForResource("room-a");
    const filtered = snapshot.queryTimed(timedRange, { resourceIds: ["room-b", "room-a"] });

    expect(snapshot.queryTimed(timedRange)).toBe(timed);
    expect(snapshot.queryAllDay(allDayRange)).toBe(allDay);
    expect(snapshot.queryFloating(floatingRange)).toBe(floating);
    expect(snapshot.eventsForResource("room-a")).toBe(resource);
    expect(snapshot.queryTimed(timedRange, { resourceIds: ["room-a", "room-b"] })).toBe(filtered);
    expect(snapshot.getQueryCacheStatistics()).toEqual({
      capacity: 8,
      evictions: 0,
      hits: 5,
      misses: 5,
      size: 5,
    });

    const uncached = createEventSnapshot(events, canonicalAdapter, { queryCacheSize: 0 });
    expect(uncached.queryTimed(timedRange)).not.toBe(uncached.queryTimed(timedRange));
    expect(uncached.getQueryCacheStatistics()).toEqual({
      capacity: 0,
      evictions: 0,
      hits: 0,
      misses: 2,
      size: 0,
    });
  });

  test.each([
    ["undefined", undefined],
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["an object", Object.freeze({})],
  ])("reports %s as an invalid adapter revision", (_name, revision) => {
    const event = timedEvent("revision", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const adapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getRevision: () => revision as unknown as string | number,
    };

    expect(createEventSnapshot(Object.freeze([event]), adapter).issues).toEqual([
      {
        code: "invalid-revision",
        event,
        eventId: "revision",
        index: 0,
      },
    ]);
  });

  test("contains every optional adapter failure inside the invalid-data policy", () => {
    const event = timedEvent("adapter", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const adapters: readonly [EventAdapter<TestEvent, string, string>, string, string][] = [
      [
        {
          ...canonicalAdapter,
          getRevision() {
            throw new Error("revision-read-failed");
          },
        },
        "getRevision",
        "adapter-error",
      ],
      [
        { ...canonicalAdapter, getResourceIds: () => "room-a" as unknown as readonly string[] },
        "getResourceIds",
        "adapter-error",
      ],
      [
        { ...canonicalAdapter, getTitle: () => 42 as unknown as string },
        "getTitle",
        "adapter-error",
      ],
      [
        { ...canonicalAdapter, isReadOnly: () => "yes" as unknown as boolean },
        "isReadOnly",
        "adapter-error",
      ],
    ];

    for (const [adapter, accessor, code] of adapters) {
      const [issue] = createEventSnapshot(Object.freeze([event]), adapter).issues;
      expect(issue).toMatchObject({ accessor, code, event, eventId: "adapter", index: 0 });
    }
  });

  test("contains event-ID accessor failures before an ID is available", () => {
    const event = timedEvent("adapter", "2026-08-15T09:00Z", "2026-08-15T10:00Z");
    const adapter: EventAdapter<TestEvent, string, string> = {
      ...canonicalAdapter,
      getId() {
        throw new Error("id-read-failed");
      },
    };

    expect(createEventSnapshot(Object.freeze([event]), adapter).issues).toEqual([
      {
        accessor: "getId",
        code: "adapter-error",
        event,
        index: 0,
        message: "id-read-failed",
      },
    ]);
  });

  test("exposes the advanced external-store contract without owning subscriptions", () => {
    const snapshot = createEventSnapshot(
      Object.freeze([timedEvent("a", "2026-08-15T09:00Z", "2026-08-15T10:00Z")]),
      canonicalAdapter,
    );
    const source = {
      getServerSnapshot: () => snapshot,
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    } satisfies CalendarEventSource<TestEvent, string, string>;

    expect(source.getServerSnapshot()).toBe(source.getSnapshot());
    expectTypeOf(source.getSnapshot()).toEqualTypeOf<EventSnapshot<TestEvent, string, string>>();
  });
});

describe("event snapshot index properties", () => {
  type RawEvent = {
    readonly end: number;
    readonly id: string;
    readonly kind: "all-day" | "floating" | "timed";
    readonly start: number;
  };
  const originInstant = Temporal.Instant.from("2026-08-15T00:00Z");
  const originDate = Temporal.PlainDate.from("2026-08-15");
  const originDateTime = Temporal.PlainDateTime.from("2026-08-15T00:00");
  const adapter: EventAdapter<RawEvent, string, string> = {
    getId: ({ id }) => id,
    getInterval(event) {
      return event.kind === "timed"
        ? {
            end: originInstant.add({ minutes: event.end }),
            kind: "timed",
            start: originInstant.add({ minutes: event.start }),
          }
        : event.kind === "all-day"
          ? {
              end: originDate.add({ days: event.end }),
              kind: "all-day",
              start: originDate.add({ days: event.start }),
            }
          : {
              end: originDateTime.add({ minutes: event.end }),
              kind: "floating",
              start: originDateTime.add({ minutes: event.start }),
            };
    },
    getResourceIds: () => [],
    getTitle: ({ id }) => id,
  };
  const kindArbitrary = fc.constantFrom<RawEvent["kind"]>("timed", "all-day", "floating");

  test("matches a simple reference for randomized half-open queries", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: kindArbitrary,
            length: fc.integer({ min: 1, max: 20 }),
            start: fc.integer({ min: -100, max: 100 }),
          }),
          { maxLength: 120 },
        ),
        fc.record({
          kind: kindArbitrary,
          length: fc.integer({ min: 1, max: 30 }),
          start: fc.integer({ min: -120, max: 120 }),
        }),
        (rawEntries, rawQuery) => {
          const events = rawEntries.map(
            (entry, index): RawEvent => ({
              end: entry.start + entry.length,
              id: `event-${index}`,
              kind: entry.kind,
              start: entry.start,
            }),
          );
          const queryEnd = rawQuery.start + rawQuery.length;
          const expected = events
            .filter(
              (event) =>
                event.kind === rawQuery.kind &&
                event.start < queryEnd &&
                event.end > rawQuery.start,
            )
            .map(({ id }) => id);
          const snapshot = createEventSnapshot(events, adapter, { queryCacheSize: 0 });
          const actual =
            rawQuery.kind === "timed"
              ? snapshot.queryTimed(
                  instantInterval(
                    originInstant.add({ minutes: rawQuery.start }),
                    originInstant.add({ minutes: queryEnd }),
                  ),
                )
              : rawQuery.kind === "all-day"
                ? snapshot.queryAllDay(
                    plainDateInterval(
                      originDate.add({ days: rawQuery.start }),
                      originDate.add({ days: queryEnd }),
                    ),
                  )
                : snapshot.queryFloating(
                    plainDateTimeInterval(
                      originDateTime.add({ minutes: rawQuery.start }),
                      originDateTime.add({ minutes: queryEnd }),
                    ),
                  );

          expect(actual.map(({ id }) => id)).toEqual(expected);
        },
      ),
      { numRuns: 500, seed: 0x23_2026 },
    );
  });
});
