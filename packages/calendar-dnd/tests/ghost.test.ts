// @vitest-environment jsdom

import { beforeEach, describe, expect, test } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  projectTimeGrid,
  timeGridColumns,
  type CalendarEnvironmentBase,
  type CalendarEventPlacement,
} from "@moltenship/calendar-core";
import { plainDateInterval } from "@moltenship/calendar-temporal";

import { ghostLayout } from "../src/ghost";
import type { TargetSurface } from "../src/targets";
import { place, resetLayout } from "./dom-fixture";

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
