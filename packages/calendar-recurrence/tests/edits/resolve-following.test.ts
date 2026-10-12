import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  recurrenceEditScopes,
  recurrenceOverrideEdit,
  resolveRecurrenceEdit,
  type RecurrenceEdit,
  type RecurrenceSeriesEdit,
} from "../../src";
import {
  adapters,
  allDay,
  at,
  change,
  expand,
  find,
  floating,
  move,
  overrideOf,
  timed,
  wall,
  type Event,
} from "./harness";

function series(
  edit: RecurrenceEdit<Event, string, string>,
): RecurrenceSeriesEdit<Event, string, string> {
  if (edit.type !== "series")
    throw new Error(`Expected a series edit, got ${JSON.stringify(edit)}`);
  return edit;
}

let created = 0;
const createId = () => `created-${++created}`;

function shown(events: readonly Event[], until?: Temporal.PlainDate): string[] {
  return expand(events, until).map(({ event, interval }) => `${wall(interval.start)} ${event.id}`);
}

// Weekly on Monday at 09:00 in Berlin from 19 October 2026, across the end of DST on 25 October.
// 26 October and 16 November don't happen; Wednesdays 21 October and 11 November are extra dates;
// 2 November moved to 15:00 and 23 November to 14:00.
const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
  recurrence: {
    exceptionDates: [at("2026-10-26T09:00"), at("2026-11-16T09:00")],
    recurrenceDates: [at("2026-10-21T09:00"), at("2026-11-11T09:00")],
    rule: { frequency: "WEEKLY", until: at("2026-12-14T09:00") },
  },
});
const early = overrideOf(standup, "early", at("2026-11-02T09:00"), {
  end: at("2026-11-02T16:00"),
  kind: "timed",
  sourceTimeZone: "Europe/Berlin",
  start: at("2026-11-02T15:00"),
});
const late = overrideOf(standup, "late", at("2026-11-23T09:00"), {
  end: at("2026-11-23T15:00"),
  kind: "timed",
  sourceTimeZone: "Europe/Berlin",
  start: at("2026-11-23T14:00"),
});
const events = [standup, early, late];

describe('"following"', () => {
  test("ends the series before the occurrence and starts a new one where it went", () => {
    const occurrences = expand(events);
    const occurrence = find(occurrences, "2026-11-09T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1, hours: 1 }), "following", adapters, {
        newSeriesId: "standup-2",
        occurrences,
      }),
    );
    expect(edit.scope).toBe("following");

    // The old series ends at the previous occurrence, keeping its earlier dates.
    expect(edit.series).toMatchObject({ action: "update", eventId: "standup" });
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(edit.series.recurrence).toEqual({
      exceptionDates: [at("2026-10-26T09:00")],
      recurrenceDates: [at("2026-10-21T09:00")],
      rule: { frequency: "WEEKLY", until: at("2026-11-02T09:00") },
    });
    expect(edit.series.placement.start).toEqual(standup.start);

    // The new series takes the rest, moved a day and an hour on Berlin's wall clock.
    expect(edit.newSeries).toEqual({
      from: standup,
      id: "standup-2",
      placement: {
        end: at("2026-11-10T10:30"),
        kind: "timed",
        resourceIds: [],
        sourceTimeZone: "Europe/Berlin",
        start: at("2026-11-10T10:00"),
      },
      recurrence: {
        exceptionDates: [at("2026-11-17T10:00")],
        recurrenceDates: [at("2026-11-12T10:00")],
        rule: { frequency: "WEEKLY", until: at("2026-12-15T10:00") },
      },
    });

    // Later overrides move to the new series; earlier ones stay.
    expect(recurrenceOverrideEdit(edit, at("2026-11-02T09:00"))).toEqual({ action: "keep" });
    expect(recurrenceOverrideEdit(edit, at("2026-11-23T09:00"))).toEqual({
      action: "update",
      recurrenceId: at("2026-11-24T10:00"),
      series: "new",
    });

    expect(edit.occurrenceIds.get(occurrence.id)).toBe("standup-2::2026-11-10T09:00:00Z");
    expect(edit.occurrenceIds.get("standup::2026-11-30T08:00:00Z")).toBe(
      "standup-2::2026-12-01T09:00:00Z",
    );
    expect(edit.occurrenceIds.has("standup::2026-10-19T07:00:00Z")).toBe(false);

    const after = applyRecurrenceEdit(events, edit, { createId });
    expect(shown(after)).toEqual([
      "2026-10-19T09:00:00 standup",
      "2026-10-21T09:00:00 standup",
      "2026-11-02T15:00:00 early",
      "2026-11-23T14:00:00 late",
      "2026-11-10T10:00:00 standup-2",
      "2026-11-12T10:00:00 standup-2",
      "2026-12-01T10:00:00 standup-2",
      "2026-12-08T10:00:00 standup-2",
      "2026-12-15T10:00:00 standup-2",
    ]);
    expect(after.find(({ id }) => id === "late")?.override).toEqual({
      recurrenceId: at("2026-11-24T10:00"),
      seriesId: "standup-2",
    });
    const ids = new Set(expand(after).map(({ id }) => id));
    for (const next of edit.occurrenceIds.values()) {
      if (!String(next).includes("2026-11-17")) expect(ids).toContain(next);
    }
  });

  test("recomputes COUNT, counting the occurrences an EXDATE removes", () => {
    const counted = timed("counted", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: {
        exceptionDates: [at("2026-10-26T09:00")],
        rule: { count: 6, frequency: "WEEKLY" },
      },
    });
    const occurrence = find(expand([counted]), "2026-11-09T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { hours: 2 }), "following", adapters),
    );
    expect(edit.series).toMatchObject({
      recurrence: {
        exceptionDates: [at("2026-10-26T09:00")],
        rule: { count: 3, frequency: "WEEKLY" },
      },
    });
    expect(edit.newSeries?.recurrence).toEqual({ rule: { count: 3, frequency: "WEEKLY" } });
    const after = applyRecurrenceEdit([counted], edit, { createId });
    expect(shown(after).map((line) => line.split(" ")[0])).toEqual([
      "2026-10-19T09:00:00",
      "2026-11-02T09:00:00",
      "2026-11-09T11:00:00",
      "2026-11-16T11:00:00",
      "2026-11-23T11:00:00",
    ]);
  });

  test("with COUNT and UNTIL, the old series ends by UNTIL and the new one keeps both", () => {
    const both = timed("both", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: { rule: { count: 10, frequency: "WEEKLY", until: at("2026-11-30T09:00") } },
    });
    const occurrence = find(expand([both]), "2026-11-02T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1 }), "following", adapters),
    );
    expect(edit.series).toMatchObject({
      recurrence: { rule: { frequency: "WEEKLY", until: at("2026-10-26T09:00") } },
    });
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(edit.series.recurrence.rule?.count).toBeUndefined();
    expect(edit.newSeries?.recurrence.rule).toEqual({
      count: 8,
      frequency: "WEEKLY",
      until: at("2026-12-01T09:00"),
    });
  });

  test('on the first occurrence it is "all", and so when nothing before it is left', () => {
    const first = find(expand(events), "2026-10-19T07:00:00Z");
    expect(
      series(resolveRecurrenceEdit(move(first, { hours: 1 }), "following", adapters)).scope,
    ).toBe("all");
    expect(recurrenceEditScopes(move(first, { hours: 1 }), adapters)).toEqual(["this", "all"]);

    const second = timed("second", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: { exceptionDates: [at("2026-10-19T09:00")], rule: { frequency: "WEEKLY" } },
    });
    const occurrence = find(expand([second]), "2026-10-26T08:00:00Z");
    expect(
      series(resolveRecurrenceEdit(move(occurrence, { hours: 1 }), "following", adapters)).scope,
    ).toBe("all");
  });

  test("a delete only ends the series and drops what came after", () => {
    const occurrence = find(expand(events), "2026-11-09T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(change(occurrence, "delete"), "following", adapters));
    expect(edit.newSeries).toBeUndefined();
    expect(edit.series).toMatchObject({
      recurrence: {
        exceptionDates: [at("2026-10-26T09:00")],
        recurrenceDates: [at("2026-10-21T09:00")],
        rule: { frequency: "WEEKLY", until: at("2026-11-02T09:00") },
      },
    });
    expect(recurrenceOverrideEdit(edit, at("2026-11-23T09:00"))).toEqual({ action: "delete" });
    expect(recurrenceOverrideEdit(edit, at("2026-11-02T09:00"))).toEqual({ action: "keep" });
    expect(shown(applyRecurrenceEdit(events, edit, { createId }))).toEqual([
      "2026-10-19T09:00:00 standup",
      "2026-10-21T09:00:00 standup",
      "2026-11-02T15:00:00 early",
    ]);
  });

  test("an overridden occurrence's override moves to the new series, which moves as it did", () => {
    // 23 November was moved to 14:00; dragging it an hour earlier starts a series at 08:00.
    const occurrence = find(expand(events), "2026-11-23T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { hours: -1 }), "following", adapters),
    );
    expect(edit.override).toEqual({
      action: "update",
      event: late,
      eventId: "late",
      placement: {
        end: at("2026-11-23T14:00"),
        kind: "timed",
        resourceIds: [],
        sourceTimeZone: "Europe/Berlin",
        start: at("2026-11-23T13:00"),
      },
      recurrenceId: at("2026-11-23T08:00"),
      series: "new",
    });
    // A move keeps the series' half hour, though the override is an hour long.
    expect(edit.newSeries?.placement).toMatchObject({
      end: at("2026-11-23T08:30"),
      start: at("2026-11-23T08:00"),
    });
  });

  test("an occurrence only an RDATE adds can't start a new series", () => {
    const occurrence = find(expand(events), "2026-11-11T08:00:00Z");
    expect(
      resolveRecurrenceEdit(move(occurrence, { hours: 1 }), "following", adapters),
    ).toMatchObject({ reason: "extra-occurrence", type: "rejected" });
    expect(recurrenceEditScopes(move(occurrence, { hours: 1 }), adapters)).toEqual(["this", "all"]);
  });

  test("a series without a rule splits its RDATEs", () => {
    const visits = allDay("visits", "2026-10-19", "2026-10-20", {
      recurrence: {
        recurrenceDates: ["2026-11-02", "2026-11-16", "2026-11-30"].map((date) =>
          Temporal.PlainDate.from(date),
        ),
      },
    });
    const occurrence = find(expand([visits]), "2026-11-16");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1 }), "following", adapters),
    );
    expect(edit.series).toMatchObject({
      recurrence: { recurrenceDates: [Temporal.PlainDate.from("2026-11-02")] },
    });
    expect(edit.newSeries).toMatchObject({
      placement: { start: Temporal.PlainDate.from("2026-11-17") },
      recurrence: { recurrenceDates: [Temporal.PlainDate.from("2026-12-01")] },
    });
  });

  test("RDATE periods keep their length, and whole-day EXDATEs stay whole days", () => {
    const period = {
      end: at("2026-11-11T12:00"),
      start: at("2026-11-11T09:00"),
    };
    const weekly = timed("weekly", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: {
        exceptionDates: [Temporal.PlainDate.from("2026-11-16")],
        recurrenceDates: [period],
        rule: { frequency: "WEEKLY" },
      },
    });
    const occurrence = find(expand([weekly]), "2026-11-09T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1 }), "following", adapters),
    );
    expect(edit.newSeries?.recurrence).toEqual({
      exceptionDates: [Temporal.PlainDate.from("2026-11-17")],
      recurrenceDates: [{ end: at("2026-11-12T12:00"), start: at("2026-11-12T09:00") }],
      rule: { frequency: "WEEKLY" },
    });
  });

  test("all-day and floating series split in their own time", () => {
    const daily = allDay("daily", "2026-10-19", "2026-10-20", {
      recurrence: { rule: { count: 10, frequency: "DAILY" } },
    });
    const dailyEdit = series(
      resolveRecurrenceEdit(
        move(find(expand([daily]), "2026-10-23"), { days: 2 }),
        "following",
        adapters,
      ),
    );
    expect(dailyEdit.series).toMatchObject({ recurrence: { rule: { count: 4 } } });
    expect(dailyEdit.newSeries).toMatchObject({
      placement: {
        end: Temporal.PlainDate.from("2026-10-26"),
        start: Temporal.PlainDate.from("2026-10-25"),
      },
      recurrence: { rule: { count: 6, frequency: "DAILY" } },
    });

    const evening = floating("evening", "2026-10-19T18:00", "2026-10-19T19:00", {
      recurrence: { rule: { byDay: [{ weekday: "MO" }, { weekday: "TH" }], frequency: "WEEKLY" } },
    });
    const eveningEdit = series(
      resolveRecurrenceEdit(
        move(find(expand([evening]), "2026-10-26T18:00:00"), { days: 1 }),
        "following",
        adapters,
      ),
    );
    expect(eveningEdit.series).toMatchObject({
      recurrence: { rule: { until: Temporal.PlainDateTime.from("2026-10-22T18:00") } },
    });
    expect(eveningEdit.newSeries).toMatchObject({
      placement: { start: Temporal.PlainDateTime.from("2026-10-27T18:00") },
      recurrence: { rule: { byDay: [{ weekday: "TU" }, { weekday: "FR" }], frequency: "WEEKLY" } },
    });
  });

  test("a later DST change doesn't move the new series off its wall time", () => {
    // In New York, which leaves DST on 1 November, after Berlin.
    const call = timed(
      "call",
      "2026-10-05T09:00",
      "2026-10-05T10:00",
      { recurrence: { rule: { frequency: "WEEKLY" } } },
      "America/New_York",
    );
    const occurrence = find(expand([call]), "2026-10-19T13:00:00Z");
    // Dragged in a Berlin calendar, an hour later.
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { hours: 1 }), "following", adapters),
    );
    const after = applyRecurrenceEdit([call], edit, { createId });
    expect(
      expand(after, Temporal.PlainDate.from("2026-11-10")).map(
        ({ interval }) => `${wall(interval.start, "America/New_York")}`,
      ),
    ).toEqual([
      "2026-10-05T09:00:00",
      "2026-10-12T09:00:00",
      "2026-10-19T10:00:00",
      "2026-10-26T10:00:00",
      "2026-11-02T10:00:00",
      "2026-11-09T10:00:00",
    ]);
  });
});
