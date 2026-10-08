import fc from "fast-check";
import { describe, expect, test } from "vite-plus/test";

import {
  instantInterval,
  plainDateInterval,
  splitInstantRangeByZonedDay,
} from "@moltenship/calendar-temporal";

import {
  timedFragmentBox,
  timeGridColumns,
  timeGridDateTimeAt,
  timeGridPosition,
  type TimeGridBand,
  type TimeGridColumn,
  type TimeGridPointOptions,
} from "../src/index";

function column(date: string, timeZone: string): TimeGridColumn {
  const start = Temporal.PlainDate.from(date);
  return timeGridColumns(plainDateInterval(start, start.add({ days: 1 })), timeZone)[0]!;
}

/** A band as `[top, bottom]` wall hours, rounded to the nanosecond. */
function hours(band: TimeGridBand): readonly [number, number] {
  const round = (fraction: number) => Math.round(fraction * 24 * 3.6e12) / 3.6e12;
  return [round(band.top), round(band.top + band.height)];
}

function box(target: TimeGridColumn, start: string, end: string): readonly [number, number] {
  return hours(
    timedFragmentBox(
      target,
      instantInterval(Temporal.Instant.from(start), Temporal.Instant.from(end)),
    ),
  );
}

function at(target: TimeGridColumn, wallHours: number, options?: TimeGridPointOptions): string {
  return timeGridDateTimeAt(target, wallHours / 24, options).toString();
}

describe("time-grid columns", () => {
  test("builds one column per visible date with stable keys and no bands on ordinary days", () => {
    const start = Temporal.PlainDate.from("2026-10-05");
    const columns = timeGridColumns(
      plainDateInterval(start, start.add({ days: 7 })),
      "America/New_York",
    );

    expect(columns.map(({ date }) => date.day)).toEqual([5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(columns.map(({ key }) => key)).size).toBe(7);
    expect(columns.every(({ folds, gaps }) => folds.length === 0 && gaps.length === 0)).toBe(true);
    expect(Object.isFrozen(columns)).toBe(true);
  });

  test("marks spring-forward gaps and fall-back folds as bands on the nominal axis", () => {
    const cases = [
      ["2026-03-08", "America/New_York", "gaps", [2, 3], 23],
      ["2026-11-01", "America/New_York", "folds", [1, 2], 25],
      ["2026-03-29", "Europe/London", "gaps", [1, 2], 23],
      ["2026-10-25", "Europe/London", "folds", [1, 2], 25],
      ["2026-10-04", "Australia/Lord_Howe", "gaps", [2, 2.5], 23.5],
      ["2026-09-06", "America/Santiago", "gaps", [0, 1], 23],
    ] as const;

    for (const [date, timeZone, kind, band, dayHours] of cases) {
      const target = column(date, timeZone);
      const other = kind === "gaps" ? "folds" : "gaps";

      expect(target[kind].map(hours)).toEqual([band]);
      expect(target[other]).toEqual([]);
      expect(target.day.durationNanoseconds).toBe(BigInt(dayHours * 3.6e12));
    }
  });

  test("covers a date removed by a date-line change with one gap", () => {
    const skipped = column("2011-12-30", "Pacific/Apia");

    expect(skipped.day.kind).toBe("skipped");
    expect(skipped.gaps.map(hours)).toEqual([[0, 24]]);
  });
});

describe("instant to position", () => {
  const start = Temporal.PlainDate.from("2026-10-05");
  const columns = timeGridColumns(
    plainDateInterval(start, start.add({ days: 7 })),
    "America/New_York",
  );

  test("locates an instant by owning column and wall time", () => {
    expect(timeGridPosition(columns, Temporal.Instant.from("2026-10-08T14:30:00Z"))).toEqual({
      column: 3,
      top: 10.5 / 24,
    });
    expect(timeGridPosition(columns, Temporal.Instant.from("2026-10-09T04:00:00Z"))).toEqual({
      column: 4,
      top: 0,
    });
    expect(timeGridPosition(columns, Temporal.Instant.from("2026-10-12T04:00:00Z"))).toBeNull();
    expect(timeGridPosition(columns, Temporal.Instant.from("2026-10-05T03:59:59Z"))).toBeNull();
  });

  test("uses local wall time in half-hour and quarter-hour offset zones", () => {
    const kolkata = column("2026-01-15", "Asia/Kolkata");
    const kathmandu = column("2026-01-15", "Asia/Kathmandu");
    const instant = Temporal.Instant.from("2026-01-15T03:40:00Z");

    expect(hours({ height: 0, top: timeGridPosition([kolkata], instant)!.top })[0]).toBeCloseTo(
      9 + 10 / 60,
      9,
    );
    expect(hours({ height: 0, top: timeGridPosition([kathmandu], instant)!.top })[0]).toBeCloseTo(
      9 + 25 / 60,
      9,
    );
  });

  test("places a midnight-gap day's first instant below its gap", () => {
    const santiago = column("2026-09-06", "America/Santiago");

    expect(timeGridPosition([santiago], santiago.day.start)).toEqual({ column: 0, top: 1 / 24 });
  });
});

describe("fragment boxes", () => {
  test("spans a spring-forward gap without covering it when ending at the transition", () => {
    const spring = column("2026-03-08", "America/New_York");

    expect(box(spring, "2026-03-08T06:00Z", "2026-03-08T08:00Z")).toEqual([1, 4]);
    expect(box(spring, "2026-03-08T06:30Z", "2026-03-08T07:00Z")).toEqual([1.5, 2]);
    expect(box(spring, "2026-03-08T07:00Z", "2026-03-08T08:00Z")).toEqual([3, 4]);
  });

  test("covers the repeated band when a fragment crosses a fold instead of inverting", () => {
    const fall = column("2026-11-01", "America/New_York");

    expect(box(fall, "2026-11-01T05:00Z", "2026-11-01T05:30Z")).toEqual([1, 1.5]);
    expect(box(fall, "2026-11-01T06:00Z", "2026-11-01T06:30Z")).toEqual([1, 1.5]);
    expect(box(fall, "2026-11-01T05:30Z", "2026-11-01T06:15Z")).toEqual([1, 2]);
    expect(box(fall, "2026-11-01T04:30Z", "2026-11-01T06:30Z")).toEqual([0.5, 2]);
    expect(box(fall, "2026-11-01T06:30Z", "2026-11-01T07:30Z")).toEqual([1.5, 2.5]);
  });

  test("handles a fold that ends a 25-hour day at midnight", () => {
    const santiago = column("2026-04-04", "America/Santiago");

    expect(santiago.folds.map(hours)).toEqual([[23, 24]]);
    expect(box(santiago, "2026-04-05T02:30Z", "2026-04-05T03:30Z")).toEqual([23, 24]);
    expect(box(santiago, "2026-04-05T03:00Z", "2026-04-05T04:00Z")).toEqual([23, 24]);
  });

  test("splits a cross-midnight event into one box per owning column", () => {
    const start = Temporal.PlainDate.from("2026-10-05");
    const columns = timeGridColumns(
      plainDateInterval(start, start.add({ days: 7 })),
      "Europe/London",
    );
    const event = instantInterval(
      Temporal.Instant.from("2026-10-08T21:00Z"),
      Temporal.Instant.from("2026-10-09T01:30Z"),
    );
    const placed = splitInstantRangeByZonedDay(event, "Europe/London").map((split) => {
      const index = columns.findIndex(({ date }) => date.equals(split.date));
      return [index, hours(timedFragmentBox(columns[index]!, split.interval))];
    });

    expect(placed).toEqual([
      [3, [22, 24]],
      [4, [0, 2.5]],
    ]);
  });
});

describe("position to snapped time", () => {
  test("snaps to the nearest 15 wall minutes by default and honours explicit grids", () => {
    const ordinary = column("2026-10-08", "America/New_York");

    expect(at(ordinary, 10.2)).toBe("2026-10-08T10:15:00-04:00[America/New_York]");
    expect(
      at(ordinary, 10.2, { snap: { increment: 30, mode: "floor", smallestUnit: "minute" } }),
    ).toBe("2026-10-08T10:00:00-04:00[America/New_York]");
    expect(at(ordinary, -1)).toBe("2026-10-08T00:00:00-04:00[America/New_York]");
    expect(at(ordinary, 30)).toBe("2026-10-09T00:00:00-04:00[America/New_York]");
  });

  test("snaps on the local grid in a quarter-hour offset zone", () => {
    expect(at(column("2026-01-15", "Asia/Kathmandu"), 10.2)).toBe(
      "2026-01-15T10:15:00+05:45[Asia/Kathmandu]",
    );
  });

  test("never lands inside a spring-forward gap", () => {
    const spring = column("2026-03-08", "America/New_York");
    const london = column("2026-03-29", "Europe/London");

    expect(at(spring, 2.5)).toBe("2026-03-08T03:00:00-04:00[America/New_York]");
    expect(at(spring, 1.95)).toBe("2026-03-08T03:00:00-04:00[America/New_York]");
    expect(
      at(spring, 1.95, { snap: { increment: 15, mode: "floor", smallestUnit: "minute" } }),
    ).toBe("2026-03-08T01:45:00-05:00[America/New_York]");
    expect(at(london, 1)).toBe("2026-03-29T02:00:00+01:00[Europe/London]");
    expect(at(column("2026-09-06", "America/Santiago"), 0)).toBe(
      "2026-09-06T01:00:00-03:00[America/Santiago]",
    );
  });

  test("snaps the pointer before resolving its fold occurrence or gap", () => {
    expect(
      at(column("2026-11-01", "America/New_York"), 55 / 60, {
        fold: "later",
        snap: { increment: 15, mode: "ceil", smallestUnit: "minute" },
      }),
    ).toBe("2026-11-01T01:00:00-05:00[America/New_York]");
    expect(
      at(column("2026-10-04", "Australia/Lord_Howe"), 2 + 11 / 60, {
        snap: { increment: 20, mode: "nearest", smallestUnit: "minute" },
      }),
    ).toBe("2026-10-04T02:30:00+11:00[Australia/Lord_Howe]");
  });

  test("resolves a repeated wall time to the requested fold occurrence", () => {
    const fall = column("2026-11-01", "America/New_York");

    expect(at(fall, 1.5)).toBe("2026-11-01T01:30:00-04:00[America/New_York]");
    expect(at(fall, 1.5, { fold: "later" })).toBe("2026-11-01T01:30:00-05:00[America/New_York]");
    expect(at(fall, 1.95, { fold: "later" })).toBe("2026-11-01T02:00:00-05:00[America/New_York]");
    expect(at(column("2026-10-25", "Europe/London"), 1.1, { fold: "later" })).toBe(
      "2026-10-25T01:00:00+00:00[Europe/London]",
    );
  });

  test("never floors past the pointer except out of a gap", () => {
    const days = [
      column("2026-03-08", "America/New_York"),
      column("2026-11-01", "America/New_York"),
      column("2026-10-04", "Australia/Lord_Howe"),
      column("2026-09-06", "America/Santiago"),
    ];

    fc.assert(
      fc.property(
        fc.constantFrom(...days),
        fc.double({ max: 1, min: 0, noNaN: true }),
        fc.constantFrom("earlier", "later"),
        fc.constantFrom(5, 15, 20, 30),
        (target, y, fold: "earlier" | "later", increment) => {
          const result = timeGridDateTimeAt(target, y, {
            fold,
            snap: { increment, mode: "floor", smallestUnit: "minute" },
          });
          const position = timeGridPosition([target], result.toInstant());
          const inGap = target.gaps.some(({ height, top }) => y >= top && y < top + height);

          expect(result.timeZoneId).toBe(target.day.timeZone);
          if (position !== null && !inGap) {
            expect(position.top).toBeLessThanOrEqual(y + 1e-12);
          }
        },
      ),
      { numRuns: 400 },
    );
  });
});
