import { describe, expect, test } from "vite-plus/test";

import {
  layoutTimeGrid,
  queryVisibleEvents,
  splitEventsByDay,
  timeGridColumns,
  type TimeGridEventLayout,
} from "../src/index";
import { dates, floating, snapshotOf, timed, type FixtureEvent } from "./view-fixtures";

/** Lays out events and reads each column as `id top-bottom left/width`, with top and bottom in hours. */
function grid(
  events: readonly FixtureEvent[],
  start: string,
  end: string,
  timeZone: string,
): readonly (readonly string[])[] {
  const range = dates(start, end);
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshotOf(events), range, timeZone),
    range,
    timeZone,
  );
  const read = ({
    fragment,
    height,
    left,
    top,
    width,
  }: TimeGridEventLayout<(typeof fragments)[number]>) => {
    const hours = (fraction: number) => Math.round(fraction * 24 * 60) / 60;
    const share = (fraction: number) => Number(fraction.toFixed(2));
    return `${fragment.event.id} ${hours(top)}-${hours(top + height)} ${share(left)}/${share(width)}`;
  };

  return layoutTimeGrid(timeGridColumns(range, timeZone), fragments).map((column) =>
    column.map(read),
  );
}

describe("time-grid layout of day fragments", () => {
  test("splits a cross-midnight event into both columns", () => {
    expect(
      grid(
        [timed("late", "2026-10-08T21:00Z", "2026-10-09T01:30Z")],
        "2026-10-08",
        "2026-10-10",
        "Europe/London",
      ),
    ).toEqual([["late 22-24 0/1"], ["late 0-2.5 0/1"]]);
  });

  test("places floating events by wall time and packs them with timed events", () => {
    expect(
      grid(
        [
          floating("standup", "2026-10-08T09:00", "2026-10-08T10:00"),
          timed("review", "2026-10-08T13:30Z", "2026-10-08T14:30Z"),
        ],
        "2026-10-08",
        "2026-10-09",
        "America/New_York",
      ),
    ).toEqual([["standup 9-10 0/0.5", "review 9.5-10.5 0.5/0.5"]]);
  });

  test("puts the two occurrences of a repeated hour side by side", () => {
    expect(
      grid(
        [
          timed("standard", "2026-11-01T06:00Z", "2026-11-01T06:30Z"),
          timed("daylight", "2026-11-01T05:00Z", "2026-11-01T05:30Z"),
          timed("after", "2026-11-01T07:00Z", "2026-11-01T08:00Z"),
          timed("across", "2026-11-01T05:30Z", "2026-11-01T06:15Z"),
        ],
        "2026-11-01",
        "2026-11-02",
        "America/New_York",
      ),
    ).toEqual([
      [
        "across 1-2 0/0.33",
        "daylight 1-1.5 0.33/0.33",
        "standard 1-1.5 0.67/0.33",
        "after 2-3 0/1",
      ],
    ]);
  });

  test("keeps every hour row on a spring-forward day", () => {
    expect(
      grid(
        [
          timed("night", "2026-03-08T06:00Z", "2026-03-08T08:00Z"),
          floating("skipped", "2026-03-08T02:00", "2026-03-08T03:00"),
        ],
        "2026-03-08",
        "2026-03-09",
        "America/New_York",
      ),
    ).toEqual([["night 1-4 0/0.5", "skipped 2-3 0.5/0.5"]]);
  });

  test("returns an empty layout for columns without fragments", () => {
    expect(
      grid(
        [timed("tue", "2026-10-06T13:00Z", "2026-10-06T14:00Z")],
        "2026-10-05",
        "2026-10-08",
        "UTC",
      ),
    ).toEqual([[], ["tue 13-14 0/1"], []]);
  });
});
