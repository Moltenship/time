import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import {
  applyEventOverlay,
  createResourceTree,
  resourceTimelineSpatialNavigation,
  resourceTimelineStrategy,
  type CalendarEventPlacement,
  type CalendarNavigationCommand,
  type CalendarResource,
  type EventSnapshot,
  type OverlapLayout,
  type ResourceTimelineLayoutOptions,
  type ResourceTimelineOptions,
  type ResourceTimelineProjection,
} from "../src/index";
import {
  allDay,
  dates,
  environment,
  floating,
  snapshotOf,
  timed,
  viewInput,
  type FixtureEvent,
} from "./view-fixtures";

/**
 * Golden layouts of an hour timeline's rows, by overlap layout: each row reads as `laneCount /
 * height` and each bar as `id@lane/top`, with `top` in lanes to three places.
 */
type Space = CalendarResource<{ readonly kind: "person" | "room" }>;
type Options = ResourceTimelineLayoutOptions<FixtureEvent, Space> & ResourceTimelineOptions;
type Hours = Extract<ResourceTimelineProjection<FixtureEvent>, { unit: "hour" }>;

const spaces = createResourceTree<Space>([
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "person" }, id: "ada", title: "Ada" },
]);
const roomsStack = (resource: Space): OverlapLayout | undefined =>
  resource.data.kind === "room" ? "stack" : undefined;

function project(
  events: readonly FixtureEvent[],
  date: string,
  options: Options,
  timeZone = "UTC",
  snapshot: EventSnapshot<FixtureEvent, string, string> = snapshotOf(events),
): Hours {
  const range = dates(date, Temporal.PlainDate.from(date).add({ days: 1 }).toString());
  return resourceTimelineStrategy<Options, FixtureEvent>({ count: 1, kind: "days" }).project({
    ...viewInput(snapshot, range, environment(timeZone)),
    options: { unassigned: "bucket", ...options },
    resources: spaces,
  }) as Hours;
}

const share = (value: number) => Number(value.toFixed(3));

/** Each row by resource ID, as `laneCount/height: id@lane/top, …`. */
function read({ rows }: Hours): Record<string, string> {
  return Object.fromEntries(
    rows.map(({ bars, height, laneCount, resource }) => [
      String(resource.id),
      `${laneCount}/${share(height)}: ${bars.map(({ event, lane, top }) => `${event.id}@${lane}/${share(top)}`).join(" ")}`,
    ]),
  );
}

/** Books events on Orchid and Ada both. */
const both = (events: readonly FixtureEvent[]) =>
  events.map((event) => ({ ...event, resourceIds: ["orchid", "ada"] }));

const at = (time: string) => Temporal.Instant.from(`2026-10-08T${time}Z`);

/** The time grid's dense day: a desk all day, 16 overlapping talks, six sessions at once. */
const denseDay: readonly FixtureEvent[] = [
  timed("desk", "2026-10-08T08:00Z", "2026-10-08T17:00Z"),
  ...Array.from({ length: 16 }, (_, index) => {
    const start = at("09:00").add({ minutes: 15 * index });
    const id = `t${String(index + 1).padStart(2, "0")}`;
    return timed(id, start.toString(), start.add({ minutes: 45 }).toString());
  }),
  ...Array.from({ length: 6 }, (_, index) =>
    timed(`b${index + 1}`, "2026-10-08T14:00Z", "2026-10-08T15:00Z"),
  ),
  timed("late", "2026-10-08T16:30Z", "2026-10-08T17:30Z"),
];

const denseLanes =
  "7/7: desk@0/0 t01@1/1 t02@2/2 t03@3/3 t04@1/1 t05@2/2 t06@3/3 t07@1/1 t08@2/2 t09@3/3 t10@1/1 t11@2/2 t12@3/3 t13@1/1 t14@2/2 t15@3/3 t16@1/1 b1@1/1 b2@2/2 b3@3/3 b4@4/4 b5@5/5 b6@6/6 late@1/1";
// Each talk overlaps the two before it, so the stack is 16 deep and steps a 16th of a lane; the
// row stays two lanes tall.
const denseStack =
  "17/2: desk@0/0 t01@1/0.063 t02@2/0.125 t03@3/0.188 t04@4/0.25 t05@5/0.313 t06@6/0.375 t07@7/0.438 t08@8/0.5 t09@9/0.563 t10@10/0.625 t11@11/0.688 t12@12/0.75 t13@13/0.813 t14@14/0.875 t15@15/0.938 t16@16/1 b1@1/0.063 b2@2/0.125 b3@3/0.188 b4@4/0.25 b5@5/0.313 b6@6/0.375 late@1/0.063";

/** New York's fall-back day: both 01:00–01:30s fall on the same stretch of the wall clock. */
const fallBack: readonly FixtureEvent[] = [
  timed("standard", "2026-11-01T06:00Z", "2026-11-01T06:30Z"),
  timed("daylight", "2026-11-01T05:00Z", "2026-11-01T05:30Z"),
  timed("after", "2026-11-01T07:00Z", "2026-11-01T08:00Z"),
  timed("across", "2026-11-01T05:30Z", "2026-11-01T06:15Z"),
  timed("night", "2026-11-01T04:30Z", "2026-11-01T07:30Z"),
];

describe("hour rows by overlap layout", () => {
  test("a row in lanes grows a lane per level of overlap, as before", () => {
    for (const overlapLayout of ["columns", "equal"] as const) {
      expect(read(project(both(denseDay), "2026-10-08", { overlapLayout }))).toEqual({
        ada: denseLanes,
        null: "0/0: ",
        orchid: denseLanes,
      });
    }
  });

  test("a stacked row of 24 overlapping events cascades within two lanes", () => {
    expect(read(project(both(denseDay), "2026-10-08", { overlapLayout: "stack" }))).toEqual({
      ada: denseStack,
      null: "0/0: ",
      orchid: denseStack,
    });
  });

  test("each resource's row takes its own layout, and the bucket the view's", () => {
    const unassigned = [
      timed("u1", "2026-10-08T09:00Z", "2026-10-08T11:00Z"),
      timed("u2", "2026-10-08T10:00Z", "2026-10-08T12:00Z"),
    ];
    expect(
      read(
        project([...both(denseDay), ...unassigned], "2026-10-08", {
          getResourceOverlapLayout: roomsStack,
        }),
      ),
    ).toEqual({ ada: denseLanes, null: "2/2: u1@0/0 u2@1/1", orchid: denseStack });
  });

  test("lays out the repeated hour of a fall-back day in each resource's layout", () => {
    expect(
      read(
        project(
          both(fallBack),
          "2026-11-01",
          { getResourceOverlapLayout: roomsStack },
          "America/New_York",
        ),
      ),
    ).toEqual({
      ada: "4/4: night@0/0 across@1/1 daylight@2/2 standard@3/3 after@1/1",
      null: "0/0: ",
      orchid: "4/2: night@0/0 across@1/0.333 daylight@2/0.667 standard@3/1 after@1/0.333",
    });
  });

  test("all-day and day-long events are bars like any other", () => {
    const events = both([
      allDay("offsite", "2026-10-08", "2026-10-09"),
      timed("standup", "2026-10-08T09:00Z", "2026-10-08T09:30Z"),
      timed("review", "2026-10-08T09:15Z", "2026-10-08T10:00Z"),
    ]);

    expect(read(project(events, "2026-10-08", { getResourceOverlapLayout: roomsStack }))).toEqual({
      ada: "3/3: offsite@0/0 standup@1/1 review@2/2",
      null: "0/0: ",
      orchid: "3/1.667: offsite@0/0 standup@1/0.333 review@2/0.667",
    });
  });

  test("a group takes its events' own layout where they all agree, and the row's otherwise", () => {
    // Focus time stacks; the afternoon mixes it with a meeting, so it keeps Ada's lanes.
    const focus = (event: FixtureEvent) => (event.id.startsWith("f") ? "stack" : undefined);
    const events = both([
      timed("f1", "2026-10-08T09:00Z", "2026-10-08T11:00Z"),
      timed("f2", "2026-10-08T09:30Z", "2026-10-08T10:30Z"),
      timed("f3", "2026-10-08T14:00Z", "2026-10-08T15:00Z"),
      timed("m1", "2026-10-08T14:30Z", "2026-10-08T15:30Z"),
    ]);

    expect(
      read(
        project(events, "2026-10-08", {
          getEventOverlapLayout: focus,
          getResourceOverlapLayout: roomsStack,
        }),
      ),
    ).toEqual({
      ada: "2/2: f1@0/0 f2@1/0.333 f3@0/0 m1@1/1",
      null: "0/0: ",
      orchid: "2/1.333: f1@0/0 f2@1/0.333 f3@0/0 m1@1/0.333",
    });
  });

  test("an event that overlaps no group changes none", () => {
    const options = { getResourceOverlapLayout: roomsStack };
    const before = read(project(both(fallBack), "2026-11-01", options, "America/New_York"));
    const after = read(
      project(
        both([...fallBack, timed("dawn", "2026-11-01T12:00Z", "2026-11-01T13:00Z")]),
        "2026-11-01",
        options,
        "America/New_York",
      ),
    );

    expect(after.orchid).toBe(`${before.orchid} dawn@0/0`);
    expect(after.ada).toBe(`${before.ada} dawn@0/0`);
  });

  test("lays out a pending move to another resource as the saved event, in its new row", () => {
    const events = [
      ...both(fallBack.filter(({ id }) => id !== "after")),
      { ...fallBack.find(({ id }) => id === "after")!, resourceIds: ["ada"] },
    ];
    const pending = new Map<string, CalendarEventPlacement<string> | null>([
      [
        "after",
        {
          end: Temporal.Instant.from("2026-11-01T08:00Z"),
          kind: "timed",
          resourceIds: ["orchid"],
          start: Temporal.Instant.from("2026-11-01T07:00Z"),
        },
      ],
    ]);
    const options = { getResourceOverlapLayout: roomsStack };
    const optimistic = read(
      project(
        events,
        "2026-11-01",
        options,
        "America/New_York",
        applyEventOverlay(snapshotOf(events), pending),
      ),
    );

    const saved = events.map((event) =>
      event.id === "after" ? { ...event, resourceIds: ["orchid"] } : event,
    );

    expect(optimistic).toEqual(read(project(saved, "2026-11-01", options, "America/New_York")));
    // In Orchid's stack, the moved event sits a level down, over the night it overlaps.
    expect(optimistic).toEqual({
      ada: "4/4: night@0/0 across@1/1 daylight@2/2 standard@3/3",
      null: "0/0: ",
      orchid: "4/2: night@0/0 across@1/0.333 daylight@2/0.667 standard@3/1 after@1/0.333",
    });
  });

  test("back-to-back quarter hours never collide, wherever they fall in the day", () => {
    // 10:00 + a quarter hour lands a hair past 10:15 as a share of the day.
    const events = both([
      timed("first", "2026-10-08T10:00Z", "2026-10-08T10:15Z"),
      timed("second", "2026-10-08T10:15Z", "2026-10-08T10:30Z"),
      timed("blip", "2026-10-08T10:30Z", "2026-10-08T10:35Z"),
      timed("next", "2026-10-08T10:45Z", "2026-10-08T11:00Z"),
    ]);

    expect(read(project(events, "2026-10-08", { getResourceOverlapLayout: roomsStack }))).toEqual({
      ada: "1/1: first@0/0 second@0/0 blip@0/0 next@0/0",
      null: "0/0: ",
      orchid: "1/1: first@0/0 second@0/0 blip@0/0 next@0/0",
    });
  });

  test("lays out the skipped hour of a spring-forward day in each resource's layout", () => {
    // New York on March 8 2026: a night across the gap, a floating hour in it, and an early start.
    const springForward = both([
      timed("night", "2026-03-08T06:00Z", "2026-03-08T08:00Z"),
      floating("skipped", "2026-03-08T02:00", "2026-03-08T03:00"),
      timed("early", "2026-03-08T07:30Z", "2026-03-08T08:30Z"),
    ]);

    expect(
      read(
        project(
          springForward,
          "2026-03-08",
          { getResourceOverlapLayout: roomsStack },
          "America/New_York",
        ),
      ),
    ).toEqual({
      ada: "2/2: night@0/0 skipped@1/1 early@1/1",
      null: "0/0: ",
      orchid: "2/1.333: night@0/0 skipped@1/0.333 early@1/0.333",
    });
  });

  test("rejects an unknown layout from the view, a resource or an event", () => {
    const events = both([timed("a", "2026-10-08T09:00Z", "2026-10-08T10:00Z")]);
    const invalid = new RangeError("invalid-overlap-layout");

    expect(() =>
      project(events, "2026-10-08", { overlapLayout: "Stack" as OverlapLayout }),
    ).toThrow(invalid);
    expect(() =>
      project(events, "2026-10-08", { getResourceOverlapLayout: () => "bogus" as OverlapLayout }),
    ).toThrow(invalid);
    expect(() =>
      project(events, "2026-10-08", { getEventOverlapLayout: () => "bogus" as OverlapLayout }),
    ).toThrow(invalid);
    // `null`, as from data, counts as none.
    expect(
      read(project(events, "2026-10-08", { getEventOverlapLayout: () => null as never })).orchid,
    ).toBe("1/1: a@0/0");
  });

  test("day rows lay events out like a month row, whatever the layout", () => {
    const range = dates("2026-10-05", "2026-10-12");
    const strategy = resourceTimelineStrategy<Options, FixtureEvent>({ kind: "week" });
    const rows = (overlapLayout: OverlapLayout) =>
      strategy.project({
        ...viewInput(snapshotOf(both(denseDay)), range, environment("UTC")),
        options: { overlapLayout },
        resources: spaces,
      }).rows;

    expect(rows("stack")).toEqual(rows("columns"));
  });

  test("the keyboard walks a stacked row in the order its bars cover each other", () => {
    const env = environment("UTC");
    const range = dates("2026-10-08", "2026-10-09");
    const projection = project(both(denseDay.slice(0, 4)), "2026-10-08", {
      getResourceOverlapLayout: roomsStack,
    });
    const move = (resourceId: string, focus: string, command: CalendarNavigationCommand) => {
      const result = resourceTimelineSpatialNavigation({
        command,
        environment: env,
        focus: focus.includes(":")
          ? {
              date: range.start,
              kind: "slot",
              resourceId,
              time: Temporal.PlainTime.from(focus),
            }
          : { date: range.start, eventId: focus, kind: "event", resourceId },
        options: undefined,
        projection,
        range,
        snap: { increment: 30, smallestUnit: "minute" },
      });
      return result === null || !("focus" in result) || result.focus.kind !== "event"
        ? null
        : result.focus.eventId;
    };

    // Right walks the bars in time order, each drawn over the one before it.
    expect(["desk", "t01", "t02"].map((id) => move("orchid", id, "right"))).toEqual([
      "t01",
      "t02",
      "t03",
    ]);
    // Entering a slot covered by several starts at the bar the others cover, as in lanes.
    expect(move("orchid", "09:30", "enter")).toBe("desk");
    expect(move("ada", "09:30", "enter")).toBe("desk");
  });
});

/** Up to 30 events on one day, each 5 minutes to 3 hours long, from quarter-hour starts. */
const randomDay = fc
  .array(
    fc.record({
      minutes: fc.integer({ max: 180, min: 5 }),
      quarter: fc.integer({ max: 92, min: 0 }),
    }),
    {
      maxLength: 30,
    },
  )
  .map((specs) =>
    specs.map(({ minutes, quarter }, index) => {
      const start = at("00:00").add({ minutes: quarter * 15 });
      return timed(`e${index}`, start.toString(), start.add({ minutes }).toString());
    }),
  );

describe("hour rows' contract", () => {
  test("lanes pack greedily across the whole row, as before groups had layouts", () => {
    // A quarter hour of a one-day range, the least a bar reserves.
    const minimumWidth = 15 / (24 * 60);
    fc.assert(
      fc.property(randomDay, (events) => {
        const [row] = project(events, "2026-10-08", { unassigned: "bucket" }).rows.filter(
          ({ resource }) => resource.id === null,
        );
        const ends: number[] = [];
        const lanes = row!.bars.map(({ end, start }) => {
          // With the time grid's tolerance, so back-to-back events never collide.
          const free = ends.findIndex((open) => open <= start + 1e-9);
          const lane = free === -1 ? ends.length : free;
          ends[lane] = Math.max(end, start + minimumWidth);
          return lane;
        });

        expect(row!.bars.map(({ lane, top }) => [lane, top])).toEqual(
          lanes.map((lane) => [lane, lane]),
        );
        expect([row!.laneCount, row!.height]).toEqual([ends.length, ends.length]);
      }),
      { numRuns: 200 },
    );
  });

  test("bars on one level of a stack never overlap, so a lane keeps its meaning", () => {
    fc.assert(
      fc.property(randomDay, (events) => {
        const [row] = project(events, "2026-10-08", { overlapLayout: "stack" }).rows.filter(
          ({ resource }) => resource.id === null,
        );
        for (const [index, earlier] of row!.bars.entries()) {
          for (const later of row!.bars.slice(index + 1)) {
            if (later.lane === earlier.lane)
              expect(earlier.end).toBeLessThanOrEqual(later.start + 1e-9);
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  test("keeps every bar's place when an event it never overlaps comes or goes", () => {
    const stackShort = (event: FixtureEvent) =>
      Number(event.id.slice(1)) % 2 === 0 ? "stack" : undefined;
    const scenario = fc.tuple(
      randomDay,
      fc.record({
        minutes: fc.integer({ max: 180, min: 5 }),
        quarter: fc.integer({ max: 92, min: 0 }),
      }),
      fc.constantFrom<OverlapLayout>("columns", "stack"),
    );
    fc.assert(
      fc.property(scenario, ([events, { minutes, quarter }, overlapLayout]) => {
        const start = at("00:00").add({ minutes: quarter * 15 });
        const extra = timed("x", start.toString(), start.add({ minutes }).toString());
        const options = { getEventOverlapLayout: stackShort, overlapLayout };
        const rowOf = (shown: readonly FixtureEvent[]) =>
          project(shown, "2026-10-08", options).rows.find(({ resource }) => resource.id === null)!;
        const before = rowOf(events);
        const after = rowOf([...events, extra]);
        // The extra event's group, by the same sweep of reserved ends as the layout's.
        const reserved = (bar: (typeof after.bars)[number]) =>
          Math.max(bar.end, bar.start + 15 / (24 * 60));
        const groups: unknown[][] = [];
        let groupEnd = -Infinity;
        for (const bar of after.bars) {
          if (groupEnd <= bar.start + 1e-9) groups.push([]);
          groups.at(-1)!.push(bar.event.id);
          groupEnd = Math.max(groupEnd, reserved(bar));
        }
        const group = new Set<unknown>(groups.find((ids) => ids.includes("x")));
        const unrelated = (row: typeof after) =>
          row.bars
            .filter(({ event }) => !group.has(event.id))
            .map(({ event, lane, top }) => [event.id, lane, top]);

        expect(unrelated(after)).toEqual(unrelated(before));
      }),
      { numRuns: 200 },
    );
  });

  test("a stack keeps its row within two lanes, each bar below the ones it covers", () => {
    fc.assert(
      fc.property(randomDay, (events) => {
        const [row] = project(events, "2026-10-08", { overlapLayout: "stack" }).rows.filter(
          ({ resource }) => resource.id === null,
        );
        const { bars, height } = row!;

        expect(height).toBeLessThanOrEqual(events.length === 0 ? 0 : 2);
        for (const [index, earlier] of bars.entries()) {
          expect(earlier.top + 1).toBeLessThanOrEqual(height + 1e-12);
          for (const later of bars.slice(index + 1)) {
            if (earlier.end > later.start && later.end > earlier.start) {
              expect(later.top).toBeGreaterThan(earlier.top);
            }
          }
        }
      }),
      { numRuns: 200 },
    );
  });

  test("places every bar independent of input order", () => {
    const scenario = randomDay.chain((events) =>
      fc.tuple(
        fc.constant(events),
        fc.shuffledSubarray(events, { maxLength: events.length, minLength: events.length }),
      ),
    );
    // Every third event stacks on its own, so groups agree or fall back as the order allows.
    const stackSome = (event: FixtureEvent) =>
      Number(event.id.slice(1)) % 3 === 0 ? "stack" : undefined;
    fc.assert(
      fc.property(
        scenario,
        fc.constantFrom<OverlapLayout>("columns", "equal", "stack"),
        ([events, shuffled], overlapLayout) => {
          const options = { getEventOverlapLayout: stackSome, overlapLayout };
          expect(read(project(shuffled, "2026-10-08", options))).toEqual(
            read(project(events, "2026-10-08", options)),
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
