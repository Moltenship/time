import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalEventAdapter,
  createEventSnapshot,
  layoutTimeGrid,
  queryVisibleEvents,
  splitEventsByDay,
  timeGridColumns,
  type TimeGridEventLayout,
} from "../src/index";
import { dates, floating, snapshotOf, timed, type FixtureEvent } from "./view-fixtures";

/** Lays out events and reads each column as `id top-bottom left/width`, with wall times as `H:MM`. */
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
    const clock = (fraction: number) => {
      const minutes = Math.round(fraction * 24 * 60);
      return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
    };
    const share = (fraction: number) => Number(fraction.toFixed(2));
    return `${fragment.event.id} ${clock(top)}-${clock(top + height)} ${share(left)}/${share(width)}`;
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
    ).toEqual([["late 22:00-24:00 0/1"], ["late 0:00-2:30 0/1"]]);
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
    ).toEqual([["standup 9:00-10:00 0/0.5", "review 9:30-10:30 0.5/0.5"]]);
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
        "across 1:00-2:00 0/0.33",
        "daylight 1:00-1:30 0.33/0.33",
        "standard 1:00-1:30 0.67/0.33",
        "after 2:00-3:00 0/1",
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
    ).toEqual([["night 1:00-4:00 0/0.5", "skipped 2:00-3:00 0.5/0.5"]]);
  });

  test("measures every offset run on the date when a fold crosses midnight", () => {
    // St. John's fell back at 00:01, repeating 23:01–00:01 across midnight.
    expect(
      grid(
        [
          timed("a", "2010-11-07T02:00Z", "2010-11-07T03:15Z"),
          timed("b", "2010-11-07T02:40Z", "2010-11-07T03:00Z"),
        ],
        "2010-11-06",
        "2010-11-09",
        "America/St_Johns",
      ),
    ).toEqual([["a 23:01-24:00 0/0.5", "b 23:10-23:30 0.5/0.5"], ["a 0:00-0:01 0/1"], []]);
  });

  test("keeps lanes independent of input order when IDs differ only by type", () => {
    const adapter = createCanonicalEventAdapter<null, number | string, string>();
    const event = (id: number | string) => ({
      data: null,
      end: Temporal.Instant.from("2026-10-08T11:00Z"),
      id,
      kind: "timed" as const,
      start: Temporal.Instant.from("2026-10-08T10:00Z"),
      title: String(id),
    });
    const range = dates("2026-10-08", "2026-10-09");
    const lanes = (events: readonly ReturnType<typeof event>[]) => {
      const fragments = splitEventsByDay(createEventSnapshot(events, adapter).events, range, "UTC");
      return layoutTimeGrid(timeGridColumns(range, "UTC"), fragments)[0]!.map(
        ({ fragment, left }) => [fragment.event.id, left],
      );
    };

    expect(lanes([event(1), event("1")])).toEqual([
      [1, 0],
      ["1", 0.5],
    ]);
    expect(lanes([event("1"), event(1)])).toEqual(lanes([event(1), event("1")]));
  });

  test("returns an empty layout for columns without fragments", () => {
    expect(
      grid(
        [timed("tue", "2026-10-06T13:00Z", "2026-10-06T14:00Z")],
        "2026-10-05",
        "2026-10-08",
        "UTC",
      ),
    ).toEqual([[], ["tue 13:00-14:00 0/1"], []]);
  });
});
