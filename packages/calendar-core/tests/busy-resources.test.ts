import { instantInterval } from "@moltenship/calendar-temporal";
import { describe, expect, test } from "vite-plus/test";

import {
  busyResources,
  conflictPolicy,
  createCanonicalEventAdapter,
  createEventSnapshot,
  type CalendarEvent,
  type CalendarEventChange,
  type CalendarEventPlacement,
  type EventSnapshot,
} from "../src/index";

type TestEvent = CalendarEvent<{ readonly showAs?: "busy" | "free" } | null, string, string>;

const newYork = "America/New_York";
const at = (value: string, zone = newYork) =>
  Temporal.ZonedDateTime.from(`${value}[${zone}]`).toInstant();
const range = (start: string, end: string, zone = newYork) =>
  instantInterval(at(start, zone), at(end, zone));

function timed(
  id: string,
  start: string,
  end: string,
  resourceIds: string[],
  zone = newYork,
): TestEvent {
  return {
    data: null,
    end: at(end, zone),
    id,
    kind: "timed",
    resourceIds,
    start: at(start, zone),
    title: id,
  };
}

const adapter = createCanonicalEventAdapter<TestEvent["data"], string, string>();
/** "Show as" from the event's data, falling back to the default for its kind. */
const showAs = {
  ...adapter,
  isBusy: (event: TestEvent) =>
    event.data?.showAs === undefined ? event.kind !== "all-day" : event.data.showAs === "busy",
};

const events = createEventSnapshot<TestEvent, string, string>(
  [
    timed("standup", "2026-10-08T09:00", "2026-10-08T09:30", ["ana", "orchid"]),
    timed("review", "2026-10-08T09:30", "2026-10-08T10:30", ["ana"]),
    timed("call", "2026-10-08T10:00", "2026-10-08T11:00", ["ben"]),
    // 09:00 to 10:00 in London is 04:00 to 05:00 in New York.
    timed("london-sync", "2026-10-08T09:00", "2026-10-08T10:00", ["leo"], "Europe/London"),
    {
      data: null,
      end: Temporal.PlainDateTime.from("2026-10-08T13:00"),
      id: "lunch",
      kind: "floating",
      resourceIds: ["ben"],
      start: Temporal.PlainDateTime.from("2026-10-08T12:00"),
      title: "lunch",
    },
    {
      data: null,
      end: Temporal.PlainDate.from("2026-10-09"),
      id: "holiday",
      kind: "all-day",
      resourceIds: ["ana", "orchid"],
      start: Temporal.PlainDate.from("2026-10-08"),
      title: "holiday",
    },
    {
      data: { showAs: "busy" },
      end: Temporal.PlainDate.from("2026-10-09"),
      id: "offsite",
      kind: "all-day",
      resourceIds: ["cedar"],
      start: Temporal.PlainDate.from("2026-10-08"),
      title: "offsite",
    },
    {
      ...timed("tentative", "2026-10-08T14:00", "2026-10-08T15:00", ["ben"]),
      data: { showAs: "free" },
    },
    timed("night-shift", "2026-10-08T22:00", "2026-10-09T06:00", ["ivy"]),
    // 01:30 EDT to 01:15 EST, through the repeated hour.
    timed("fall-back", "2026-11-01T01:30-04:00", "2026-11-01T01:15-05:00", ["dee"]),
  ],
  showAs,
);
const query = { timeZone: newYork };
const ids = (result: ReturnType<typeof busyResources>, resourceId: string) =>
  result.get(resourceId)?.map(({ id }) => id);

describe("busy resources over a range", () => {
  test("each busy resource gets its own events by start, and free ones are absent", () => {
    const result = busyResources(events, range("2026-10-08T09:15", "2026-10-08T10:15"), {
      ...query,
      resourceIds: ["ana", "ben", "orchid", "lotus"],
    });
    // The standup books Ana and Orchid; Ana's review and Ben's call mark only them.
    expect(ids(result, "ana")).toEqual(["standup", "review"]);
    expect(ids(result, "ben")).toEqual(["call"]);
    expect(ids(result, "orchid")).toEqual(["standup"]);
    expect(result.has("lotus")).toBe(false);
  });

  test("back-to-back events don't conflict, and resourceIds narrows the answer", () => {
    // The standup ends at 09:30 and the call starts at 10:00.
    const result = busyResources(events, range("2026-10-08T09:30", "2026-10-08T10:00"), query);
    expect(ids(result, "ana")).toEqual(["review"]);
    expect(result.has("orchid")).toBe(false);
    expect(result.has("ben")).toBe(false);
    expect(
      busyResources(events, range("2026-10-08T09:15", "2026-10-08T10:15"), {
        ...query,
        resourceIds: ["ben"],
      }).has("ana"),
    ).toBe(false);
  });

  test("all-day events are free by default, and isBusy overrides any kind", () => {
    const result = busyResources(events, range("2026-10-08T14:15", "2026-10-08T14:45"), query);
    // A holiday banner doesn't block; an offsite shown as busy does; a tentative meeting shown as
    // free doesn't.
    expect(result.has("ana")).toBe(false);
    expect(ids(result, "cedar")).toEqual(["offsite"]);
    expect(result.has("ben")).toBe(false);
  });

  test("floating events count on the given wall clock", () => {
    const span = range("2026-10-08T12:30", "2026-10-08T12:45");
    expect(ids(busyResources(events, span, query), "ben")).toEqual(["lunch"]);
    // At 12:30 New York time it is only 11:30 in Chicago, before lunch there.
    expect(busyResources(events, span, { timeZone: "America/Chicago" }).has("ben")).toBe(false);
  });

  test("an event that crosses midnight is busy on both dates", () => {
    expect(
      ids(busyResources(events, range("2026-10-08T23:00", "2026-10-08T23:30"), query), "ivy"),
    ).toEqual(["night-shift"]);
    expect(
      ids(busyResources(events, range("2026-10-09T05:00", "2026-10-09T07:00"), query), "ivy"),
    ).toEqual(["night-shift"]);
  });

  test("ranges are instants, so a resource in another time zone is busy by its own clock", () => {
    expect(
      ids(busyResources(events, range("2026-10-08T04:30", "2026-10-08T05:30"), query), "leo"),
    ).toEqual(["london-sync"]);
  });

  test("across a fall-back, the repeated hour counts by its real instants", () => {
    // 01:05 EST is in the second 01:00 hour, while the event runs until 01:15 EST.
    const second = busyResources(
      events,
      instantInterval(at("2026-11-01T01:05-05:00"), at("2026-11-01T01:10-05:00")),
      query,
    );
    expect(ids(second, "dee")).toEqual(["fall-back"]);
    const after = busyResources(
      events,
      instantInterval(at("2026-11-01T01:15-05:00"), at("2026-11-01T02:00-05:00")),
      query,
    );
    expect(after.has("dee")).toBe(false);
  });

  test("an excluded event, such as one being moved, doesn't conflict with itself", () => {
    const draft: CalendarEventPlacement<string> = {
      end: at("2026-10-08T10:45"),
      kind: "timed",
      resourceIds: ["ben"],
      start: at("2026-10-08T10:15"),
    };
    expect(ids(busyResources(events, draft, query), "ben")).toEqual(["call"]);
    expect(busyResources(events, draft, { ...query, exclude: "call" }).has("ben")).toBe(false);
  });
});

describe("many resources", () => {
  const resources = Array.from({ length: 30 }, (_, index) => `r${index}`);
  const day = Temporal.ZonedDateTime.from(`2026-10-05T00:00[${newYork}]`);
  // 10,000 events over four weeks: each books one or two resources for 15 to 90 minutes.
  const many = createEventSnapshot<TestEvent, string, string>(
    Array.from({ length: 10_000 }, (_, index) => {
      const start = day.add({ minutes: ((index * 37) % (28 * 24 * 4)) * 15 });
      const booked = [resources[index % 30]!];
      if (index % 7 === 0) booked.push(resources[(index * 11) % 30]!);
      return {
        data: null,
        end: start.add({ minutes: 15 * (1 + (index % 6)) }).toInstant(),
        id: `e${index}`,
        kind: "timed",
        resourceIds: [...new Set(booked)],
        start: start.toInstant(),
        title: `e${index}`,
      } satisfies TestEvent;
    }),
    adapter,
  );

  /** The snapshot, counting the queries made of it. */
  function counted(snapshot: EventSnapshot<TestEvent, string, string>) {
    const calls = { allDay: 0, floating: 0, timed: 0 };
    const wrapped: EventSnapshot<TestEvent, string, string> = {
      ...snapshot,
      queryAllDay: (...args) => (calls.allDay++, snapshot.queryAllDay(...args)),
      queryFloating: (...args) => (calls.floating++, snapshot.queryFloating(...args)),
      queryTimed: (...args) => (calls.timed++, snapshot.queryTimed(...args)),
    };
    return { calls, wrapped };
  }

  test("30 resources over 10,000 events take one query of each index, with every event found", () => {
    const { calls, wrapped } = counted(many);
    const span = range("2026-10-14T10:00", "2026-10-14T11:00");
    const result = busyResources(wrapped, span, { resourceIds: resources, timeZone: newYork });

    expect(calls).toEqual({ allDay: 1, floating: 1, timed: 1 });
    // The same answer as checking every event against every resource.
    const overlaps = (event: (typeof many.events)[number]) =>
      event.kind === "timed" &&
      Temporal.Instant.compare(event.start, span.end) < 0 &&
      Temporal.Instant.compare(span.start, event.end) < 0;
    for (const resourceId of resources) {
      const expected = many.events
        .filter((event) => event.resourceIds.includes(resourceId) && overlaps(event))
        .map(({ id }) => id)
        .sort();
      const found = (result.get(resourceId) ?? []).map(({ id }) => id).sort();
      expect(found).toEqual(expected);
    }
    // Some are busy and some free, so the check isn't vacuous.
    expect(result.size).toBeGreaterThan(0);
    expect(result.size).toBeLessThan(resources.length);
  });
});

describe("conflict policy", () => {
  const context = { events, timeZone: newYork };
  const create = (
    start: string,
    end: string,
    resourceIds: string[],
  ): CalendarEventChange<TestEvent, string, string> => ({
    cause: "create",
    event: null,
    eventId: null,
    id: "change",
    original: null,
    proposed: { end: at(end), kind: "timed", resourceIds, start: at(start) },
  });

  test("blocks double-booking, or flags it in warn mode", () => {
    const change = create("2026-10-08T09:15", "2026-10-08T09:45", ["orchid"]);
    expect(conflictPolicy()(change, context)).toEqual({
      reason: "resource-conflict",
      type: "reject",
    });
    expect(conflictPolicy({ mode: "warn" })(change, context)).toEqual({
      reason: "resource-conflict",
      type: "warn",
    });
    // Back to back is fine.
    expect(
      conflictPolicy()(create("2026-10-08T09:30", "2026-10-08T10:00", ["orchid"]), context),
    ).toEqual({ type: "accept" });
  });

  test("a moved event doesn't conflict with itself, and only what a change alters is checked", () => {
    const call = events.get("call")!;
    const original: CalendarEventPlacement<string> = {
      end: at("2026-10-08T11:00"),
      kind: "timed",
      resourceIds: ["ben"],
      start: at("2026-10-08T10:00"),
    };
    const move = (proposed: CalendarEventPlacement<string>) =>
      conflictPolicy<TestEvent, string, string>()(
        {
          cause: "move",
          event: call.event,
          eventId: "call",
          id: "change",
          original,
          proposed,
        },
        context,
      );
    expect(
      move({ ...original, end: at("2026-10-08T11:30"), start: at("2026-10-08T10:30") }),
    ).toEqual({ type: "accept" });
    // Adding Ana at the same time checks only Ana, who is in the review until 10:30.
    expect(move({ ...original, resourceIds: ["ben", "ana"] })).toEqual({
      reason: "resource-conflict",
      type: "reject",
    });
  });

  test("an all-day booking is free by default, so it books nothing", () => {
    const change: CalendarEventChange<TestEvent, string, string> = {
      cause: "create",
      event: null,
      eventId: null,
      id: "change",
      original: null,
      proposed: {
        end: Temporal.PlainDate.from("2026-10-09"),
        kind: "all-day",
        resourceIds: ["ben"],
        start: Temporal.PlainDate.from("2026-10-08"),
      },
    };
    expect(conflictPolicy<TestEvent, string, string>()(change, context)).toEqual({
      type: "accept",
    });
  });
});
