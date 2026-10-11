import { describe, expect, test } from "vite-plus/test";

import {
  applyEventOverlay,
  timeGridSpatialNavigation,
  timeGridStrategy,
  type CalendarEnvironmentBase,
  type CalendarEventPlacement,
  type CalendarNavigationCommand,
  type OverlapLayout,
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
  overlapLayout: OverlapLayout,
  env: CalendarEnvironmentBase = environment("UTC"),
): TimeGridProjection<FixtureEvent> {
  const range = dates(start, end);
  const strategy = timeGridStrategy<{ readonly overlapLayout: OverlapLayout }, FixtureEvent>({
    count: range.start.until(range.end).days,
    kind: "days",
  });
  return strategy.project({
    ...viewInput(snapshotOf(events), range, env),
    options: { overlapLayout },
  });
}

function read({ days }: TimeGridProjection<FixtureEvent>): readonly (readonly string[])[] {
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
