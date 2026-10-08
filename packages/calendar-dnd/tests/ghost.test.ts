// @vitest-environment jsdom

import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  projectTimeGrid,
  splitEventsByDay,
  timeGridColumns,
  type CalendarEnvironmentBase,
  type CalendarEventPlacement,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import { ghostLayout } from "../src/ghost";
import type { TargetSurface } from "../src/targets";
import { place, resetLayout } from "./dom-fixture";

/** Records the date range each preview asks the projection's day splitter to cover. */
const splitRanges = vi.hoisted((): string[] => []);
vi.mock("@moltenship/calendar-core", async (importOriginal) => {
  const core = await importOriginal<typeof import("@moltenship/calendar-core")>();
  return {
    ...core,
    splitEventsByDay: ((events, range, zone) => {
      splitRanges.push(`${range.start.toString()}/${range.end.toString()}`);
      return core.splitEventsByDay(events, range, zone);
    }) satisfies typeof core.splitEventsByDay,
  };
});

const timeZone = "America/New_York";
// Clocks fall back on Sunday 2026-11-01, so that day is 25 hours long.
const range = plainDateInterval(
  Temporal.PlainDate.from("2026-10-31"),
  Temporal.PlainDate.from("2026-11-02"),
);
const columns = timeGridColumns(range, timeZone);

function timed(start: string, end: string): CalendarEventPlacement<string> {
  return {
    end: Temporal.ZonedDateTime.from(end).toInstant(),
    kind: "timed",
    resourceIds: [],
    start: Temporal.ZonedDateTime.from(start).toInstant(),
  };
}

/** Days side by side: all-day cells on top, 100px-per-hour columns below, all 100px wide. */
function mountSurface(days = columns): TargetSurface {
  resetLayout();
  const region = document.createElement("div");
  document.body.append(region);
  days.forEach(({ date }, index) => {
    const allDay = document.createElement("div");
    allDay.setAttribute("data-all-day", "");
    allDay.setAttribute("data-date", date.toString());
    const column = document.createElement("div");
    column.setAttribute("data-date", date.toString());
    region.append(
      place(allDay, { height: 40, left: index * 100, top: 0, width: 100 }, 2),
      place(column, { height: 2400, left: index * 100, top: 40, width: 100 }, 2),
    );
  });
  return {
    clippers: new Map(),
    columns: new Map(days.map((column) => [column.date.toString(), column])),
    region,
  };
}

beforeEach(() => {
  resetLayout();
});

describe("where a preview lands", () => {
  // Wall-clock length and elapsed time disagree on the fall-back day.
  const placements = {
    "24.5 hours that look like 23.5": timed(
      "2026-11-01T00:00-04:00[America/New_York]",
      "2026-11-01T23:30-05:00[America/New_York]",
    ),
    "22.5 hours from the repeated 01:00": timed(
      "2026-11-01T01:00-05:00[America/New_York]",
      "2026-11-01T23:30-05:00[America/New_York]",
    ),
    "a wall-clock day that lasts 25 hours": timed(
      "2026-10-31T09:00-04:00[America/New_York]",
      "2026-11-01T09:00-05:00[America/New_York]",
    ),
    "23 hours across midnight": timed(
      "2026-10-31T12:00-04:00[America/New_York]",
      "2026-11-01T10:00-05:00[America/New_York]",
    ),
  };

  test("follows the time grid's rule for its all-day row", () => {
    const surface = mountSurface();
    const projection = projectTimeGrid({
      environment: { timeZone } as CalendarEnvironmentBase,
      range,
      snapshot: createEventSnapshot(
        Object.entries(placements).map(([title, placement]) => ({
          ...placement,
          data: null,
          id: title,
          title,
        })),
        createCanonicalEventAdapter<null, string, string>(),
      ),
      today: null,
    });
    const inAllDayRow = new Set(projection.allDay.segments.map(({ event }) => event.id));

    for (const [title, placement] of Object.entries(placements)) {
      const { axis, rects } = ghostLayout(surface, placement, timeZone);
      expect([title, axis]).toEqual([title, inAllDayRow.has(title) ? "day" : "time"]);
      expect(rects.length).toBeGreaterThan(0);
    }
    expect(inAllDayRow).toEqual(
      new Set(["24.5 hours that look like 23.5", "a wall-clock day that lasts 25 hours"]),
    );
  });

  test("covers the all-day cells an event of a day or more will occupy", () => {
    const surface = mountSurface();
    const { rects } = ghostLayout(
      surface,
      placements["a wall-clock day that lasts 25 hours"],
      timeZone,
    );

    expect(rects.map(({ left, top, width }) => ({ left, top, width }))).toEqual([
      { left: 0, top: 0, width: 200 },
    ]);
  });
});

describe("clipping", () => {
  test("keeps segments inside their scroll viewport and drops hidden ones", () => {
    const surface = mountSurface();
    const viewport = surface.region;
    viewport.style.overflowY = "auto";
    place(viewport, { height: 400, left: 0, top: 100, width: 200 }, 2);
    // Scroll the columns so 03:00 sits at the viewport's top edge.
    for (const column of viewport.querySelectorAll<HTMLElement>(
      "[data-date]:not([data-all-day])",
    )) {
      const { left } = column.getBoundingClientRect();
      place(column, { height: 2400, left, top: 100 - 300, width: 100 }, 2);
    }

    const visible = ghostLayout(
      surface,
      timed("2026-10-31T02:00-04:00[America/New_York]", "2026-10-31T09:00-04:00[America/New_York]"),
      timeZone,
    );
    expect(visible.rects).toEqual([
      {
        height: 700,
        left: 0,
        top: 0,
        visible: { bottom: 500, left: 0, right: 200, top: 100 },
        width: 100,
      },
    ]);

    const hidden = ghostLayout(
      surface,
      timed("2026-10-31T00:30-04:00[America/New_York]", "2026-10-31T02:30-04:00[America/New_York]"),
      timeZone,
    );
    expect(hidden.rects).toEqual([]);
  });
});

test("skips a date the time zone removed, as the committed event does", () => {
  // Samoa skipped 2011-12-30 when it moved across the date line.
  const apia = "Pacific/Apia";
  const days = plainDateInterval(
    Temporal.PlainDate.from("2011-12-29"),
    Temporal.PlainDate.from("2012-01-01"),
  );
  const placement = timed(
    "2011-12-29T12:00-10:00[Pacific/Apia]",
    "2011-12-31T12:00+14:00[Pacific/Apia]",
  );
  const surface = mountSurface(timeGridColumns(days, apia));
  const projection = projectTimeGrid({
    environment: { timeZone: apia } as CalendarEnvironmentBase,
    range: days,
    snapshot: createEventSnapshot(
      [{ ...placement, data: null, id: "trip", title: "Trip" }],
      createCanonicalEventAdapter<null, string, string>(),
    ),
    today: null,
  });

  const { axis, rects } = ghostLayout(surface, placement, apia);
  expect(axis).toBe("day");
  expect(rects.map(({ left, width }) => ({ left, width }))).toEqual(
    projection.allDay.segments.map(({ column, span }) => ({
      left: column * 100,
      width: span * 100,
    })),
  );
  expect(rects.map(({ left }) => left)).toEqual([0, 200]);
});

test("keeps neighbouring day cells apart when different ancestors clip them", () => {
  const surface = mountSurface();
  for (const cell of surface.region.querySelectorAll<HTMLElement>("[data-all-day]")) {
    const wrapper = document.createElement("div");
    // jsdom does not expand the `overflow` shorthand into the longhands it computes.
    wrapper.style.overflowX = "hidden";
    wrapper.style.overflowY = "hidden";
    cell.replaceWith(wrapper);
    wrapper.append(cell);
    const box = cell.getBoundingClientRect();
    place(wrapper, { height: box.height, left: box.left, top: box.top, width: box.width }, 2);
  }

  const { rects } = ghostLayout(
    surface,
    {
      end: Temporal.PlainDate.from("2026-11-02"),
      kind: "all-day",
      resourceIds: [],
      start: Temporal.PlainDate.from("2026-10-31"),
    },
    timeZone,
  );
  expect(rects.map(({ left, visible, width }) => ({ left, visible, width }))).toEqual([
    { left: 0, visible: { bottom: 40, left: 0, right: 100, top: 0 }, width: 100 },
    { left: 100, visible: { bottom: 40, left: 100, right: 200, top: 0 }, width: 100 },
  ]);
});

describe("dates a jump back across midnight repeats", () => {
  // St. John's fell back from 00:01 to 23:01 on 2010-11-07, repeating an hour onto Nov 6.
  const stJohns = "America/St_Johns";
  const days = plainDateInterval(
    Temporal.PlainDate.from("2010-11-06"),
    Temporal.PlainDate.from("2010-11-09"),
  );
  const instants = (start: string, end: string): CalendarEventPlacement<string> => ({
    end: Temporal.Instant.from(end),
    kind: "timed",
    resourceIds: [],
    start: Temporal.Instant.from(start),
  });
  // Nov 6 23:10 to Nov 7 23:10 on the wall clock: 24 hours, touching both dates.
  const day = instants("2010-11-07T02:40Z", "2010-11-08T02:40Z");
  // Both ends on Nov 7, but the repeated hour also falls on Nov 6.
  const repeated = instants("2010-11-07T02:30:30Z", "2010-11-07T05:00Z");

  function boxes(rects: readonly { readonly left: number; readonly width: number }[]) {
    return rects.map(({ left, width }) => ({ left, width }));
  }

  /** Day cells only, as in a month view: no time columns to borrow day ranges from. */
  function mountDayCells(): TargetSurface {
    resetLayout();
    const region = document.createElement("div");
    document.body.append(region);
    ["2010-11-06", "2010-11-07", "2010-11-08"].forEach((date, index) => {
      const cell = document.createElement("div");
      cell.setAttribute("data-date", date);
      region.append(place(cell, { height: 80, left: index * 100, top: 0, width: 100 }, 2));
    });
    return { clippers: new Map(), columns: new Map(), region };
  }

  test("a time grid previews the dates its all-day row will show", () => {
    const projection = projectTimeGrid({
      environment: { timeZone: stJohns } as CalendarEnvironmentBase,
      range: days,
      snapshot: createEventSnapshot(
        [{ ...day, data: null, id: "day", title: "Day" }],
        createCanonicalEventAdapter<null, string, string>(),
      ),
      today: null,
    });

    const { axis, rects } = ghostLayout(mountSurface(timeGridColumns(days, stJohns)), day, stJohns);
    expect(axis).toBe("day");
    expect(boxes(rects)).toEqual(
      projection.allDay.segments.map(({ column, span }) => ({
        left: column * 100,
        width: span * 100,
      })),
    );
    expect(boxes(rects)).toEqual([{ left: 0, width: 200 }]);
  });

  test("day cells without time columns preview the projected dates too", () => {
    const touched = (placement: CalendarEventPlacement<string>) =>
      splitEventsByDay(
        [{ ...placement, event: null, id: "event", inputIndex: 0, isReadOnly: false, title: "" }],
        days,
        stJohns,
      ).map(({ date }) => date.toString());

    expect(touched(repeated)).toEqual(["2010-11-06", "2010-11-07"]);
    expect(boxes(ghostLayout(mountDayCells(), day, stJohns).rects)).toEqual([
      { left: 0, width: 200 },
    ]);
    expect(boxes(ghostLayout(mountDayCells(), repeated, stJohns).rects)).toEqual([
      { left: 0, width: 200 },
    ]);
  });
});

test("splits only the rendered dates of a long event", () => {
  const surface = mountSurface();
  const decade: CalendarEventPlacement<string> = {
    end: Temporal.PlainDate.from("2030-01-01"),
    kind: "all-day",
    resourceIds: [],
    start: Temporal.PlainDate.from("2020-01-01"),
  };
  const longTimed = timed(
    "2020-01-01T09:00-05:00[America/New_York]",
    "2030-01-01T09:00-05:00[America/New_York]",
  );

  for (const placement of [decade, longTimed]) {
    splitRanges.length = 0;
    const { rects } = ghostLayout(surface, placement, timeZone);
    expect(rects.map(({ left, width }) => ({ left, width }))).toEqual([{ left: 0, width: 200 }]);
    expect(splitRanges).toEqual(["2026-10-31/2026-11-02"]);
  }
});

test("orders rendered dates by date, including years past 9999", () => {
  resetLayout();
  const region = document.createElement("div");
  document.body.append(region);
  ["9999-12-30", "9999-12-31", "+010000-01-01"].forEach((date, index) => {
    const cell = document.createElement("div");
    cell.setAttribute("data-date", date);
    region.append(place(cell, { height: 80, left: index * 100, top: 0, width: 100 }, 2));
  });
  splitRanges.length = 0;

  const { rects } = ghostLayout(
    { clippers: new Map(), columns: new Map(), region },
    {
      end: Temporal.PlainDate.from("+010000-01-02"),
      kind: "all-day",
      resourceIds: [],
      start: Temporal.PlainDate.from("9999-12-31"),
    },
    timeZone,
  );
  expect(splitRanges).toEqual(["9999-12-30/+010000-01-02"]);
  expect(rects.map(({ left, width }) => ({ left, width }))).toEqual([{ left: 100, width: 200 }]);
});
