import { describe, expect, test } from "vite-plus/test";

import {
  eventDateRanges,
  queryVisibleEvents,
  splitEventsByDay,
  visibleInstantRange,
} from "../src/index";
import { allDay, dates, floating, snapshotOf, timed, type FixtureEvent } from "./view-fixtures";

function fragmentsOf(
  event: FixtureEvent,
  timeZone: string,
  range = dates("2000-01-01", "2100-01-01"),
) {
  const snapshot = snapshotOf([event]);
  return splitEventsByDay(snapshot.events, range, timeZone).map((fragment) => ({
    date: fragment.date.toString(),
    end: fragment.end.toString(),
    endsAfterDay: fragment.endsAfterDay,
    start: fragment.start.toString(),
    startsBeforeDay: fragment.startsBeforeDay,
  }));
}

function fragmentTimes(event: FixtureEvent, timeZone: string) {
  return fragmentsOf(event, timeZone).map(({ end, start }) => `${start} → ${end}`);
}

describe("visible instant range", () => {
  test("bridges local day boundaries, including 23-hour DST days", () => {
    const range = visibleInstantRange(dates("2026-03-08", "2026-03-09"), "America/New_York");

    expect(range?.start.toString()).toBe("2026-03-08T05:00:00Z");
    expect(range?.end.toString()).toBe("2026-03-09T04:00:00Z");
  });

  test("starts a day with a skipped midnight at its first existing instant", () => {
    const range = visibleInstantRange(dates("2026-09-06", "2026-09-07"), "America/Santiago");

    expect(range?.start.toString()).toBe("2026-09-06T04:00:00Z");
    expect(range?.end.toString()).toBe("2026-09-07T03:00:00Z");
  });

  test("returns null for a date the time zone skipped entirely", () => {
    expect(visibleInstantRange(dates("2011-12-30", "2011-12-31"), "Pacific/Apia")).toBeNull();
  });
});

describe("visible event query", () => {
  const events = [
    allDay("ended-before", "2026-10-07", "2026-10-08"),
    allDay("all-day", "2026-10-08", "2026-10-09"),
    timed("late-evening", "2026-10-09T03:30Z", "2026-10-09T04:30Z"),
    timed("next-day", "2026-10-09T05:00Z", "2026-10-09T06:00Z"),
    floating("floating", "2026-10-08T09:00", "2026-10-08T10:00"),
    floating("floating-next-day", "2026-10-09T00:00", "2026-10-09T01:00"),
  ];

  test("queries all three kinds through the snapshot indexes", () => {
    const snapshot = snapshotOf(events);
    const visible = queryVisibleEvents(
      snapshot,
      dates("2026-10-08", "2026-10-09"),
      "America/New_York",
    );

    expect(visible.map((event) => event.id).sort()).toEqual([
      "all-day",
      "floating",
      "late-evening",
    ]);
    expect(snapshot.getQueryCacheStatistics().misses).toBe(3);
  });

  test("timed events follow the display time zone while floating events keep wall time", () => {
    const visible = queryVisibleEvents(
      snapshotOf(events),
      dates("2026-10-08", "2026-10-09"),
      "Asia/Tokyo",
    );

    expect(visible.map((event) => event.id).sort()).toEqual(["all-day", "floating"]);
  });
});

describe("day fragments", () => {
  test("all-day events cover their dates with an exclusive end", () => {
    expect(fragmentsOf(allDay("trip", "2026-10-05", "2026-10-08"), "UTC")).toEqual([
      {
        date: "2026-10-05",
        end: "2026-10-06T00:00:00",
        endsAfterDay: true,
        start: "2026-10-05T00:00:00",
        startsBeforeDay: false,
      },
      {
        date: "2026-10-06",
        end: "2026-10-07T00:00:00",
        endsAfterDay: true,
        start: "2026-10-06T00:00:00",
        startsBeforeDay: true,
      },
      {
        date: "2026-10-07",
        end: "2026-10-08T00:00:00",
        endsAfterDay: false,
        start: "2026-10-07T00:00:00",
        startsBeforeDay: true,
      },
    ]);
  });

  test("clips fragments to the range but keeps continuation flags", () => {
    const fragments = fragmentsOf(
      allDay("trip", "2026-09-28", "2026-10-03"),
      "UTC",
      dates("2026-10-01", "2026-10-08"),
    );

    expect(
      fragments.map(({ date, endsAfterDay, startsBeforeDay }) => ({
        date,
        endsAfterDay,
        startsBeforeDay,
      })),
    ).toEqual([
      { date: "2026-10-01", endsAfterDay: true, startsBeforeDay: true },
      { date: "2026-10-02", endsAfterDay: false, startsBeforeDay: true },
    ]);
  });

  test("splits a timed event at local midnight of the display time zone", () => {
    const redeye = timed("redeye", "2026-10-09T02:00Z", "2026-10-09T06:00Z");

    expect(fragmentsOf(redeye, "America/New_York")).toEqual([
      {
        date: "2026-10-08",
        end: "2026-10-09T00:00:00",
        endsAfterDay: true,
        start: "2026-10-08T22:00:00",
        startsBeforeDay: false,
      },
      {
        date: "2026-10-09",
        end: "2026-10-09T02:00:00",
        endsAfterDay: false,
        start: "2026-10-09T00:00:00",
        startsBeforeDay: true,
      },
    ]);
    expect(fragmentTimes(redeye, "UTC")).toEqual(["2026-10-09T02:00:00 → 2026-10-09T06:00:00"]);
  });

  test("an event ending exactly at local midnight stays on one day", () => {
    const evening = timed("evening", "2026-10-08T20:00-04:00", "2026-10-09T00:00-04:00");

    expect(fragmentsOf(evening, "America/New_York")).toEqual([
      {
        date: "2026-10-08",
        end: "2026-10-09T00:00:00",
        endsAfterDay: false,
        start: "2026-10-08T20:00:00",
        startsBeforeDay: false,
      },
    ]);
  });

  test("America/New_York spring-forward and fall-back days", () => {
    expect(
      fragmentTimes(
        timed("overnight", "2026-03-08T03:00Z", "2026-03-08T08:00Z"),
        "America/New_York",
      ),
    ).toEqual([
      "2026-03-07T22:00:00 → 2026-03-08T00:00:00",
      "2026-03-08T00:00:00 → 2026-03-08T04:00:00",
    ]);
    expect(
      fragmentTimes(
        timed("across-gap", "2026-03-08T06:30Z", "2026-03-08T07:30Z"),
        "America/New_York",
      ),
    ).toEqual(["2026-03-08T01:30:00 → 2026-03-08T03:30:00"]);
    expect(
      fragmentTimes(
        timed("long-day", "2026-11-01T03:00Z", "2026-11-02T04:00Z"),
        "America/New_York",
      ),
    ).toEqual([
      "2026-10-31T23:00:00 → 2026-11-01T00:00:00",
      "2026-11-01T00:00:00 → 2026-11-01T23:00:00",
    ]);
    // Inside the repeated hour the wall end precedes the wall start; the event keeps the instants.
    expect(
      fragmentTimes(timed("in-fold", "2026-11-01T05:50Z", "2026-11-01T06:10Z"), "America/New_York"),
    ).toEqual(["2026-11-01T01:50:00 → 2026-11-01T01:10:00"]);
  });

  test("Europe/London splits at BST midnight, not UTC midnight", () => {
    const late = timed("late", "2026-06-30T22:30Z", "2026-06-30T23:30Z");

    expect(fragmentTimes(late, "Europe/London")).toEqual([
      "2026-06-30T23:30:00 → 2026-07-01T00:00:00",
      "2026-07-01T00:00:00 → 2026-07-01T00:30:00",
    ]);
    expect(
      fragmentTimes(timed("spring", "2026-03-29T00:30Z", "2026-03-29T01:30Z"), "Europe/London"),
    ).toEqual(["2026-03-29T00:30:00 → 2026-03-29T02:30:00"]);
  });

  test("half-hour offsets and half-hour DST shifts", () => {
    expect(
      fragmentTimes(timed("kolkata", "2026-10-08T18:00Z", "2026-10-08T19:00Z"), "Asia/Kolkata"),
    ).toEqual([
      "2026-10-08T23:30:00 → 2026-10-09T00:00:00",
      "2026-10-09T00:00:00 → 2026-10-09T00:30:00",
    ]);
    expect(
      fragmentTimes(
        timed("adelaide", "2026-10-03T14:00Z", "2026-10-03T17:00Z"),
        "Australia/Adelaide",
      ),
    ).toEqual([
      "2026-10-03T23:30:00 → 2026-10-04T00:00:00",
      "2026-10-04T00:00:00 → 2026-10-04T03:30:00",
    ]);
    expect(
      fragmentTimes(
        timed("lord-howe", "2026-10-03T13:00Z", "2026-10-03T16:00Z"),
        "Australia/Lord_Howe",
      ),
    ).toEqual([
      "2026-10-03T23:30:00 → 2026-10-04T00:00:00",
      "2026-10-04T00:00:00 → 2026-10-04T03:00:00",
    ]);
  });

  test("a date the zone skipped entirely gets no fragment", () => {
    // Pacific/Apia jumped from 2011-12-29T24:00-10:00 straight to 2011-12-31T00:00+14:00.
    expect(
      fragmentsOf(timed("hop", "2011-12-30T09:30Z", "2011-12-30T10:30Z"), "Pacific/Apia"),
    ).toEqual([
      {
        date: "2011-12-29",
        end: "2011-12-30T00:00:00",
        endsAfterDay: true,
        start: "2011-12-29T23:30:00",
        startsBeforeDay: false,
      },
      {
        date: "2011-12-31",
        end: "2011-12-31T00:30:00",
        endsAfterDay: false,
        start: "2011-12-31T00:00:00",
        startsBeforeDay: true,
      },
    ]);
  });

  test("a jump back across midnight keeps both local dates", () => {
    // America/St_Johns went from 2010-11-07T00:01-02:30 back to 2010-11-06T23:01-03:30.
    expect(
      fragmentsOf(
        timed("rollback", "2010-11-07T02:30:30Z", "2010-11-07T02:45Z"),
        "America/St_Johns",
      ),
    ).toEqual([
      {
        date: "2010-11-06",
        end: "2010-11-06T23:15:00",
        endsAfterDay: true,
        start: "2010-11-06T23:01:00",
        startsBeforeDay: false,
      },
      {
        date: "2010-11-07",
        end: "2010-11-07T00:01:00",
        endsAfterDay: false,
        start: "2010-11-07T00:00:30",
        startsBeforeDay: true,
      },
    ]);
  });

  test("a skipped local midnight does not create a phantom fragment", () => {
    // America/Santiago jumps from 2026-09-06T00:00 to 01:00; that 01:00 is the day's start.
    expect(
      fragmentsOf(
        timed("to-day-start", "2026-09-06T02:00Z", "2026-09-06T04:00Z"),
        "America/Santiago",
      ),
    ).toEqual([
      {
        date: "2026-09-05",
        end: "2026-09-06T00:00:00",
        endsAfterDay: false,
        start: "2026-09-05T22:00:00",
        startsBeforeDay: false,
      },
    ]);
    expect(
      fragmentTimes(
        timed("from-day-start", "2026-09-06T04:00Z", "2026-09-06T05:00Z"),
        "America/Santiago",
      ),
    ).toEqual(["2026-09-06T01:00:00 → 2026-09-06T02:00:00"]);
  });

  test("floating events keep their wall time in every display time zone", () => {
    const overnight = floating("overnight", "2026-10-08T22:00", "2026-10-09T02:00");
    const expected = [
      "2026-10-08T22:00:00 → 2026-10-09T00:00:00",
      "2026-10-09T00:00:00 → 2026-10-09T02:00:00",
    ];

    expect(fragmentTimes(overnight, "America/New_York")).toEqual(expected);
    expect(fragmentTimes(overnight, "Asia/Tokyo")).toEqual(expected);
  });
});

describe("eventDateRanges", () => {
  const ranges = (event: FixtureEvent, timeZone: string) =>
    eventDateRanges(snapshotOf([event]).get(event.id)!, timeZone).map(
      ({ first, last }) => `${first.toString()}..${last.toString()}`,
    );

  test("covers an event's local dates, end excluded", () => {
    expect(ranges(allDay("trip", "2026-10-05", "2026-10-10"), "UTC")).toEqual([
      "2026-10-05..2026-10-09",
    ]);
    expect(ranges(timed("late", "2026-10-08T22:00:00Z", "2026-10-09T00:00:00Z"), "UTC")).toEqual([
      "2026-10-08..2026-10-08",
    ]);
  });

  test("starts a day early when a fold at midnight takes the clock back into it", () => {
    // St John's fell back at 00:01 on November 7, 2010, to 23:01 on November 6.
    const fold = timed("fold", "2010-11-07T02:30:00Z", "2010-11-10T04:00:00Z");

    expect(ranges(fold, "America/St_Johns")).toEqual(["2010-11-06..2010-11-10"]);
  });
});
