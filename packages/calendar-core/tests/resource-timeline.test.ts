import { describe, expect, test } from "vite-plus/test";

import {
  createResourceTree,
  projectResourceTimeline,
  resourceTimelineStrategy,
  timeGridColumns,
  timeGridTitle,
  timelineExtent,
  timelinePosition,
  type CalendarResource,
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

const timeZone = "America/New_York";
const env = environment(timeZone);
const zoned = (wall: string) => Temporal.ZonedDateTime.from(`${wall}[${timeZone}]`);
const at = (wall: string) => zoned(wall).toInstant().toString();

const room = (id: string, parentId?: string): CalendarResource<null> => ({
  data: null,
  id,
  title: id,
  ...(parentId === undefined ? {} : { parentId }),
});
const resources = createResourceTree([
  room("floor"),
  room("orchid", "floor"),
  room("lotus", "floor"),
]);

function on(event: FixtureEvent, ...resourceIds: string[]): FixtureEvent {
  return { ...event, resourceIds };
}

/** A fraction of a range of `days` days as wall-clock `day+H:MM`. */
function clock(fraction: number, days: number): string {
  const minutes = Math.round(fraction * days * 24 * 60);
  const day = Math.floor(minutes / (24 * 60));
  const rest = minutes % (24 * 60);
  return `${day}+${Math.floor(rest / 60)}:${String(rest % 60).padStart(2, "0")}`;
}

function extent(start: string, end: string, event: FixtureEvent): string {
  const columns = timeGridColumns(dates(start, end), timeZone);
  const found = timelineExtent(columns, event);
  return found === null
    ? "none"
    : `${clock(found.start, columns.length)}–${clock(found.end, columns.length)}`;
}

describe("timeline geometry", () => {
  test("measures timed, floating, and all-day events along a nominal wall clock", () => {
    expect(
      extent(
        "2026-10-08",
        "2026-10-11",
        timed("a", at("2026-10-08T22:00"), at("2026-10-09T01:30")),
      ),
    ).toBe("0+22:00–1+1:30");
    expect(
      extent("2026-10-08", "2026-10-11", floating("f", "2026-10-09T09:00", "2026-10-09T10:00")),
    ).toBe("1+9:00–1+10:00");
    expect(extent("2026-10-08", "2026-10-11", allDay("d", "2026-10-09", "2026-10-11"))).toBe(
      "1+0:00–3+0:00",
    );
  });

  test("clips to the range and misses what falls outside it", () => {
    expect(
      extent(
        "2026-10-08",
        "2026-10-09",
        timed("long", at("2026-10-07T12:00"), at("2026-10-10T12:00")),
      ),
    ).toBe("0+0:00–1+0:00");
    expect(extent("2026-10-08", "2026-10-09", allDay("before", "2026-10-06", "2026-10-07"))).toBe(
      "none",
    );
    expect(timelineExtent([], allDay("empty", "2026-10-06", "2026-10-07"))).toBeNull();
  });

  test("keeps 25- and 23-hour days as wide as their neighbours", () => {
    // 2026-11-01 repeats 01:00–02:00; both occurrences fall in the same band.
    expect(
      extent(
        "2026-10-31",
        "2026-11-02",
        timed("second", "2026-11-01T06:00:00Z", "2026-11-01T06:30:00Z"),
      ),
    ).toBe("1+1:00–1+1:30");
    expect(
      extent(
        "2026-10-31",
        "2026-11-02",
        timed("across", at("2026-11-01T00:30"), "2026-11-01T06:30:00Z"),
      ),
    ).toBe("1+0:30–1+2:00");
    // 2026-03-08 skips 02:00–03:00, so a night across it leaves the gap's band empty but spans it.
    expect(
      extent(
        "2026-03-07",
        "2026-03-09",
        timed("night", at("2026-03-08T01:00"), at("2026-03-08T04:00")),
      ),
    ).toBe("1+1:00–1+4:00");
  });

  test("places an instant, such as now, by its wall time", () => {
    const columns = timeGridColumns(dates("2026-10-08", "2026-10-10"), timeZone);

    expect(clock(timelinePosition(columns, zoned("2026-10-09T06:00").toInstant())!, 2)).toBe(
      "1+6:00",
    );
    expect(timelinePosition(columns, zoned("2026-10-12T06:00").toInstant())).toBeNull();
  });
});

const events = [
  on(timed("standup", at("2026-10-08T09:00"), at("2026-10-08T09:30")), "orchid"),
  on(timed("pairing", at("2026-10-08T09:15"), at("2026-10-08T10:00")), "orchid", "lotus"),
  on(timed("blip", at("2026-10-08T09:30"), at("2026-10-08T09:31")), "orchid"),
  on(timed("late", at("2026-10-08T09:40"), at("2026-10-08T10:30")), "orchid"),
  on(allDay("offsite", "2026-10-07", "2026-10-10"), "floor"),
  timed("lunch", at("2026-10-08T12:00"), at("2026-10-08T13:00")),
];
const snapshot = snapshotOf(events);
const input = (range: ReturnType<typeof dates>, extra: object = {}) => ({
  ...viewInput(snapshot, range, env, "2026-10-08"),
  expandedResourceIds: ["floor"],
  resources,
  ...extra,
});

type Hours = Extract<ResourceTimelineProjection<FixtureEvent>, { unit: "hour" }>;
type Days = Extract<ResourceTimelineProjection<FixtureEvent>, { unit: "day" }>;

describe("resource-timeline projection", () => {
  test("a one-day timeline packs bars per row along the wall clock", () => {
    const projection = projectResourceTimeline(input(dates("2026-10-08", "2026-10-09"))) as Hours;
    const rows = projection.rows.map(
      ({ bars, laneCount, resource }) =>
        `${resource.id} (${laneCount}): ${bars.map(({ end, event, lane, start }) => `${event.id}@${lane} ${clock(start, 1)}–${clock(end, 1)}`).join(", ")}`,
    );

    expect(projection.unit).toBe("hour");
    expect(rows).toEqual([
      "floor (1): offsite@0 0+0:00–1+0:00",
      // The one-minute blip reserves a quarter hour, so "late" cannot share its lane.
      "orchid (3): standup@0 0+9:00–0+9:30, pairing@1 0+9:15–0+10:00, blip@0 0+9:30–0+9:31, late@2 0+9:40–0+10:30",
      "lotus (1): pairing@0 0+9:15–0+10:00",
    ]);
    expect(projection.columns.map(({ date }) => date.toString())).toEqual(["2026-10-08"]);
    expect(projection.today?.toString()).toBe("2026-10-08");
  });

  test("bars keep one canonical event and say when it runs past the range", () => {
    const projection = projectResourceTimeline(input(dates("2026-10-08", "2026-10-09"))) as Hours;
    const [floor, orchid, lotus] = projection.rows;
    const offsite = floor!.bars[0]!;

    expect(offsite).toMatchObject({ end: 1, endsAfter: true, start: 0, startsBefore: true });
    expect(orchid!.bars[1]!.event).toBe(lotus!.bars[0]!.event);
    expect(lotus!.bars[0]!.event).toBe(snapshot.get("pairing"));
    expect(orchid!.bars[0]).toMatchObject({ endsAfter: false, startsBefore: false });
  });

  test("a longer timeline lays rows out like a month, a segment per run of days", () => {
    const projection = projectResourceTimeline(input(dates("2026-10-05", "2026-10-12"))) as Days;
    const rows = projection.rows.map(
      ({ laneCount, resource, segments }) =>
        `${resource.id} (${laneCount}): ${segments.map(({ column, event, lane, span }) => `${event.id}@${lane} ${column}+${span}`).join(", ")}`,
    );

    expect(projection.unit).toBe("day");
    expect(rows).toEqual([
      "floor (1): offsite@0 2+3",
      "orchid (4): standup@0 3+1, pairing@1 3+1, blip@2 3+1, late@3 3+1",
      "lotus (1): pairing@0 3+1",
    ]);
    expect(projection.columns).toHaveLength(7);
  });

  test("the slot unit and the unassigned bucket follow the options", () => {
    const week = dates("2026-10-05", "2026-10-12");
    const hours = projectResourceTimeline(input(week, { slotUnit: "hour" })) as Hours;
    const bucket = projectResourceTimeline(
      input(dates("2026-10-08", "2026-10-09"), { expandedResourceIds: [], unassigned: "bucket" }),
    ) as Hours;

    expect(hours.unit).toBe("hour");
    expect(clock(hours.rows[1]!.bars[0]!.start, 7)).toBe("3+9:00");
    expect(
      bucket.rows.map(
        ({ bars, resource }) => `${resource.key}: ${bars.map(({ event }) => event.id).join(",")}`,
      ),
    ).toEqual(["resource:string:floor: offsite", "unassigned: lunch"]);
  });
});

describe("resource-timeline strategy", () => {
  const anchor = Temporal.PlainDate.from("2026-10-08");

  test("pages days, weeks, and calendar months", () => {
    const month = resourceTimelineStrategy({ kind: "month" });
    const week = resourceTimelineStrategy({ kind: "week" });
    const day = resourceTimelineStrategy({ count: 1, kind: "days" });
    const range = month.getRange(anchor, env, {});

    expect(`${range.start.toString()}/${range.end.toString()}`).toBe("2026-10-01/2026-11-01");
    expect(month.getTitle(range, env, {})).toBe("October 2026");
    expect(month.navigate(Temporal.PlainDate.from("2026-01-31"), 1, {}).toString()).toBe(
      "2026-02-28",
    );
    const weekRange = week.getRange(anchor, env, {});
    expect(weekRange.start.toString()).toBe("2026-10-04");
    expect(week.getTitle(weekRange, env, {})).toBe(timeGridTitle(weekRange, env.locale));
    expect(day.navigate(anchor, -1, {}).toString()).toBe("2026-10-07");
  });

  test("projects with the root's resources and the view's options", () => {
    const strategy = resourceTimelineStrategy<
      { readonly slotUnit?: "day" | "hour"; readonly unassigned?: "bucket" | "hide" },
      FixtureEvent
    >({ kind: "month" });
    const range = strategy.getRange(anchor, env, {});
    const projection = strategy.project({
      ...input(range),
      options: { slotUnit: "hour", unassigned: "bucket" },
    });

    expect(projection.unit).toBe("hour");
    expect(projection.columns).toHaveLength(31);
    expect(projection.rows.at(-1)?.resource.id).toBeNull();
  });
});
