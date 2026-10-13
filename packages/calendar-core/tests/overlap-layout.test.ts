import { describe, expect, test } from "vite-plus/test";

import {
  applyEventOverlay,
  createResourceTree,
  resourceColumnsSpatialNavigation,
  resourceColumnsStrategy,
  scrollingTimeGridStrategy,
  timeGridSpatialNavigation,
  timeGridStrategy,
  type CalendarEnvironmentBase,
  type CalendarEventPlacement,
  type CalendarNavigationCommand,
  type CalendarResource,
  type EventSnapshot,
  type OverlapLayout,
  type OverlapLayoutOptions,
  type ResourceColumnsProjection,
  type ResourceOverlapLayoutOptions,
  type TimeGridProjection,
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
 * Golden layouts for each overlap policy, through `timeGridStrategy` as a view projects them:
 * each column reads as `id top-bottom left/width`, with wall times as `H:MM` and shares of the
 * column width to three places.
 */
const policies = ["columns", "equal", "stack"] as const satisfies readonly OverlapLayout[];

const clock = (fraction: number) => {
  const minutes = Math.round(fraction * 24 * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
};
const share = (fraction: number) => Number(fraction.toFixed(3));

function project(
  events: readonly FixtureEvent[],
  [start, end]: readonly [string, string],
  overlapLayout: OverlapLayout | OverlapLayoutOptions<FixtureEvent>,
  env: CalendarEnvironmentBase = environment("UTC"),
  snapshot: EventSnapshot<FixtureEvent, string, string> = snapshotOf(events),
): TimeGridProjection<FixtureEvent> {
  const range = dates(start, end);
  const strategy = timeGridStrategy<OverlapLayoutOptions<FixtureEvent>, FixtureEvent>({
    count: range.start.until(range.end).days,
    kind: "days",
  });
  return strategy.project({
    ...viewInput(snapshot, range, env),
    options: typeof overlapLayout === "string" ? { overlapLayout } : overlapLayout,
  });
}

function read({
  days,
}: Pick<TimeGridProjection<FixtureEvent>, "days">): readonly (readonly string[])[] {
  return days.map(({ events }) =>
    events.map(
      ({ fragment, height, left, top, width }) =>
        `${fragment.event.id} ${clock(top)}-${clock(top + height)} ${share(left)}/${share(width)}`,
    ),
  );
}

const at = (time: string) => Temporal.Instant.from(`2026-10-08T${time}Z`);

/**
 * 24 events in one collision group: a desk staffed all day, a 45-minute talk every quarter hour
 * from 9:00, six sessions at 14:00, and one running past the desk's close.
 */
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

const denseGolden: Record<OverlapLayout, readonly string[]> = {
  columns: [
    "desk 8:00-17:00 0/0.143",
    "t01 9:00-9:45 0.143/0.143",
    "t02 9:15-10:00 0.286/0.143",
    "t03 9:30-10:15 0.429/0.571",
    "t04 9:45-10:30 0.143/0.143",
    "t05 10:00-10:45 0.286/0.143",
    "t06 10:15-11:00 0.429/0.571",
    "t07 10:30-11:15 0.143/0.143",
    "t08 10:45-11:30 0.286/0.143",
    "t09 11:00-11:45 0.429/0.571",
    "t10 11:15-12:00 0.143/0.143",
    "t11 11:30-12:15 0.286/0.143",
    "t12 11:45-12:30 0.429/0.571",
    "t13 12:00-12:45 0.143/0.143",
    "t14 12:15-13:00 0.286/0.143",
    "t15 12:30-13:15 0.429/0.571",
    "t16 12:45-13:30 0.143/0.143",
    "b1 14:00-15:00 0.143/0.143",
    "b2 14:00-15:00 0.286/0.143",
    "b3 14:00-15:00 0.429/0.143",
    "b4 14:00-15:00 0.571/0.143",
    "b5 14:00-15:00 0.714/0.143",
    "b6 14:00-15:00 0.857/0.143",
    "late 16:30-17:30 0.143/0.857",
  ],
  equal: [
    "desk 8:00-17:00 0/0.143",
    "t01 9:00-9:45 0.143/0.143",
    "t02 9:15-10:00 0.286/0.143",
    "t03 9:30-10:15 0.429/0.143",
    "t04 9:45-10:30 0.143/0.143",
    "t05 10:00-10:45 0.286/0.143",
    "t06 10:15-11:00 0.429/0.143",
    "t07 10:30-11:15 0.143/0.143",
    "t08 10:45-11:30 0.286/0.143",
    "t09 11:00-11:45 0.429/0.143",
    "t10 11:15-12:00 0.143/0.143",
    "t11 11:30-12:15 0.286/0.143",
    "t12 11:45-12:30 0.429/0.143",
    "t13 12:00-12:45 0.143/0.143",
    "t14 12:15-13:00 0.286/0.143",
    "t15 12:30-13:15 0.429/0.143",
    "t16 12:45-13:30 0.143/0.143",
    "b1 14:00-15:00 0.143/0.143",
    "b2 14:00-15:00 0.286/0.143",
    "b3 14:00-15:00 0.429/0.143",
    "b4 14:00-15:00 0.571/0.143",
    "b5 14:00-15:00 0.714/0.143",
    "b6 14:00-15:00 0.857/0.143",
    "late 16:30-17:30 0.143/0.143",
  ],
  // Each talk overlaps the two before it, so the stack is 16 deep and indents a 32nd per level.
  stack: [
    "desk 8:00-17:00 0/1",
    "t01 9:00-9:45 0.031/0.969",
    "t02 9:15-10:00 0.063/0.938",
    "t03 9:30-10:15 0.094/0.906",
    "t04 9:45-10:30 0.125/0.875",
    "t05 10:00-10:45 0.156/0.844",
    "t06 10:15-11:00 0.188/0.813",
    "t07 10:30-11:15 0.219/0.781",
    "t08 10:45-11:30 0.25/0.75",
    "t09 11:00-11:45 0.281/0.719",
    "t10 11:15-12:00 0.313/0.688",
    "t11 11:30-12:15 0.344/0.656",
    "t12 11:45-12:30 0.375/0.625",
    "t13 12:00-12:45 0.406/0.594",
    "t14 12:15-13:00 0.438/0.563",
    "t15 12:30-13:15 0.469/0.531",
    "t16 12:45-13:30 0.5/0.5",
    "b1 14:00-15:00 0.031/0.969",
    "b2 14:00-15:00 0.063/0.938",
    "b3 14:00-15:00 0.094/0.906",
    "b4 14:00-15:00 0.125/0.875",
    "b5 14:00-15:00 0.156/0.844",
    "b6 14:00-15:00 0.188/0.813",
    "late 16:30-17:30 0.031/0.969",
  ],
};

/** An all-day offsite and a 26-hour flight in the all-day row, over timed and floating events. */
const mixedDays: readonly FixtureEvent[] = [
  allDay("offsite", "2026-10-08", "2026-10-10"),
  timed("flight", "2026-10-08T20:00Z", "2026-10-09T22:00Z"),
  timed("a", "2026-10-08T09:00Z", "2026-10-08T11:00Z"),
  timed("b", "2026-10-08T10:00Z", "2026-10-08T12:00Z"),
  floating("c", "2026-10-08T10:30", "2026-10-08T11:30"),
  timed("d", "2026-10-09T09:00Z", "2026-10-09T10:00Z"),
];

const mixedGolden: Record<OverlapLayout, readonly (readonly string[])[]> = {
  columns: [
    ["a 9:00-11:00 0/0.333", "b 10:00-12:00 0.333/0.333", "c 10:30-11:30 0.667/0.333"],
    ["d 9:00-10:00 0/1"],
  ],
  equal: [
    ["a 9:00-11:00 0/0.333", "b 10:00-12:00 0.333/0.333", "c 10:30-11:30 0.667/0.333"],
    ["d 9:00-10:00 0/1"],
  ],
  stack: [
    ["a 9:00-11:00 0/1", "b 10:00-12:00 0.15/0.85", "c 10:30-11:30 0.3/0.7"],
    ["d 9:00-10:00 0/1"],
  ],
};

/**
 * New York on November 1 2026, when 02:00 falls back to 01:00: both occurrences of 01:00–01:30
 * draw over the same hour, beside a night that spans the change.
 */
const fallBack: readonly FixtureEvent[] = [
  timed("standard", "2026-11-01T06:00Z", "2026-11-01T06:30Z"),
  timed("daylight", "2026-11-01T05:00Z", "2026-11-01T05:30Z"),
  timed("after", "2026-11-01T07:00Z", "2026-11-01T08:00Z"),
  timed("across", "2026-11-01T05:30Z", "2026-11-01T06:15Z"),
  timed("night", "2026-11-01T04:30Z", "2026-11-01T07:30Z"),
];

const fallBackGolden: Record<OverlapLayout, readonly string[]> = {
  columns: [
    "night 0:30-2:30 0/0.25",
    "across 1:00-2:00 0.25/0.25",
    "daylight 1:00-1:30 0.5/0.25",
    "standard 1:00-1:30 0.75/0.25",
    "after 2:00-3:00 0.25/0.75",
  ],
  equal: [
    "night 0:30-2:30 0/0.25",
    "across 1:00-2:00 0.25/0.25",
    "daylight 1:00-1:30 0.5/0.25",
    "standard 1:00-1:30 0.75/0.25",
    "after 2:00-3:00 0.25/0.25",
  ],
  stack: [
    "night 0:30-2:30 0/1",
    "across 1:00-2:00 0.15/0.85",
    "daylight 1:00-1:30 0.3/0.7",
    "standard 1:00-1:30 0.45/0.55",
    "after 2:00-3:00 0.15/0.85",
  ],
};

/** New York on March 8 2026, when 02:00 springs forward to 03:00, with a floating event at 02:00. */
const springForward: readonly FixtureEvent[] = [
  timed("night", "2026-03-08T06:00Z", "2026-03-08T08:00Z"),
  floating("skipped", "2026-03-08T02:00", "2026-03-08T03:00"),
  timed("early", "2026-03-08T07:30Z", "2026-03-08T08:30Z"),
];

const springForwardGolden: Record<OverlapLayout, readonly string[]> = {
  columns: ["night 1:00-4:00 0/0.5", "skipped 2:00-3:00 0.5/0.5", "early 3:30-4:30 0.5/0.5"],
  equal: ["night 1:00-4:00 0/0.5", "skipped 2:00-3:00 0.5/0.5", "early 3:30-4:30 0.5/0.5"],
  stack: ["night 1:00-4:00 0/1", "skipped 2:00-3:00 0.15/0.85", "early 3:30-4:30 0.15/0.85"],
};

const newYork = environment("America/New_York");

describe.each(policies)("the %s overlap layout", (policy) => {
  test("lays out a dense day of 24 overlapping events", () => {
    expect(read(project(denseDay, ["2026-10-08", "2026-10-09"], policy))).toEqual([
      denseGolden[policy],
    ]);
  });

  test("leaves the all-day row to all-day and day-long events", () => {
    const projection = project(mixedDays, ["2026-10-08", "2026-10-10"], policy);

    expect(read(projection)).toEqual(mixedGolden[policy]);
    expect(
      projection.allDay.segments.map(({ column, event, lane, span }) => [
        event.id,
        column,
        span,
        lane,
      ]),
    ).toEqual([
      ["offsite", 0, 2, 0],
      ["flight", 0, 2, 1],
    ]);
  });

  test("lays out the repeated hour of a fall-back day", () => {
    expect(read(project(fallBack, ["2026-11-01", "2026-11-02"], policy, newYork))).toEqual([
      fallBackGolden[policy],
    ]);
  });

  test("lays out the skipped hour of a spring-forward day", () => {
    expect(read(project(springForward, ["2026-03-08", "2026-03-09"], policy, newYork))).toEqual([
      springForwardGolden[policy],
    ]);
  });

  test("lays out right-to-left the same, from the inline start", () => {
    const rtl = { ...environment("UTC"), direction: "rtl" } as const;

    expect(read(project(denseDay, ["2026-10-08", "2026-10-09"], policy, rtl))).toEqual([
      denseGolden[policy],
    ]);
  });

  test("lays out pending changes where the saved events will go", () => {
    const range = ["2026-10-08", "2026-10-10"] as const;
    const start = Temporal.Instant.from("2026-10-08T10:45Z");
    const end = Temporal.Instant.from("2026-10-08T12:45Z");
    const pending = new Map<string, CalendarEventPlacement<string> | null>([
      ["b", { end, kind: "timed", resourceIds: [], start }],
      ["d", null],
    ]);
    const optimistic = timeGridStrategy<{ readonly overlapLayout: OverlapLayout }, FixtureEvent>({
      count: 2,
      kind: "days",
    }).project({
      ...viewInput(
        applyEventOverlay(snapshotOf(mixedDays), pending),
        dates(...range),
        environment("UTC"),
      ),
      options: { overlapLayout: policy },
    });
    const saved = [
      ...mixedDays.filter(({ id }) => id !== "b" && id !== "d"),
      timed("b", start.toString(), end.toString()),
    ];

    expect(read(optimistic)).toEqual(read(project(saved, range, policy)));
  });

  /**
   * a 9:00–12:00, b 9:30–11:00, c 10:00–10:30, and d 11:00–12:00: up and down walk them in the
   * order they are drawn, and left and right step to the overlapping event drawn beside, mirrored
   * right to left.
   */
  test.each(["ltr", "rtl"] as const)(
    "moves the keyboard through overlapping events as drawn, %s",
    (direction) => {
      const env = { ...environment("UTC"), direction } as const;
      const range = dates("2026-10-08", "2026-10-09");
      const projection = project(
        [
          timed("a", "2026-10-08T09:00Z", "2026-10-08T12:00Z"),
          timed("b", "2026-10-08T09:30Z", "2026-10-08T11:00Z"),
          timed("c", "2026-10-08T10:00Z", "2026-10-08T10:30Z"),
          timed("d", "2026-10-08T11:00Z", "2026-10-08T12:00Z"),
        ],
        ["2026-10-08", "2026-10-09"],
        policy,
        env,
      );
      const move = (eventId: string, command: CalendarNavigationCommand) => {
        const result = timeGridSpatialNavigation({
          command,
          environment: env,
          focus: { date: range.start, eventId, kind: "event" },
          options: undefined,
          projection,
          range,
          snap: { increment: 15, smallestUnit: "minute" },
        });
        return result !== null && "focus" in result && result.focus.kind === "event"
          ? result.focus.eventId
          : null;
      };
      const [forward, back] = direction === "ltr" ? ["right", "left"] : ["left", "right"];

      expect(projection.days[0]!.events.map(({ fragment }) => fragment.event.id)).toEqual([
        "a",
        "b",
        "c",
        "d",
      ]);
      expect(["a", "b", "c"].map((id) => move(id, "down"))).toEqual(["b", "c", "d"]);
      expect(["a", "b", "c", "d"].map((id) => move(id, forward as "left"))).toEqual([
        "b",
        "c",
        null,
        null,
      ]);
      expect(["a", "b", "c", "d"].map((id) => move(id, back as "left"))).toEqual([
        null,
        "a",
        "b",
        "a",
      ]);
    },
  );

  test("left and right never step to a back-to-back event", () => {
    const env = environment("UTC");
    const range = dates("2026-10-08", "2026-10-09");
    // d starts as b ends, so the two never share a moment, though 10/24 + 1/24 > 11/24.
    const projection = project(
      [
        timed("a", "2026-10-08T09:00Z", "2026-10-08T11:00Z"),
        timed("b", "2026-10-08T10:00Z", "2026-10-08T11:00Z"),
        timed("c", "2026-10-08T10:30Z", "2026-10-08T12:00Z"),
        timed("d", "2026-10-08T11:00Z", "2026-10-08T12:00Z"),
      ],
      ["2026-10-08", "2026-10-09"],
      policy,
      env,
    );
    const move = (command: "left" | "right") => {
      const result = timeGridSpatialNavigation({
        command,
        environment: env,
        focus: { date: range.start, eventId: "d", kind: "event" },
        options: undefined,
        projection,
        range,
        snap: { increment: 15, smallestUnit: "minute" },
      });
      return result !== null && "focus" in result && result.focus.kind === "event"
        ? result.focus.eventId
        : null;
    };

    // In lanes, d takes a's lane beside c; in a stack, it sits on c.
    expect([move("left"), move("right")]).toEqual(policy === "stack" ? ["c", null] : [null, "c"]);
  });
});

/**
 * Mixed layouts. Events take their calendar's layout through `getEventOverlapLayout`: focus time
 * stacks, work sits in equal lanes, and personal events have none of their own. A collision group
 * whose events all agree takes their layout, and any other group the column's.
 */
const calendars: Readonly<Record<string, OverlapLayout | undefined>> = {
  f: "stack",
  m1: "stack",
  m2: "equal",
  p1: undefined,
  p2: "stack",
  w: "equal",
  x: undefined,
};
const calendarLayout = (event: FixtureEvent) =>
  calendars[event.id] ?? calendars[event.id.replace(/\d+$/, "")];

/**
 * One day of four collision groups: focus time alone (stacked), focus time against work (the
 * column's), work alone (equal lanes), and a personal event under focus time, which agree only
 * where the column stacks.
 */
const calendarDay: readonly FixtureEvent[] = [
  timed("f1", "2026-10-08T09:00Z", "2026-10-08T11:00Z"),
  timed("f2", "2026-10-08T09:30Z", "2026-10-08T10:30Z"),
  timed("f3", "2026-10-08T10:00Z", "2026-10-08T10:30Z"),
  timed("m1", "2026-10-08T12:00Z", "2026-10-08T13:00Z"),
  timed("m2", "2026-10-08T12:30Z", "2026-10-08T13:30Z"),
  timed("w1", "2026-10-08T14:00Z", "2026-10-08T16:00Z"),
  timed("w2", "2026-10-08T14:00Z", "2026-10-08T15:00Z"),
  timed("w3", "2026-10-08T14:00Z", "2026-10-08T14:30Z"),
  timed("w4", "2026-10-08T15:00Z", "2026-10-08T16:00Z"),
  timed("p1", "2026-10-08T18:00Z", "2026-10-08T19:00Z"),
  timed("p2", "2026-10-08T18:30Z", "2026-10-08T19:30Z"),
];

const focusStacked = [
  "f1 9:00-11:00 0/1",
  "f2 9:30-10:30 0.15/0.85",
  "f3 10:00-10:30 0.3/0.7",
] as const;
// Equal lanes: w4 doesn't widen into w3's free lane, as it would side by side.
const workEqual = [
  "w1 14:00-16:00 0/0.333",
  "w2 14:00-15:00 0.333/0.333",
  "w3 14:00-14:30 0.667/0.333",
  "w4 15:00-16:00 0.333/0.333",
] as const;
const calendarGolden: Record<OverlapLayout, readonly string[]> = {
  columns: [
    ...focusStacked,
    "m1 12:00-13:00 0/0.5",
    "m2 12:30-13:30 0.5/0.5",
    ...workEqual,
    "p1 18:00-19:00 0/0.5",
    "p2 18:30-19:30 0.5/0.5",
  ],
  equal: [
    ...focusStacked,
    "m1 12:00-13:00 0/0.5",
    "m2 12:30-13:30 0.5/0.5",
    ...workEqual,
    "p1 18:00-19:00 0/0.5",
    "p2 18:30-19:30 0.5/0.5",
  ],
  stack: [
    ...focusStacked,
    "m1 12:00-13:00 0/1",
    "m2 12:30-13:30 0.15/0.85",
    ...workEqual,
    "p1 18:00-19:00 0/1",
    "p2 18:30-19:30 0.15/0.85",
  ],
};

/** Ada's events in her column, and the same in Orchid's, a room that stacks. */
const rooms = createResourceTree<CalendarResource<{ readonly kind: "person" | "room" }>>([
  { data: { kind: "room" }, id: "orchid", title: "Orchid" },
  { data: { kind: "person" }, id: "ada", title: "Ada" },
]);
const resourceLayout = (resource: CalendarResource<{ readonly kind: "person" | "room" }>) =>
  resource.data.kind === "room" ? "stack" : "columns";

type ResourceOptions = ResourceOverlapLayoutOptions<
  FixtureEvent,
  CalendarResource<{ readonly kind: "person" | "room" }>
> & { readonly unassigned?: "bucket" };

function projectResources(
  events: readonly FixtureEvent[],
  [start, end]: readonly [string, string],
  options: ResourceOptions,
  env: CalendarEnvironmentBase = environment("UTC"),
  snapshot: EventSnapshot<FixtureEvent, string, string> = snapshotOf(events),
): ResourceColumnsProjection<FixtureEvent> {
  const range = dates(start, end);
  return resourceColumnsStrategy<ResourceOptions, FixtureEvent>({
    count: range.start.until(range.end).days,
    kind: "days",
  }).project({
    ...viewInput(snapshot, range, env),
    options,
    resources: rooms,
  });
}

/** Each resource's columns as `read` gives them, by resource ID; `null` for the bucket. */
function readResources(projection: ResourceColumnsProjection<FixtureEvent>) {
  return Object.fromEntries(
    projection.resources.map((column) => [String(column.resource.id), read(column)]),
  );
}

/** Books events on both Ada and Orchid. */
const both = (events: readonly FixtureEvent[]) =>
  events.map((event) => ({ ...event, resourceIds: ["orchid", "ada"] }));

describe("mixed overlap layouts", () => {
  test.each(policies)(
    "events take their calendar's layout where a whole group agrees, under %s",
    (overlapLayout) => {
      expect(
        read(
          project(calendarDay, ["2026-10-08", "2026-10-09"], {
            getEventOverlapLayout: calendarLayout,
            overlapLayout,
          }),
        ),
      ).toEqual([calendarGolden[overlapLayout]]);
    },
  );

  test("a dense day takes a calendar's layout only when every event in it agrees", () => {
    const range = ["2026-10-08", "2026-10-09"] as const;
    const talks = (event: FixtureEvent) => (event.id === "desk" ? undefined : "stack");

    expect(read(project(denseDay, range, { getEventOverlapLayout: () => "stack" }))).toEqual([
      denseGolden.stack,
    ]);
    // The desk has no layout of its own, so it holds the group to the column's.
    expect(read(project(denseDay, range, { getEventOverlapLayout: talks }))).toEqual([
      denseGolden.columns,
    ]);
    expect(
      read(project(denseDay, range, { getEventOverlapLayout: talks, overlapLayout: "stack" })),
    ).toEqual([denseGolden.stack]);
  });

  test("an event that joins a group from another calendar redraws that group alone", () => {
    const range = ["2026-10-08", "2026-10-09"] as const;
    const options = { getEventOverlapLayout: calendarLayout };
    const before = read(project(calendarDay, range, options))[0]!;
    const after = read(
      project(
        [...calendarDay, timed("x", "2026-10-08T10:15Z", "2026-10-08T10:45Z")],
        range,
        options,
      ),
    )[0]!;

    // A personal event under the focus stack: the morning falls back to side by side.
    expect(after.slice(0, 4)).toEqual([
      "f1 9:00-11:00 0/0.25",
      "f2 9:30-10:30 0.25/0.25",
      "f3 10:00-10:30 0.5/0.25",
      "x 10:15-10:45 0.75/0.25",
    ]);
    expect(after.slice(4)).toEqual(before.slice(3));
  });

  test("an event that overlaps no group changes none, whatever its calendar", () => {
    const range = ["2026-10-08", "2026-10-09"] as const;
    const options = { getEventOverlapLayout: calendarLayout };
    const before = read(project(calendarDay, range, options))[0]!;
    const after = read(
      project([...calendarDay, timed("x", "2026-10-08T07:00Z", "2026-10-08T08:00Z")], range, {
        ...options,
      }),
    )[0]!;

    expect(after).toEqual(["x 7:00-8:00 0/1", ...before]);
  });

  test("each resource's column takes its own layout, and the bucket the view's", () => {
    const unassigned = [
      timed("u1", "2026-10-08T09:00Z", "2026-10-08T12:00Z"),
      timed("u2", "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
      timed("u3", "2026-10-08T09:00Z", "2026-10-08T10:00Z"),
      timed("u4", "2026-10-08T10:00Z", "2026-10-08T11:00Z"),
    ];
    const columns = readResources(
      projectResources([...both(denseDay), ...unassigned], ["2026-10-08", "2026-10-09"], {
        getResourceOverlapLayout: resourceLayout,
        overlapLayout: "equal",
        unassigned: "bucket",
      }),
    );

    expect(columns).toEqual({
      ada: [denseGolden.columns],
      null: [
        [
          "u1 9:00-12:00 0/0.333",
          "u2 9:00-10:00 0.333/0.333",
          "u3 9:00-10:00 0.667/0.333",
          "u4 10:00-11:00 0.333/0.333",
        ],
      ],
      orchid: [denseGolden.stack],
    });
  });

  test("a resource's layout leaves `overlapLayout` to resources it returns nothing for", () => {
    const columns = readResources(
      projectResources(both(denseDay), ["2026-10-08", "2026-10-09"], {
        getResourceOverlapLayout: (resource) =>
          resource.data.kind === "room" ? "stack" : undefined,
        overlapLayout: "equal",
      }),
    );

    expect(columns).toEqual({ ada: [denseGolden.equal], orchid: [denseGolden.stack] });
  });

  test("events' own layouts refine each resource's", () => {
    const columns = readResources(
      projectResources(both(calendarDay), ["2026-10-08", "2026-10-09"], {
        getEventOverlapLayout: calendarLayout,
        getResourceOverlapLayout: resourceLayout,
      }),
    );

    expect(columns).toEqual({
      ada: [calendarGolden.columns],
      orchid: [calendarGolden.stack],
    });
  });

  test("a calendar's layout applies on DST days and beside the all-day row too", () => {
    const stackAll = { getEventOverlapLayout: () => "stack" as const };
    // In Ada's lanes too, events that all stack still stack.
    expect(
      readResources(
        projectResources(
          both(fallBack),
          ["2026-11-01", "2026-11-02"],
          { ...stackAll, getResourceOverlapLayout: resourceLayout },
          newYork,
        ),
      ),
    ).toEqual({ ada: [fallBackGolden.stack], orchid: [fallBackGolden.stack] });
    // The night has no layout of its own, so it holds the whole group to the view's lanes.
    expect(
      read(
        project(
          springForward,
          ["2026-03-08", "2026-03-09"],
          { getEventOverlapLayout: (event) => (event.id === "night" ? undefined : "stack") },
          newYork,
        ),
      ),
    ).toEqual([springForwardGolden.columns]);
    expect(read(project(mixedDays, ["2026-10-08", "2026-10-10"], stackAll))).toEqual(
      mixedGolden.stack,
    );
  });

  test("an event's own layout of null counts as none", () => {
    expect(
      read(
        project(denseDay, ["2026-10-08", "2026-10-09"], {
          getEventOverlapLayout: () => null as unknown as undefined,
          overlapLayout: "equal",
        }),
      ),
    ).toEqual([denseGolden.equal]);
  });

  test("the scrolling time grid takes events' own layouts too", () => {
    const range = dates("2026-10-08", "2026-10-09");
    const projection = scrollingTimeGridStrategy<OverlapLayoutOptions<FixtureEvent>, FixtureEvent>({
      count: 1,
      kind: "days",
    }).project({
      ...viewInput(snapshotOf(calendarDay), range, environment("UTC")),
      options: { getEventOverlapLayout: calendarLayout },
    });
    const day = projection.days.find(({ column }) => column.date.equals(range.start))!;

    expect(read({ days: [day] })).toEqual([calendarGolden.columns]);
  });

  test("lays out a pending move that switches two groups as the saved events", () => {
    const range = ["2026-10-08", "2026-10-09"] as const;
    const options = { getEventOverlapLayout: calendarLayout };
    // The personal p1 moves into the morning's focus time: the morning falls back to lanes, and
    // the evening's p2 is left alone.
    const start = Temporal.Instant.from("2026-10-08T09:30Z");
    const end = Temporal.Instant.from("2026-10-08T10:30Z");
    const pending = new Map<string, CalendarEventPlacement<string> | null>([
      ["p1", { end, kind: "timed", resourceIds: [], start }],
    ]);
    const saved = calendarDay.map((event) =>
      event.id === "p1" ? timed("p1", start.toString(), end.toString()) : event,
    );
    const optimistic = read(
      project(
        calendarDay,
        range,
        options,
        environment("UTC"),
        applyEventOverlay(snapshotOf(calendarDay), pending),
      ),
    )[0]!;

    expect(optimistic).toEqual(read(project(saved, range, options))[0]);
    expect(optimistic.filter((line) => /^(f|p)/.test(line))).toEqual([
      "f1 9:00-11:00 0/0.25",
      "f2 9:30-10:30 0.25/0.25",
      "p1 9:30-10:30 0.5/0.25",
      "f3 10:00-10:30 0.75/0.25",
      "p2 18:30-19:30 0/1",
    ]);
  });

  test("leaves the all-day row to all-day and day-long events in every resource", () => {
    const projection = projectResources(both(mixedDays), ["2026-10-08", "2026-10-10"], {
      getResourceOverlapLayout: resourceLayout,
    });

    expect(readResources(projection)).toEqual({
      ada: mixedGolden.columns,
      orchid: mixedGolden.stack,
    });
    for (const { allDay: row } of projection.resources) {
      expect(row.segments.map(({ event, lane, span }) => [event.id, span, lane])).toEqual([
        ["offsite", 2, 0],
        ["flight", 2, 1],
      ]);
    }
  });

  test.each([
    ["fall-back", fallBack, "2026-11-01", fallBackGolden],
    ["spring-forward", springForward, "2026-03-08", springForwardGolden],
  ] as const)("lays out each resource's %s day by its own layout", (_, events, date, golden) => {
    const next = Temporal.PlainDate.from(date).add({ days: 1 }).toString();
    const columns = readResources(
      projectResources(
        both(events),
        [date, next],
        { getResourceOverlapLayout: resourceLayout },
        newYork,
      ),
    );

    expect(columns).toEqual({ ada: [golden.columns], orchid: [golden.stack] });
  });

  test("lays out a pending move to another resource as the saved event, in its new column", () => {
    const range = ["2026-10-08", "2026-10-09"] as const;
    const options = {
      getEventOverlapLayout: calendarLayout,
      getResourceOverlapLayout: resourceLayout,
    };
    const events = calendarDay.map((event) => ({
      ...event,
      resourceIds: event.id === "m2" ? ["ada"] : ["orchid"],
    }));
    const pending = new Map<string, CalendarEventPlacement<string> | null>([
      [
        "m2",
        {
          end: Temporal.Instant.from("2026-10-08T13:30Z"),
          kind: "timed",
          resourceIds: ["orchid"],
          start: Temporal.Instant.from("2026-10-08T12:30Z"),
        },
      ],
    ]);
    const saved = events.map((event) =>
      event.id === "m2" ? { ...event, resourceIds: ["orchid"] } : event,
    );

    const optimistic = readResources(
      projectResources(
        events,
        range,
        options,
        environment("UTC"),
        applyEventOverlay(snapshotOf(events), pending),
      ),
    );
    expect(optimistic).toEqual(readResources(projectResources(saved, range, options)));
    // In Orchid, m2 meets m1 from another calendar, so their group takes the room's stack.
    expect(optimistic.orchid![0]).toContain("m2 12:30-13:30 0.15/0.85");
  });

  /**
   * Down walks the column in drawn order, and left and right step to the overlapping event drawn
   * beside, inside each group under its own layout: the focus stack's indents, the work lanes.
   */
  test.each(["ltr", "rtl"] as const)(
    "moves the keyboard through a column of mixed groups as drawn, %s",
    (direction) => {
      const env = { ...environment("UTC"), direction } as const;
      const range = dates("2026-10-08", "2026-10-09");
      const projection = project(
        calendarDay,
        ["2026-10-08", "2026-10-09"],
        { getEventOverlapLayout: calendarLayout },
        env,
      );
      const move = (eventId: string, command: CalendarNavigationCommand) => {
        const result = timeGridSpatialNavigation({
          command,
          environment: env,
          focus: { date: range.start, eventId, kind: "event" },
          options: undefined,
          projection,
          range,
          snap: { increment: 15, smallestUnit: "minute" },
        });
        return result !== null && "focus" in result && result.focus.kind === "event"
          ? result.focus.eventId
          : null;
      };
      const [forward, back] = direction === "ltr" ? ["right", "left"] : ["left", "right"];
      const ids = calendarDay.map(({ id }) => id);

      expect(projection.days[0]!.events.map(({ fragment }) => fragment.event.id)).toEqual(ids);
      expect(ids.map((id) => move(id, "down"))).toEqual([...ids.slice(1), null]);
      expect(ids.map((id) => move(id, forward as "left"))).toEqual([
        "f2",
        "f3",
        null,
        "m2",
        null,
        "w2",
        "w3",
        null,
        null,
        "p2",
        null,
      ]);
      expect(ids.map((id) => move(id, back as "left"))).toEqual([
        null,
        "f1",
        "f2",
        null,
        "m1",
        null,
        "w1",
        "w2",
        "w1",
        null,
        "p1",
      ]);
    },
  );

  test("moves the keyboard across resources of different layouts by column", () => {
    const env = environment("UTC");
    const range = dates("2026-10-08", "2026-10-09");
    const projection = projectResources(both(calendarDay), ["2026-10-08", "2026-10-09"], {
      getResourceOverlapLayout: resourceLayout,
    });
    const move = (resourceId: string, eventId: string, command: CalendarNavigationCommand) => {
      const result = resourceColumnsSpatialNavigation({
        command,
        environment: env,
        focus: { date: range.start, eventId, kind: "event", resourceId },
        options: undefined,
        projection,
        range,
        snap: { increment: 15, smallestUnit: "minute" },
      });
      return result === null || !("focus" in result)
        ? null
        : `${result.focus.resourceId}:${result.focus.kind === "event" ? result.focus.eventId : result.focus.kind}`;
    };

    // Orchid stacks the morning, so f2 sits on f1; Ada's lanes put f2 beside it.
    expect(move("orchid", "f1", "right")).toBe("orchid:f2");
    expect(move("ada", "f1", "right")).toBe("ada:f2");
    expect(move("orchid", "w1", "right")).toBe("orchid:w2");
    // Left from the leftmost event stays in the column, under either layout.
    expect(move("ada", "f1", "left")).toBeNull();
    expect(move("orchid", "f1", "left")).toBeNull();
    // Exit leaves to the event's slot in its own resource.
    expect(move("orchid", "w4", "exit")).toBe("orchid:slot");
    // From a slot, right crosses from Orchid's stack into Ada's lanes, and back.
    const fromSlot = (resourceId: string, command: CalendarNavigationCommand) => {
      const result = resourceColumnsSpatialNavigation({
        command,
        environment: env,
        focus: {
          date: range.start,
          kind: "slot",
          resourceId,
          time: Temporal.PlainTime.from("09:30"),
        },
        options: undefined,
        projection,
        range,
        snap: { increment: 15, smallestUnit: "minute" },
      });
      return result === null || !("focus" in result) ? null : result.focus.resourceId;
    };
    expect(fromSlot("orchid", "right")).toBe("ada");
    expect(fromSlot("ada", "left")).toBe("orchid");
  });
});
