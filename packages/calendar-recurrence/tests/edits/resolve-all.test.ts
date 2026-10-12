import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  occurrenceId,
  recurrenceEditScopes,
  recurrenceOverrideEdit,
  resolveRecurrenceEdit,
  type RecurrenceEdit,
  type RecurrenceRule,
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
  resize,
  timed,
  wall,
  type Event,
  type Occurrence,
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

/** Starts of the occurrences of `events`, on the Berlin wall clock, with their event IDs. */
function shown(events: readonly Event[], until?: Temporal.PlainDate): string[] {
  return expand(events, until).map(({ event, interval }) => `${wall(interval.start)} ${event.id}`);
}

// Weekly on Monday at 09:00 in Berlin, from 19 October 2026, across the end of DST on 25 October.
// 9 November doesn't happen, Wednesday 11 November is an extra date, and 16 November moved to 14:00.
const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
  recurrence: {
    exceptionDates: [at("2026-11-09T09:00")],
    recurrenceDates: [at("2026-11-11T09:00")],
    rule: { count: 6, frequency: "WEEKLY" },
  },
});
const moved = overrideOf(standup, "moved", at("2026-11-16T09:00"), {
  end: at("2026-11-16T15:00"),
  kind: "timed",
  sourceTimeZone: "Europe/Berlin",
  start: at("2026-11-16T14:00"),
});
const events = [standup, moved];

describe('"all"', () => {
  test("moves the series by the occurrence's delta on its own wall clock, across DST", () => {
    const occurrences = expand(events);
    const occurrence = find(occurrences, "2026-11-02T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1, hours: 1 }), "all", adapters, {
        occurrences,
      }),
    );

    expect(edit.scope).toBe("all");
    expect(edit.series).toMatchObject({ action: "update", eventId: "standup" });
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(wall(edit.series.placement.start)).toBe("2026-10-20T10:00:00");
    expect(wall(edit.series.placement.end)).toBe("2026-10-20T10:30:00");
    const { recurrence } = edit.series;
    expect(recurrence.rule).toEqual({ count: 6, frequency: "WEEKLY" });
    expect(recurrence.exceptionDates?.map((date) => wall(date))).toEqual(["2026-11-10T10:00:00"]);
    expect(recurrence.recurrenceDates?.map((date) => wall(date as Temporal.Instant))).toEqual([
      "2026-11-12T10:00:00",
    ]);

    // The override follows its occurrence and keeps its own placement.
    expect(edit.otherOverrides.action).toBe("rekey");
    const rekey = recurrenceOverrideEdit(edit, at("2026-11-16T09:00"));
    expect(rekey).toMatchObject({ action: "update", series: "current" });
    if (rekey.action === "update") expect(wall(rekey.recurrenceId)).toBe("2026-11-17T10:00:00");

    // Every loaded occurrence of the series gets its new ID.
    expect(edit.occurrenceIds.get(occurrence.id)).toBe(
      occurrenceId("standup", at("2026-11-03T10:00")),
    );
    expect(edit.occurrenceIds.get("standup::2026-10-26T08:00:00Z")).toBe(
      "standup::2026-10-27T09:00:00Z",
    );
    expect(edit.occurrenceIds.get("standup::2026-11-16T08:00:00Z")).toBe(
      "standup::2026-11-17T09:00:00Z",
    );

    const after = applyRecurrenceEdit(events, edit, { createId });
    expect(shown(after)).toEqual([
      "2026-10-20T10:00:00 standup",
      "2026-10-27T10:00:00 standup",
      "2026-11-03T10:00:00 standup",
      "2026-11-12T10:00:00 standup",
      "2026-11-24T10:00:00 standup",
      "2026-11-16T14:00:00 moved",
    ]);
    expect(after.find(({ id }) => id === "moved")?.override?.recurrenceId).toEqual(
      at("2026-11-17T10:00"),
    );
    // The IDs the edit announced are the ones the series now has.
    const ids = new Set(expand(after).map(({ id }) => id));
    for (const next of edit.occurrenceIds.values()) {
      if (next !== "standup::2026-11-10T09:00:00Z") expect(ids).toContain(next);
    }
  });

  test("measures the delta in the series' zone when the calendar shows another one", () => {
    const occurrence = find(expand(events), "2026-11-02T08:00:00Z");
    // 03:00 in New York; dragged to 20:00 there, which is 02:00 on Tuesday in Berlin.
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { hours: 17 }, "America/New_York"), "all", adapters),
    );
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(wall(edit.series.placement.start)).toBe("2026-10-20T02:00:00");
    expect(edit.series.placement).toMatchObject({ sourceTimeZone: "Europe/Berlin" });
    expect(shown(applyRecurrenceEdit(events, edit, { createId })).slice(0, 3)).toEqual([
      "2026-10-20T02:00:00 standup",
      "2026-10-27T02:00:00 standup",
      "2026-11-03T02:00:00 standup",
    ]);
  });

  test("moves BYDAY, and WKST when INTERVAL groups the days into weeks", () => {
    const rule: RecurrenceRule = {
      byDay: [{ weekday: "MO" }, { weekday: "FR" }, { weekday: "SU" }],
      count: 9,
      frequency: "WEEKLY",
      interval: 2,
    };
    const fortnightly = timed("fortnightly", "2026-10-19T09:00", "2026-10-19T10:00", {
      recurrence: { rule },
    });
    const before = shown([fortnightly]);
    const occurrence = find(expand([fortnightly]), "2026-11-06T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(move(occurrence, { days: 1 }), "all", adapters));
    expect(edit.series).toMatchObject({
      recurrence: {
        rule: {
          ...rule,
          byDay: [{ weekday: "TU" }, { weekday: "SA" }, { weekday: "MO" }],
          weekStart: "TU",
        },
      },
    });
    const after = shown(applyRecurrenceEdit([fortnightly], edit, { createId }));
    expect(after).toEqual(
      before.map((line) => {
        const [date, id] = line.split(" ");
        return `${Temporal.PlainDateTime.from(date!).add({ days: 1 }).toString()} ${id}`;
      }),
    );
  });

  test("an all-day series moves by days and rekeys its exception dates", () => {
    const daily = allDay("daily", "2026-10-19", "2026-10-20", {
      recurrence: {
        exceptionDates: [Temporal.PlainDate.from("2026-10-21")],
        rule: { count: 5, frequency: "DAILY" },
      },
    });
    const occurrence = find(expand([daily]), "2026-10-22");
    const edit = series(resolveRecurrenceEdit(move(occurrence, { days: 2 }), "all", adapters));
    expect(edit.series).toMatchObject({
      placement: {
        end: Temporal.PlainDate.from("2026-10-22"),
        kind: "all-day",
        start: Temporal.PlainDate.from("2026-10-21"),
      },
      recurrence: {
        exceptionDates: [Temporal.PlainDate.from("2026-10-23")],
        rule: { count: 5, frequency: "DAILY" },
      },
    });
    expect(edit.occurrenceIds.get("daily::2026-10-22")).toBe("daily::2026-10-24");
  });

  test("a floating series moves BYDAY with its wall time", () => {
    const evening = floating("evening", "2026-10-19T18:00", "2026-10-19T19:00", {
      recurrence: { rule: { byDay: [{ weekday: "MO" }], frequency: "WEEKLY" } },
    });
    const occurrence = find(expand([evening]), "2026-10-26T18:00:00");
    const edit = series(
      resolveRecurrenceEdit(move(occurrence, { days: 1, hours: 1, minutes: 30 }), "all", adapters),
    );
    expect(edit.series).toMatchObject({
      placement: {
        end: Temporal.PlainDateTime.from("2026-10-20T20:30"),
        start: Temporal.PlainDateTime.from("2026-10-20T19:30"),
      },
      recurrence: { rule: { byDay: [{ weekday: "TU" }], frequency: "WEEKLY" } },
    });
  });

  test("a resize changes the length and keeps every ID", () => {
    const occurrence = find(expand(events), "2026-11-02T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(resize(occurrence, "end", { minutes: 30 }), "all", adapters),
    );
    expect(edit.series).toMatchObject({
      placement: { end: at("2026-10-19T10:00"), start: at("2026-10-19T09:00") },
      recurrence: standup.recurrence,
    });
    expect(edit.otherOverrides.action).toBe("keep");
    expect(edit.occurrenceIds.size).toBe(0);
  });

  test("a resize updates DURATION when the series has one; a move keeps it", () => {
    const nominal = timed("nominal", "2026-10-19T09:00", "2026-10-19T10:00", {
      recurrence: { duration: Temporal.Duration.from("PT1H"), rule: { frequency: "WEEKLY" } },
    });
    const occurrence = find(expand([nominal]), "2026-11-02T08:00:00Z");
    const resized = series(
      resolveRecurrenceEdit(resize(occurrence, "start", { minutes: -30 }), "all", adapters),
    );
    expect(resized.series).toMatchObject({
      placement: { end: at("2026-10-19T10:00"), start: at("2026-10-19T08:30") },
    });
    if (resized.series.action !== "update") throw new Error("update expected");
    expect(resized.series.recurrence.duration?.toString()).toBe("PT1H30M");

    const moved = series(resolveRecurrenceEdit(move(occurrence, { hours: 3 }), "all", adapters));
    if (moved.series.action !== "update") throw new Error("update expected");
    expect(moved.series.recurrence.duration?.toString()).toBe("PT1H");
    expect(wall(moved.series.placement.end)).toBe("2026-10-19T13:00:00");
  });

  test("drops wallStart when the start moves, and writes one when it lands in a DST gap", () => {
    // Written at 02:30 on 29 March 2026, which Berlin skips: the first start is 03:30.
    const early = timed("early", "2026-03-29T02:30", "2026-03-29T03:00", {
      recurrence: {
        rule: { frequency: "DAILY" },
        wallStart: Temporal.PlainDateTime.from("2026-03-29T02:30"),
      },
    });
    const later = find(expand([early]), "2026-04-01T00:30:00Z");
    const edit = series(resolveRecurrenceEdit(move(later, { hours: -1 }), "all", adapters));
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(wall(edit.series.placement.start)).toBe("2026-03-29T01:30:00");
    expect(edit.series.recurrence.wallStart).toBeUndefined();

    const night = timed("night", "2026-03-29T01:30", "2026-03-29T02:00", {
      recurrence: { rule: { frequency: "DAILY" } },
    });
    const nightly = find(expand([night]), "2026-04-01T23:30:00Z");
    const gap = series(resolveRecurrenceEdit(move(nightly, { hours: 1 }), "all", adapters));
    if (gap.series.action !== "update") throw new Error("update expected");
    expect(wall(gap.series.placement.start)).toBe("2026-03-29T03:30:00");
    expect(gap.series.recurrence.wallStart?.toString()).toBe("2026-03-29T02:30:00");
    expect(
      shown(applyRecurrenceEdit([night], gap, { createId }), Temporal.PlainDate.from("2026-04-02")),
    ).toEqual([
      "2026-03-29T03:30:00 night",
      "2026-03-30T02:30:00 night",
      "2026-03-31T02:30:00 night",
      "2026-04-01T02:30:00 night",
    ]);
  });

  test("an occurrence moved onto a day makes the series all-day", () => {
    const occurrence = find(expand(events), "2026-11-02T08:00:00Z");
    const proposed = {
      end: Temporal.PlainDate.from("2026-11-04"),
      kind: "all-day" as const,
      start: Temporal.PlainDate.from("2026-11-03"),
    };
    const edit = series(
      resolveRecurrenceEdit(change(occurrence, "move", proposed), "all", adapters),
    );
    expect(edit.series).toMatchObject({
      placement: {
        end: Temporal.PlainDate.from("2026-10-21"),
        kind: "all-day",
        start: Temporal.PlainDate.from("2026-10-20"),
      },
      recurrence: {
        exceptionDates: [Temporal.PlainDate.from("2026-11-10")],
        recurrenceDates: [Temporal.PlainDate.from("2026-11-12")],
        rule: { count: 6, frequency: "WEEKLY" },
      },
    });
    expect(recurrenceOverrideEdit(edit, at("2026-11-16T09:00"))).toEqual({
      action: "update",
      recurrenceId: Temporal.PlainDate.from("2026-11-17"),
      series: "current",
    });
    expect(edit.occurrenceIds.get(occurrence.id)).toBe("standup::2026-11-03");
  });

  test("an all-day occurrence moved onto a time makes the series timed", () => {
    const daily = allDay("daily", "2026-10-19", "2026-10-20", {
      recurrence: {
        exceptionDates: [Temporal.PlainDate.from("2026-10-21")],
        rule: { frequency: "DAILY", until: Temporal.PlainDate.from("2026-10-25") },
      },
    });
    const occurrence = find(expand([daily]), "2026-10-22");
    const proposed = {
      end: at("2026-10-22T11:00"),
      kind: "timed" as const,
      sourceTimeZone: "Europe/Berlin",
      start: at("2026-10-22T10:00"),
    };
    const edit = series(
      resolveRecurrenceEdit(change(occurrence, "move", proposed), "all", adapters),
    );
    if (edit.series.action !== "update") throw new Error("update expected");
    expect(edit.series.placement).toEqual({
      end: at("2026-10-19T11:00"),
      kind: "timed",
      resourceIds: [],
      sourceTimeZone: "Europe/Berlin",
      start: at("2026-10-19T10:00"),
    });
    expect(edit.series.recurrence.exceptionDates).toEqual([at("2026-10-21T10:00")]);
    expect(wall(edit.series.recurrence.rule?.until)).toBe("2026-10-25");
    expect(shown(applyRecurrenceEdit([daily], edit, { createId }))).toEqual([
      "2026-10-19T10:00:00 daily",
      "2026-10-20T10:00:00 daily",
      "2026-10-22T10:00:00 daily",
      "2026-10-23T10:00:00 daily",
      "2026-10-24T10:00:00 daily",
      "2026-10-25T10:00:00 daily",
    ]);
  });

  test("a delete removes the master and every override", () => {
    const occurrence = find(expand(events), "2026-11-16T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(change(occurrence, "delete"), "all", adapters));
    expect(edit.series).toEqual({ action: "delete", event: standup, eventId: "standup" });
    expect(edit.override).toEqual({ action: "delete", event: moved, eventId: "moved" });
    expect(
      applyRecurrenceEdit(
        [...events, overrideOf(standup, "other", at("2026-10-26T09:00"), standup)],
        edit,
        { createId },
      ),
    ).toEqual([]);
  });

  test("an overridden occurrence changes the series by what the user did to it", () => {
    // 16 November was moved to 14:00; dragging it a day later moves the series a day, at 09:00.
    const occurrence = find(expand(events), "2026-11-16T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(move(occurrence, { days: 1 }), "all", adapters));
    expect(edit.override).toMatchObject({
      action: "update",
      eventId: "moved",
      placement: { start: at("2026-11-17T14:00") },
      recurrenceId: at("2026-11-17T09:00"),
    });
    expect(edit.series).toMatchObject({ placement: { start: at("2026-10-20T09:00") } });
    expect(shown(applyRecurrenceEdit(events, edit, { createId }))).toEqual([
      "2026-10-20T09:00:00 standup",
      "2026-10-27T09:00:00 standup",
      "2026-11-03T09:00:00 standup",
      "2026-11-12T09:00:00 standup",
      "2026-11-24T09:00:00 standup",
      "2026-11-17T14:00:00 moved",
    ]);

    // Stretching it by half an hour stretches the series by half an hour, where it is.
    const stretched = series(
      resolveRecurrenceEdit(resize(occurrence, "end", { minutes: 30 }), "all", adapters),
    );
    expect(stretched.series).toMatchObject({
      placement: { end: at("2026-10-19T10:00"), start: at("2026-10-19T09:00") },
    });
    expect(stretched.otherOverrides.action).toBe("keep");
  });
});

describe('"all" on rules that can\'t move', () => {
  test("a BYSETPOS rule can't move to another day, so only this occurrence can", () => {
    const rule: RecurrenceRule = {
      byDay: [{ weekday: "MO" }, { weekday: "WE" }, { weekday: "FR" }],
      bySetPosition: [-1],
      frequency: "MONTHLY",
    };
    const master = timed("payday", "2026-10-30T09:00", "2026-10-30T10:00", {
      recurrence: { rule },
    });
    // The baseline engine can't expand this rule, so the occurrence is built by hand.
    const recurrenceId = at("2026-11-30T09:00");
    const occurrence: Occurrence = {
      event: master,
      id: occurrenceId("payday", recurrenceId),
      interval: {
        end: at("2026-11-30T10:00"),
        kind: "timed",
        sourceTimeZone: "Europe/Berlin",
        start: recurrenceId,
      },
      recurrence: { recurrenceId, series: master, seriesId: "payday" },
    };
    const moved = move(occurrence, { days: -1 });
    expect(resolveRecurrenceEdit(moved, "all", adapters)).toMatchObject({
      reason: "rule-cannot-move",
      type: "rejected",
    });
    expect(recurrenceEditScopes(moved, adapters)).toEqual(["this"]);
  });
});
