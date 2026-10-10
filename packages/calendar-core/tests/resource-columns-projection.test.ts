import { describe, expect, test } from "vite-plus/test";

import {
  createResourceTree,
  projectResourceColumns,
  projectTimeGrid,
  resourceColumnsStrategy,
  timeGridTitle,
  type CalendarResource,
  type ResourceColumnsProjection,
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

const room = (id: string, parentId?: string): CalendarResource<null> => ({
  data: null,
  id,
  title: id,
  ...(parentId === undefined ? {} : { parentId }),
});
const resources = createResourceTree([
  room("floor-1"),
  room("orchid", "floor-1"),
  room("lotus", "floor-1"),
  room("garage"),
]);

function on(event: FixtureEvent, ...resourceIds: string[]): FixtureEvent {
  return { ...event, resourceIds };
}

type Projection = ResourceColumnsProjection<FixtureEvent>;
type Layout = Projection["resources"][number]["days"][number]["events"][number];

/** A DST band as `startHour-endHour`. */
const hours = ({ height, top }: { readonly height: number; readonly top: number }) =>
  `${Math.round(top * 24)}-${Math.round((top + height) * 24)}`;

/** Each column as `resource: ids per day`, all-day row first. */
function read(projection: Projection): string[] {
  return projection.resources.map(({ allDay: row, days, resource }) => {
    const allDayIds = row.segments.map(({ event }) => event.id).join(",");
    const timedIds = days.map(({ events }) => events.map(({ fragment }) => fragment.event.id));
    return `${resource.id ?? "(unassigned)"}: [${allDayIds}] ${timedIds.map((ids) => ids.join(",")).join(" | ")}`;
  });
}

/** `id top-bottom left/width`, with wall times as `H:MM`. */
function box({ fragment, height, left, top, width }: Layout) {
  const clock = (fraction: number) => {
    const minutes = Math.round(fraction * 24 * 60);
    return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
  };
  return `${fragment.event.id} ${clock(top)}-${clock(top + height)} ${left.toFixed(2)}/${width.toFixed(2)}`;
}

const events = [
  on(timed("standup", "2026-10-08T13:00Z", "2026-10-08T13:30Z"), "orchid"),
  on(timed("pairing", "2026-10-08T13:15Z", "2026-10-08T14:00Z"), "orchid", "lotus"),
  on(timed("tyres", "2026-10-08T15:00Z", "2026-10-08T16:00Z"), "garage"),
  on(allDay("offsite", "2026-10-08", "2026-10-10"), "floor-1"),
  timed("lunch", "2026-10-08T16:00Z", "2026-10-08T17:00Z"),
];
const env = environment("America/New_York");
const snapshot = snapshotOf(events);
const input = {
  environment: env,
  expandedResourceIds: ["floor-1"],
  range: dates("2026-10-08", "2026-10-10"),
  resources,
  snapshot,
  today: Temporal.PlainDate.from("2026-10-08"),
};

describe("resource-columns projection", () => {
  test("lays out a time grid per visible resource over N days", () => {
    const projection = projectResourceColumns(input);

    expect(read(projection)).toEqual([
      "floor-1: [offsite]  | ",
      "orchid: [] standup,pairing | ",
      "lotus: [] pairing | ",
      "garage: [] tyres | ",
    ]);
    const [, orchid, lotus] = projection.resources;
    // Overlap lanes are per resource: pairing shares Orchid with standup but has Lotus to itself.
    expect(orchid!.days[0]!.events.map(box)).toEqual([
      "standup 9:00-9:30 0.00/0.50",
      "pairing 9:15-10:00 0.50/0.50",
    ]);
    expect(lotus!.days[0]!.events.map(box)).toEqual(["pairing 9:15-10:00 0.00/1.00"]);
    expect(orchid!.days.map(({ isToday }) => isToday)).toEqual([true, false]);
  });

  test("keeps one canonical event behind every resource's fragment", () => {
    const [, orchid, lotus] = projectResourceColumns(input).resources;
    const fromOrchid = orchid!.days[0]!.events[1]!.fragment;
    const fromLotus = lotus!.days[0]!.events[0]!.fragment;

    expect(fromOrchid.event.id).toBe("pairing");
    expect(fromLotus).toBe(fromOrchid);
    expect(fromLotus.event).toBe(snapshot.get("pairing"));
  });

  test("shares one set of day columns between resources", () => {
    const projection = projectResourceColumns(input);

    expect(projection.columns.map(({ date }) => date.toString())).toEqual([
      "2026-10-08",
      "2026-10-09",
    ]);
    for (const { days } of projection.resources) {
      expect(days.map(({ column }) => column)).toEqual(projection.columns);
      expect(days[0]!.column).toBe(projection.columns[0]);
    }
  });

  test("hides events without resources unless they get a bucket", () => {
    expect(read(projectResourceColumns({ ...input, expandedResourceIds: [] }))).toEqual([
      "floor-1: [offsite]  | ",
      "garage: [] tyres | ",
    ]);
    expect(
      read(projectResourceColumns({ ...input, expandedResourceIds: [], unassigned: "bucket" })),
    ).toEqual(["floor-1: [offsite]  | ", "garage: [] tyres | ", "(unassigned): [] lunch | "]);
  });

  test("lays out each resource exactly as a time grid of its own events", () => {
    const range = dates("2026-10-08", "2026-10-09");
    const garage = projectResourceColumns({ ...input, range }).resources.at(-1)!;
    const alone = projectTimeGrid({ ...input, range, snapshot: snapshotOf([events[2]!]) });

    expect(garage.days[0]!.events.map(box)).toEqual(alone.days[0]!.events.map(box));
    expect(garage.days[0]!.column).toEqual(alone.days[0]!.column);
  });

  test("toggling a resource reuses the snapshot's indexes and cached queries", () => {
    projectResourceColumns(input);
    const before = snapshot.getQueryCacheStatistics();
    projectResourceColumns({ ...input, expandedResourceIds: [] });
    const after = snapshot.getQueryCacheStatistics();

    expect(after.misses).toBe(before.misses);
    expect(after.hits).toBeGreaterThan(before.hits);
  });

  test("puts both occurrences of a repeated hour side by side within one resource", () => {
    // America/New_York repeats 01:00–02:00 on 2026-11-01.
    const fold = snapshotOf([
      on(timed("daylight", "2026-11-01T05:00Z", "2026-11-01T05:30Z"), "orchid", "lotus"),
      on(timed("standard", "2026-11-01T06:00Z", "2026-11-01T06:30Z"), "orchid"),
    ]);
    const projection = projectResourceColumns({
      ...input,
      range: dates("2026-11-01", "2026-11-02"),
      snapshot: fold,
    });
    const [, orchid, lotus] = projection.resources;

    expect(projection.columns[0]!.folds.map(hours)).toEqual(["1-2"]);
    expect(orchid!.days[0]!.events.map(box)).toEqual([
      "daylight 1:00-1:30 0.00/0.50",
      "standard 1:00-1:30 0.50/0.50",
    ]);
    expect(lotus!.days[0]!.events.map(box)).toEqual(["daylight 1:00-1:30 0.00/1.00"]);
  });

  test("keeps the nominal hour rows on a spring-forward day", () => {
    const gap = snapshotOf([
      on(timed("night", "2026-03-08T06:00Z", "2026-03-08T08:00Z"), "garage"),
    ]);
    const projection = projectResourceColumns({
      ...input,
      range: dates("2026-03-08", "2026-03-09"),
      snapshot: gap,
    });

    expect(projection.columns[0]!.gaps.map(hours)).toEqual(["2-3"]);
    expect(projection.resources.at(-1)!.days[0]!.events.map(box)).toEqual([
      "night 1:00-4:00 0.00/1.00",
    ]);
  });
});

describe("resource-columns strategy", () => {
  const strategy = resourceColumnsStrategy<
    { readonly unassigned?: "bucket" | "hide" },
    FixtureEvent
  >({
    count: 3,
    kind: "days",
  });
  const anchor = Temporal.PlainDate.from("2026-10-08");

  test("pages and titles like a time grid of the same span", () => {
    const range = strategy.getRange(anchor, env, {});

    expect(`${range.start.toString()}/${range.end.toString()}`).toBe("2026-10-08/2026-10-11");
    expect(strategy.navigate(anchor, -1, {}).toString()).toBe("2026-10-05");
    expect(strategy.getTitle(range, env, {})).toBe(timeGridTitle(range, env.locale));
  });

  test("projects with the root's resources, expansion, and the unassigned option", () => {
    const range = strategy.getRange(anchor, env, {});
    const projection = strategy.project({
      ...viewInput(snapshot, range, env),
      expandedResourceIds: [],
      options: { unassigned: "bucket" },
      resources,
    });

    expect(projection.resources.map(({ resource }) => resource.key)).toEqual([
      "resource:string:floor-1",
      "resource:string:garage",
      "unassigned",
    ]);
    expect(projection.columns).toHaveLength(3);
  });
});
