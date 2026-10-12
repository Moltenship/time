import { createEventSnapshot } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import {
  createCanonicalRecurrenceAdapter,
  createOccurrenceAdapter,
  createOccurrenceExpander,
  type OccurrenceRange,
  type RecurrenceAdapters,
  type RecurrenceRule,
} from "../../src";
import { date, dateTime, ids, instant, range, starts, timed, type Event } from "./helpers";

const adapters = createCanonicalRecurrenceAdapter<Event["data"]>();
const occurrenceAdapter = createOccurrenceAdapter(adapters.event);

function expand(events: readonly Event[], within: OccurrenceRange) {
  return createOccurrenceExpander(adapters).expand(events, within);
}

/** Wednesdays at 09:00 in Berlin from 2026-10-21, the week before Europe leaves summer time. */
function berlinWeekly(recurrence: Event["recurrence"] = {}, rule: Partial<RecurrenceRule> = {}) {
  return timed("sync", "2026-10-21T09:00", "Europe/Berlin", 60, {
    recurrence: { rule: { frequency: "WEEKLY", ...rule }, ...recurrence },
  });
}

describe("createOccurrenceExpander placement", () => {
  test("keeps a Berlin series at 09:00 Berlin across DST, in New York and Tokyo alike", () => {
    const sync = berlinWeekly();
    const newYork = expand([sync], range("2026-10-19", "2026-11-09", "America/New_York"));
    const tokyo = expand([sync], range("2026-10-19", "2026-11-09", "Asia/Tokyo"));

    expect(starts(newYork.occurrences, "Europe/Berlin")).toEqual([
      "2026-10-21T09:00:00",
      "2026-10-28T09:00:00",
      "2026-11-04T09:00:00",
    ]);
    // Europe leaves summer time on 25 October, the United States on 1 November.
    expect(starts(newYork.occurrences, "America/New_York")).toEqual([
      "2026-10-21T03:00:00",
      "2026-10-28T04:00:00",
      "2026-11-04T03:00:00",
    ]);
    expect(starts(tokyo.occurrences, "Asia/Tokyo")).toEqual([
      "2026-10-21T16:00:00",
      "2026-10-28T17:00:00",
      "2026-11-04T17:00:00",
    ]);
    expect(ids(newYork.occurrences)).toEqual([
      "sync::2026-10-21T07:00:00Z",
      "sync::2026-10-28T08:00:00Z",
      "sync::2026-11-04T08:00:00Z",
    ]);
    expect(ids(tokyo.occurrences)).toEqual(ids(newYork.occurrences));
    for (const { interval } of newYork.occurrences) {
      expect(interval).toMatchObject({ kind: "timed", sourceTimeZone: "Europe/Berlin" });
      expect(interval.end.since(interval.start as never).total("minutes")).toBe(60);
    }
  });

  test("compares the range's dates at the start of day in the calendar's time zone", () => {
    const sync = berlinWeekly();
    // 21 October 09:00 in Berlin is 20 October 21:00 in Honolulu.
    expect(
      ids(expand([sync], range("2026-10-21", "2026-10-22", "Pacific/Honolulu")).occurrences),
    ).toEqual([]);
    expect(
      ids(expand([sync], range("2026-10-20", "2026-10-21", "Pacific/Honolulu")).occurrences),
    ).toEqual(["sync::2026-10-21T07:00:00Z"]);
  });

  test("keeps IDs across ranges, and the same objects for occurrences the ranges share", () => {
    const sync = berlinWeekly();
    const expander = createOccurrenceExpander(adapters);
    const month = expander.expand([sync], range("2026-10-01", "2026-11-01", "Europe/Berlin"));
    const week = expander.expand([sync], range("2026-10-26", "2026-11-02", "America/New_York"));
    const again = expander.expand([sync], range("2026-10-26", "2026-11-02", "America/New_York"));

    expect(ids(week.occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(week.occurrences[0]).toBe(month.occurrences[1]);
    expect(again).toBe(week);
    expect(
      ids(expand([sync], range("2026-10-26", "2026-11-02", "Asia/Tokyo")).occurrences),
    ).toEqual(ids(week.occurrences));
  });

  test("includes an occurrence that starts before the range and ends inside it", () => {
    const night: Event = {
      data: {},
      end: instant("2026-10-21T02:00:00Z"),
      id: "night",
      kind: "timed",
      recurrence: { rule: { frequency: "DAILY" } },
      start: instant("2026-10-20T22:00:00Z"),
      title: "Night shift",
    };
    const evening: Event = {
      ...night,
      end: instant("2026-10-21T00:00:00Z"),
      id: "evening",
      start: instant("2026-10-20T20:00:00Z"),
    };
    const { occurrences } = expand([night, evening], range("2026-10-22", "2026-10-24"));

    // The evening ending at midnight touches the range without overlapping it.
    expect(ids(occurrences)).toEqual([
      "night::2026-10-21T22:00:00Z",
      "night::2026-10-22T22:00:00Z",
      "night::2026-10-23T22:00:00Z",
      "evening::2026-10-22T20:00:00Z",
      "evening::2026-10-23T20:00:00Z",
    ]);
  });

  test("places a multi-day all-day series by dates, whatever the time zone", () => {
    const weekend: Event = {
      data: {},
      end: date("2026-10-19"),
      id: "weekend",
      kind: "all-day",
      recurrence: { rule: { frequency: "WEEKLY" } },
      start: date("2026-10-16"),
      title: "Long weekend",
    };
    const berlin = expand([weekend], range("2026-10-24", "2026-10-30", "Europe/Berlin"));
    const tokyo = expand([weekend], range("2026-10-24", "2026-10-30", "Asia/Tokyo"));

    // Friday to Monday overlaps from Saturday; next Friday is the range's end.
    expect(
      berlin.occurrences.map(({ interval }) => [String(interval.start), String(interval.end)]),
    ).toEqual([["2026-10-23", "2026-10-26"]]);
    expect(ids(berlin.occurrences)).toEqual(["weekend::2026-10-23"]);
    expect(tokyo.occurrences).toEqual(berlin.occurrences);
  });

  test("places a floating series at the same wall time in every time zone", () => {
    const yoga: Event = {
      data: {},
      end: dateTime("2026-10-21T08:00"),
      id: "yoga",
      kind: "floating",
      recurrence: { rule: { count: 3, frequency: "DAILY" } },
      start: dateTime("2026-10-21T07:00"),
      title: "Yoga",
    };
    const newYork = expand([yoga], range("2026-10-01", "2026-11-01", "America/New_York"));
    const tokyo = expand([yoga], range("2026-10-01", "2026-11-01", "Asia/Tokyo"));

    expect(starts(newYork.occurrences)).toEqual([
      "2026-10-21T07:00:00",
      "2026-10-22T07:00:00",
      "2026-10-23T07:00:00",
    ]);
    expect(ids(tokyo.occurrences)).toEqual(ids(newYork.occurrences));
    expect(ids(tokyo.occurrences)[0]).toBe("yoga::2026-10-21T07:00:00");
  });

  test("counts COUNT from the first occurrence, however far the range is", () => {
    const sync = berlinWeekly({}, { count: 5 });

    expect(expand([sync], range("2030-01-01", "2030-02-01")).occurrences).toEqual([]);
    expect(ids(expand([sync], range("2026-11-16", "2026-11-23")).occurrences)).toEqual([
      "sync::2026-11-18T08:00:00Z",
    ]);
    expect(expand([sync], range("2026-11-23", "2026-11-30")).occurrences).toEqual([]);
  });

  test("returns nothing generated for an empty range", () => {
    const sync = berlinWeekly();
    expect(expand([sync], range("2026-10-21", "2026-10-21")).occurrences).toEqual([]);
    expect(expand([sync], range("2026-10-28", "2026-10-21")).occurrences).toEqual([]);
  });
});

describe("createOccurrenceExpander exceptions and extra dates", () => {
  test("removes the first occurrence with an EXDATE", () => {
    const sync = berlinWeekly({ exceptionDates: [instant("2026-10-21T07:00:00Z")] });
    const { issues, occurrences } = expand([sync], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(issues).toEqual([]);
  });

  test("adds RDATEs in time order, once when the rule has the date too", () => {
    const sync = berlinWeekly({
      recurrenceDates: [instant("2026-10-30T13:00:00Z"), instant("2026-10-28T08:00:00Z")],
    });
    const { occurrences } = expand([sync], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual([
      "sync::2026-10-21T07:00:00Z",
      "sync::2026-10-28T08:00:00Z",
      "sync::2026-10-30T13:00:00Z",
    ]);
    // An RDATE lasts as long as the first occurrence.
    expect(String(occurrences[2]?.interval.end)).toBe("2026-10-30T14:00:00Z");
  });

  test("an RDATE before the series' start still counts", () => {
    const sync = berlinWeekly({ recurrenceDates: [instant("2026-10-14T07:00:00Z")] }, { count: 1 });
    expect(ids(expand([sync], range("2026-10-01", "2026-11-01")).occurrences)).toEqual([
      "sync::2026-10-14T07:00:00Z",
      "sync::2026-10-21T07:00:00Z",
    ]);
  });

  test("excludes every occurrence on a date-only EXDATE's day, in the series' zone", () => {
    // Google writes date-only EXDATEs and UNTILs on timed series.
    const sync = berlinWeekly(
      { exceptionDates: [date("2026-10-28")] },
      { until: date("2026-11-11") },
    );
    const { issues, occurrences } = expand([sync], range("2026-10-19", "2026-12-01", "Asia/Tokyo"));

    expect(starts(occurrences, "Europe/Berlin")).toEqual([
      "2026-10-21T09:00:00",
      "2026-11-04T09:00:00",
      // A date-only UNTIL includes that whole day.
      "2026-11-11T09:00:00",
    ]);
    expect(issues).toEqual([]);
  });

  test("reads wall times on a timed series in its zone", () => {
    const sync = berlinWeekly({
      exceptionDates: [dateTime("2026-10-28T09:00")],
      recurrenceDates: [dateTime("2026-10-30T14:00")],
    });
    const { issues, occurrences } = expand([sync], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-21T07:00:00Z", "sync::2026-10-30T13:00:00Z"]);
    expect(issues).toEqual([]);
  });

  test("drops a date that can't take the series' kind, and only that date", () => {
    const lunch = timed("lunch", "2026-10-22T12:00", "Europe/Berlin");
    const sync = berlinWeekly({
      recurrenceDates: [date("2026-10-30"), instant("2026-10-31T09:00:00Z")],
    });
    const { issues, occurrences } = expand([lunch, sync], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual([
      "lunch",
      "sync::2026-10-21T07:00:00Z",
      "sync::2026-10-28T08:00:00Z",
      "sync::2026-10-31T09:00:00Z",
    ]);
    expect(issues).toEqual([
      {
        code: "date-kind-mismatch",
        event: sync,
        eventId: "sync",
        index: 1,
        message: "recurrenceDates: 1 date can't be an Instant; dropped.",
      },
    ]);
  });

  test("reads instants on an all-day series in the default time zone", () => {
    const office: Event = {
      data: {},
      end: date("2026-10-22"),
      id: "office",
      kind: "all-day",
      recurrence: {
        exceptionDates: [instant("2026-10-23T02:00:00Z")],
        rule: { count: 3, frequency: "DAILY" },
      },
      start: date("2026-10-21"),
      title: "Office day",
    };
    const within = range("2026-10-01", "2026-11-01");

    expect(ids(expand([office], within).occurrences)).toEqual([
      "office::2026-10-21",
      "office::2026-10-22",
    ]);
    // 02:00 UTC on 23 October is still 22 October in New York.
    const newYork = createOccurrenceExpander(adapters, { defaultTimeZone: "America/New_York" });
    expect(ids(newYork.expand([office], within).occurrences)).toEqual([
      "office::2026-10-21",
      "office::2026-10-23",
    ]);
  });
});

describe("createOccurrenceExpander COUNT and periods", () => {
  test("counts occurrences an EXDATE removes toward COUNT, the first one included", () => {
    const sync = berlinWeekly(
      { exceptionDates: [instant("2026-10-21T07:00:00Z"), instant("2026-10-28T08:00:00Z")] },
      { count: 3 },
    );
    expect(ids(expand([sync], range("2026-10-01", "2027-01-01")).occurrences)).toEqual([
      "sync::2026-11-04T08:00:00Z",
    ]);
  });

  test("gives an RDATE period its own length", () => {
    const sync = berlinWeekly(
      {
        recurrenceDates: [
          // Friday 30 October, 22:00 to Saturday 02:00 in Berlin.
          { end: instant("2026-10-31T01:00:00Z"), start: instant("2026-10-30T21:00:00Z") },
          instant("2026-10-30T13:00:00Z"),
        ],
      },
      { count: 1 },
    );
    const { issues, occurrences } = expand(
      [sync],
      range("2026-10-31", "2026-11-02", "Europe/Berlin"),
    );

    // It starts before the range and ends inside it; the plain RDATE lasts an hour and doesn't.
    expect(occurrences.map(({ id, interval }) => [id, String(interval.end)])).toEqual([
      ["sync::2026-10-30T21:00:00Z", "2026-10-31T01:00:00Z"],
    ]);
    expect(issues).toEqual([]);
  });

  test("drops a period whose end can't take the series' kind", () => {
    const sync = berlinWeekly(
      { recurrenceDates: [{ end: date("2026-10-31"), start: instant("2026-10-30T21:00:00Z") }] },
      { count: 1 },
    );
    const { issues, occurrences } = expand([sync], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-21T07:00:00Z"]);
    expect(issues.map(({ code }) => code)).toEqual(["date-kind-mismatch"]);
  });
});

describe("createOccurrenceExpander lengths and time zones", () => {
  test("keeps each occurrence as long as the first, exactly", () => {
    // Saturday noon to Sunday noon in Berlin, across the night Europe leaves summer time.
    const weekend = timed("weekend", "2026-10-17T12:00", "Europe/Berlin", 24 * 60, {
      recurrence: { rule: { frequency: "WEEKLY" } },
    });
    const [occurrence] = expand([weekend], range("2026-10-24", "2026-10-25")).occurrences;

    expect(occurrence?.interval.end.toString()).toBe("2026-10-25T10:00:00Z");
  });

  test("keeps a nominal DURATION's wall-clock length across DST", () => {
    const weekend = timed("weekend", "2026-10-17T12:00", "Europe/Berlin", 24 * 60, {
      recurrence: { duration: Temporal.Duration.from({ days: 1 }), rule: { frequency: "WEEKLY" } },
    });
    const { occurrences } = expand([weekend], range("2026-10-25", "2026-10-26"));

    // 24 October noon to 25 October noon takes 25 hours; it ends inside the range, so it shows.
    expect(starts(occurrences, "Europe/Berlin")).toEqual(["2026-10-24T12:00:00"]);
    expect(occurrences[0]?.interval.end.toString()).toBe("2026-10-25T11:00:00Z");
  });

  test("repeats a start written in a DST gap at the written time", () => {
    // 02:30 doesn't exist in Berlin on 29 March 2026; the first occurrence resolves to 03:30.
    const early = timed("early", "2026-03-29T02:30", "Europe/Berlin", 30, {
      recurrence: {
        rule: { count: 3, frequency: "DAILY" },
        wallStart: dateTime("2026-03-29T02:30"),
      },
    });
    const { occurrences } = expand([early], range("2026-03-29", "2026-04-01", "Europe/Berlin"));

    expect(starts(occurrences, "Europe/Berlin")).toEqual([
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
    ]);
  });

  test("repeats a series without a time zone in the default one", () => {
    const utc: Event = {
      data: {},
      end: instant("2026-10-21T08:00:00Z"),
      id: "utc",
      kind: "timed",
      recurrence: { rule: { count: 2, frequency: "WEEKLY" } },
      start: instant("2026-10-21T07:00:00Z"),
      title: "No zone",
    };
    const within = range("2026-10-19", "2026-11-02");
    const berlin = createOccurrenceExpander(adapters, { defaultTimeZone: "Europe/Berlin" });

    expect(ids(expand([utc], within).occurrences)).toEqual([
      "utc::2026-10-21T07:00:00Z",
      "utc::2026-10-28T07:00:00Z",
    ]);
    const occurrences = berlin.expand([utc], within).occurrences;
    expect(ids(occurrences)).toEqual(["utc::2026-10-21T07:00:00Z", "utc::2026-10-28T08:00:00Z"]);
    expect(occurrences[1]?.interval).not.toHaveProperty("sourceTimeZone");
  });

  test("drops only the instants an unknown default time zone can't read", () => {
    const yoga: Event = {
      data: {},
      end: dateTime("2026-10-21T08:00"),
      id: "yoga",
      kind: "floating",
      recurrence: {
        exceptionDates: [instant("2026-10-22T07:00:00Z")],
        rule: { count: 3, frequency: "DAILY" },
      },
      start: dateTime("2026-10-21T07:00"),
      title: "Yoga",
    };
    const moved: Event = {
      ...yoga,
      id: "yoga-moved",
      override: { recurrenceId: instant("2026-10-23T07:00:00Z"), seriesId: "yoga" },
      recurrence: undefined,
    };
    const expander = createOccurrenceExpander(adapters, { defaultTimeZone: "Nope/Zone" });
    const { issues, occurrences } = expander.expand(
      [yoga, moved],
      range("2026-10-01", "2026-11-01"),
    );

    expect(ids(occurrences)).toEqual([
      "yoga::2026-10-21T07:00:00",
      "yoga::2026-10-22T07:00:00",
      "yoga::2026-10-23T07:00:00",
      "yoga::2026-10-23T07:00:00Z",
    ]);
    expect(issues.map(({ code, index }) => [code, index])).toEqual([
      ["invalid-time-zone", 0],
      ["invalid-time-zone", 1],
    ]);
  });

  test("reports a time zone Temporal doesn't know, and still shows overrides", () => {
    const mars = timed("mars", "2026-10-21T09:00", "Europe/Berlin", 60, {
      recurrence: { rule: { frequency: "WEEKLY" } },
      sourceTimeZone: "Mars/Olympus_Mons",
    });
    const moved = timed("mars-moved", "2026-10-29T09:00", "Europe/Berlin", 60, {
      override: { recurrenceId: instant("2026-10-28T08:00:00Z"), seriesId: "mars" },
    });
    const { issues, occurrences } = expand([mars, moved], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["mars::2026-10-28T08:00:00Z"]);
    expect(issues.map(({ code, index }) => [code, index])).toEqual([["invalid-time-zone", 0]]);

    const unknownDefault = createOccurrenceExpander(adapters, { defaultTimeZone: "Nowhere" });
    const zoneless = { ...berlinWeekly(), sourceTimeZone: undefined } as Event;
    expect(
      unknownDefault.expand([zoneless], range("2026-10-19", "2026-11-02")).issues,
    ).toMatchObject([{ code: "invalid-time-zone", message: "Nowhere isn't a time zone." }]);
  });
});

describe("createOccurrenceExpander overrides", () => {
  const sync = berlinWeekly();
  // 28 October's occurrence moves to Tuesday 3 November, 15:00, for half an hour.
  const moved = timed("sync-moved", "2026-11-03T15:00", "Europe/Berlin", 30, {
    override: { recurrenceId: instant("2026-10-28T08:00:00Z"), seriesId: "sync" },
    title: "Sync (moved)",
  });

  test("replaces the occurrence it names, in its own week and in the week it moved to", () => {
    const expander = createOccurrenceExpander(adapters);
    const own = expander.expand([sync, moved], range("2026-10-26", "2026-11-02", "Europe/Berlin"));
    const next = expander.expand([sync, moved], range("2026-11-02", "2026-11-09", "Europe/Berlin"));

    // Overrides always pass through, so the snapshot finds them wherever they moved.
    expect(ids(own.occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(own.occurrences[0]?.event).toBe(moved);
    expect(ids(next.occurrences)).toEqual([
      "sync::2026-11-04T08:00:00Z",
      "sync::2026-10-28T08:00:00Z",
    ]);
    expect(next.occurrences[1]).toBe(own.occurrences[0]);
    expect(next.occurrences[1]).toMatchObject({
      event: moved,
      interval: moved,
      recurrence: { override: moved, series: sync, seriesId: "sync" },
    });
    expect(String(next.occurrences[1]?.recurrence?.recurrenceId)).toBe("2026-10-28T08:00:00Z");
    expect(own.issues).toEqual([]);

    // The snapshot only has the override, at its new time.
    const snapshot = createEventSnapshot(own.occurrences, occurrenceAdapter);
    expect(snapshot.events.map(({ start }) => String(start))).toEqual(["2026-11-03T14:00:00Z"]);
  });

  test("shows an occurrence moved into the range from outside it", () => {
    const early = timed("sync-early", "2026-11-05T09:00", "Europe/Berlin", 60, {
      override: { recurrenceId: instant("2026-11-11T08:00:00Z"), seriesId: "sync" },
    });
    const { occurrences } = expand([sync, early], range("2026-11-02", "2026-11-09"));
    expect(ids(occurrences)).toEqual(["sync::2026-11-04T08:00:00Z", "sync::2026-11-11T08:00:00Z"]);
  });

  test("hides the occurrence a cancelled override names, and the override itself", () => {
    const cancelled = { ...moved, override: { ...moved.override!, cancelled: true } };
    const { issues, occurrences } = expand([sync, cancelled], range("2026-10-19", "2026-11-09"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-21T07:00:00Z", "sync::2026-11-04T08:00:00Z"]);
    expect(issues).toEqual([]);
  });

  test("lets the later of two overrides for one occurrence win", () => {
    const again = { ...moved, id: "sync-moved-again", title: "Sync (moved again)" };
    const { issues, occurrences } = expand([moved, sync, again], range("2026-10-26", "2026-11-02"));

    expect(occurrences.map(({ event }) => event)).toEqual([again]);
    expect(issues).toEqual([
      {
        code: "duplicate-override",
        event: moved,
        eventId: "sync-moved",
        index: 0,
        message: expect.any(String),
      },
    ]);
  });

  test("keeps an override's ID while its series is missing, and reports it", () => {
    const expander = createOccurrenceExpander(adapters);
    const alone = expander.expand([moved], range("2026-11-02", "2026-11-09"));
    const loaded = expander.expand([moved, sync], range("2026-11-02", "2026-11-09"));

    expect(ids(alone.occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(alone.occurrences[0]?.recurrence).toEqual({
      override: moved,
      recurrenceId: moved.override?.recurrenceId,
      seriesId: "sync",
    });
    expect(alone.issues).toEqual([
      {
        code: "missing-series",
        event: moved,
        eventId: "sync-moved",
        index: 0,
        message: "No series has the ID sync.",
      },
    ]);
    // Once the master loads, the override keeps its ID and gains its series.
    expect(ids(loaded.occurrences)).toEqual([
      "sync::2026-10-28T08:00:00Z",
      "sync::2026-11-04T08:00:00Z",
    ]);
    expect(loaded.occurrences[0]?.recurrence?.series).toBe(sync);
  });

  test("reports an override's wall time on a timed series, and matches it on the series' clock", () => {
    const byWallTime = {
      ...moved,
      override: { recurrenceId: dateTime("2026-10-28T09:00"), seriesId: "sync" },
    };
    const { issues, occurrences } = expand([sync, byWallTime], range("2026-10-26", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(occurrences[0]?.event).toBe(byWallTime);
    expect(issues).toEqual([
      {
        code: "date-kind-mismatch",
        event: byWallTime,
        eventId: "sync-moved",
        index: 1,
        message: "recurrenceId isn't an Instant like its series' start; converted.",
      },
    ]);
  });

  test("shows an override whose recurrence ID can't take its series' kind on its own", () => {
    const byDate = { ...moved, override: { recurrenceId: date("2026-10-28"), seriesId: "sync" } };
    const { issues, occurrences } = expand([sync, byDate], range("2026-10-26", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-28T08:00:00Z", "sync::2026-10-28"]);
    expect(issues.map(({ code, event }) => [code, event])).toEqual([
      ["date-kind-mismatch", byDate],
    ]);
  });

  test("keeps the issues of an override a later one replaces", () => {
    const byWallTime = {
      ...moved,
      override: { recurrenceId: dateTime("2026-10-28T09:00"), seriesId: "sync" },
    };
    const { issues } = expand([byWallTime, sync, moved], range("2026-10-26", "2026-11-02"));

    expect(issues.map(({ code, index }) => [code, index])).toEqual([
      ["date-kind-mismatch", 0],
      ["duplicate-override", 0],
    ]);
  });

  test("keeps an override's ID when its series can't expand", () => {
    const byWallTime = {
      ...moved,
      override: { recurrenceId: dateTime("2026-10-28T09:00"), seriesId: "sync" },
    };
    const broken = { ...sync, recurrence: { exceptionDates: ["2026-10-28" as never] } };
    const healthy = expand([sync, byWallTime], range("2026-10-26", "2026-11-02"));
    const failing = expand([broken, byWallTime], range("2026-10-26", "2026-11-02"));

    expect(ids(failing.occurrences)).toEqual(ids(healthy.occurrences));
    expect(failing.issues.map(({ code }) => code)).toEqual(["invalid-rule", "date-kind-mismatch"]);
  });

  test("treats an event with both a recurrence and an override as an override", () => {
    const both = { ...moved, recurrence: { rule: { frequency: "DAILY" as const } } };
    const { issues, occurrences } = expand([sync, both], range("2026-10-26", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-28T08:00:00Z"]);
    expect(issues.map(({ code, index }) => [code, index])).toEqual([["conflicting-recurrence", 1]]);
  });
});

describe("createOccurrenceExpander output", () => {
  test("follows the input order, with one-off events under their own IDs", () => {
    const lunch = timed("lunch", "2026-10-22T12:00", "Europe/Berlin");
    const sync = berlinWeekly();
    const later = timed("later", "2027-03-01T12:00", "Europe/Berlin");
    const { occurrences } = expand([lunch, sync, later], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual([
      "lunch",
      "sync::2026-10-21T07:00:00Z",
      "sync::2026-10-28T08:00:00Z",
      "later",
    ]);
    expect(occurrences[0]).toEqual({ event: lunch, id: "lunch", interval: lunch });
  });

  test("gives core's snapshot no duplicate IDs", () => {
    const sync = berlinWeekly({ recurrenceDates: [instant("2026-10-28T08:00:00Z")] });
    const moved = timed("sync-moved", "2026-10-28T15:00", "Europe/Berlin", 30, {
      override: { recurrenceId: instant("2026-10-28T08:00:00Z"), seriesId: "sync" },
    });
    const lunch = timed("lunch", "2026-10-22T12:00", "Europe/Berlin");
    const { issues, occurrences } = expand(
      [sync, moved, lunch],
      range("2026-10-01", "2026-12-01", "America/New_York"),
    );
    const snapshot = createEventSnapshot(occurrences, occurrenceAdapter);

    expect(issues).toEqual([]);
    expect(snapshot.issues).toEqual([]);
    expect(snapshot.size).toBe(occurrences.length);
    expect(snapshot.get("sync::2026-10-28T08:00:00Z")?.event.event).toBe(moved);
  });

  test("keeps IDs unique, leaving out the later item that repeats one", () => {
    const numeric = { ...berlinWeekly(), id: 42 } as unknown as Event;
    const text = { ...berlinWeekly(), id: "42" };
    const copy = { ...text, title: "Copy" };
    // A one-off event whose ID is an occurrence's.
    const clash = timed("42::2026-10-28T08:00:00Z", "2026-10-29T12:00", "Europe/Berlin");
    const { issues, occurrences } = createOccurrenceExpander(
      adapters as unknown as RecurrenceAdapters<Event, string | number, string>,
    ).expand([clash, numeric, text, copy], range("2026-10-19", "2026-11-02"));

    expect(occurrences.map(({ event }) => event)).toEqual([clash, numeric]);
    expect(issues.map(({ code, event, index, message }) => [code, event, index, message])).toEqual([
      [
        "duplicate-event-id",
        numeric,
        1,
        "An earlier event has the ID 42::2026-10-28T08:00:00Z; left out.",
      ],
      [
        "duplicate-event-id",
        text,
        2,
        "An earlier event has the ID 42::2026-10-21T07:00:00Z, 42::2026-10-28T08:00:00Z; left out.",
      ],
      ["duplicate-event-id", copy, 3, "An earlier series has the ID 42; left out."],
    ]);
  });

  test("reports an adapter that throws and carries on", () => {
    const sync = berlinWeekly();
    const broken = timed("broken", "2026-10-22T12:00", "Europe/Berlin");
    const throwing: RecurrenceAdapters<Event, string, string> = {
      event: adapters.event,
      recurrence: {
        getRecurrence(event) {
          if (event === broken) throw new Error("no recurrence here");
          return event.recurrence;
        },
      },
    };
    const { issues, occurrences } = createOccurrenceExpander(throwing).expand(
      [broken, sync],
      range("2026-10-19", "2026-10-26"),
    );

    expect(ids(occurrences)).toEqual(["sync::2026-10-21T07:00:00Z"]);
    expect(issues).toEqual([
      {
        code: "adapter-error",
        event: broken,
        eventId: "broken",
        index: 0,
        message: "getRecurrence: no recurrence here",
      },
    ]);
  });

  test("stops a long rule at maxIterations with an issue", () => {
    const daily = timed("daily", "2026-01-01T09:00", "Europe/Berlin", 60, {
      recurrence: { rule: { count: 1000, frequency: "DAILY" } },
    });
    const { issues } = createOccurrenceExpander(adapters, { maxIterations: 10 }).expand(
      [daily],
      range("2026-06-01", "2026-06-08"),
    );
    expect(issues).toEqual([
      {
        code: "iteration-limit",
        event: daily,
        eventId: "daily",
        index: 0,
        message: "The rule stopped after 10 steps.",
      },
    ]);
  });

  test("reports a rule that can't expand, and still shows its first occurrence", () => {
    const broken = berlinWeekly({}, { count: 0 });
    const { issues, occurrences } = expand([broken], range("2026-10-19", "2026-11-02"));

    expect(ids(occurrences)).toEqual(["sync::2026-10-21T07:00:00Z"]);
    expect(issues.map(({ code }) => code)).toEqual(["invalid-rule"]);
  });
});
