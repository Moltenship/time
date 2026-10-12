// Regressions from the adversarial review of the edit semantics: DST gaps, UNTIL on a kind
// change, moved overrides, month days, and round trips that must keep the occurrence set.
import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  occurrenceId,
  recurrenceEditScopes,
  resolveRecurrenceEdit,
  type RecurrenceEdit,
  type RecurrenceSeriesEdit,
} from "../../src";
import { shiftRule } from "../../src/edits/rule-shift";
import {
  adapters,
  allDay,
  at,
  berlin,
  change,
  expand,
  find,
  move,
  overrideOf,
  resize,
  timed,
  wall,
  type Change,
  type Event,
  type Occurrence,
} from "./harness";

type SeriesEdit = RecurrenceSeriesEdit<Event, string, string>;

function series(edit: RecurrenceEdit<Event, string, string>): SeriesEdit {
  if (edit.type !== "series")
    throw new Error(`Expected a series edit, got ${JSON.stringify(edit)}`);
  return edit;
}

function master(edit: SeriesEdit) {
  if (edit.series.action !== "update")
    throw new Error(`Expected a master update, got ${edit.series.action}`);
  return edit.series;
}

let counter = 0;
function apply(events: readonly Event[], edit: RecurrenceEdit<Event, string, string>): Event[] {
  return applyRecurrenceEdit(events, series(edit), { createId: () => `created-${++counter}` });
}

function walls(occurrences: readonly Occurrence[], timeZone = berlin): string[] {
  return occurrences.map((occurrence) => wall(occurrence.interval.start, timeZone));
}

/** An occurrence the baseline engine can't expand (MONTHLY, YEARLY), built by hand. */
function occurrenceOf(event: Event, recurrenceId: Temporal.Instant): Occurrence {
  const length = (event.start as Temporal.Instant).until(event.end as Temporal.Instant);
  const zone = (event as { sourceTimeZone?: string }).sourceTimeZone;
  return {
    event,
    id: occurrenceId(event.id, recurrenceId),
    interval: {
      end: recurrenceId.add(length),
      kind: "timed",
      ...(zone === undefined ? {} : { sourceTimeZone: zone }),
      start: recurrenceId,
    },
    recurrence: { recurrenceId, series: event, seriesId: event.id },
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    if (
      !(value as object).constructor?.name?.startsWith("Temporal") &&
      !("epochNanoseconds" in (value as object))
    ) {
      for (const key of Object.keys(value as object))
        deepFreeze((value as Record<string, unknown>)[key]);
      Object.freeze(value);
    }
  }
  return value;
}

/**
 * "all" round-trip invariants: same number of occurrences, every old ID maps to an occurrence
 * that exists, the dragged occurrence lands at the proposed start, other generated occurrences
 * move by `delta` on the Berlin wall clock, overrides stay put. Returns the problems found.
 */
function allRoundTrip(
  events: readonly Event[],
  edited: Change,
  delta: Temporal.DurationLike,
): string[] {
  const before = expand(events);
  const edit = series(resolveRecurrenceEdit(edited, "all", adapters, { occurrences: before }));
  const after = expand(apply(events, edit));
  const byId = new Map(after.map((occurrence) => [occurrence.id, occurrence]));
  const problems: string[] = [];
  if (after.length !== before.length) problems.push(`count ${before.length} -> ${after.length}`);
  for (const occurrence of before) {
    const nextId = String(edit.occurrenceIds.get(occurrence.id) ?? occurrence.id);
    const next = byId.get(nextId);
    if (next === undefined) {
      problems.push(`${occurrence.id} -> ${nextId}: missing after the edit`);
      continue;
    }
    const expected =
      occurrence.id === edited.eventId && edited.cause !== "delete"
        ? wall(edited.proposed.start)
        : occurrence.recurrence?.override !== undefined
          ? wall(occurrence.interval.start)
          : Temporal.PlainDateTime.from(wall(occurrence.interval.start)).add(delta).toString();
    const actual = wall(next.interval.start);
    if (actual !== expected) problems.push(`${occurrence.id}: expected ${expected}, got ${actual}`);
  }
  return problems;
}

describe(`occurrenceIds`, () => {
  const a = timed("a", "2026-10-19T09:00", "2026-10-19T09:30", {
    recurrence: { rule: { count: 4, frequency: "WEEKLY" } },
  });
  const b = timed("b", "2026-10-19T09:00", "2026-10-19T09:30", {
    recurrence: { rule: { count: 4, frequency: "WEEKLY" } },
  });

  test(`"all" maps only the edited series' occurrences`, () => {
    const occurrences = expand([a, b]);
    const moved = move(find(occurrences, "a::2026-10-26T08:00:00Z"), { hours: 1 });
    const edit = series(resolveRecurrenceEdit(moved, "all", adapters, { occurrences }));
    const foreign = [...edit.occurrenceIds].filter(([from]) => String(from).startsWith("b::"));
    // Expected: no entry for series b. Actual: b::<key> -> a::<key + 1h> for every b occurrence.
    expect(foreign).toEqual([]);
  });

  test(`"following" maps only the edited series' later occurrences into the new one`, () => {
    const occurrences = expand([a, b]);
    const moved = move(find(occurrences, "a::2026-11-02T08:00:00Z"), { hours: 1 });
    const edit = series(
      resolveRecurrenceEdit(moved, "following", adapters, { newSeriesId: "a2", occurrences }),
    );
    const foreign = [...edit.occurrenceIds].filter(([from]) => String(from).startsWith("b::"));
    expect(foreign).toEqual([]);
  });
});

describe(`a DST gap: starts read back to the series' written time`, () => {
  // Daily at 02:30 Berlin. 29 March 2026 02:30 doesn't exist, so that occurrence is 03:30 CEST.
  const gap = timed("gap", "2026-03-26T02:30", "2026-03-26T03:00", {
    recurrence: { rule: { count: 8, frequency: "DAILY" } },
  });
  const expectedAfter = [
    "2026-03-26T02:30:00",
    "2026-03-27T02:30:00",
    "2026-03-28T02:30:00",
    "2026-03-29T03:30:00",
    "2026-03-30T02:30:00",
    "2026-03-31T02:30:00",
    "2026-04-01T02:30:00",
    "2026-04-02T02:30:00",
  ];

  test(`"all" resizing the gap-day occurrence's end leaves the series at its written time`, () => {
    const occurrences = expand([gap]);
    const gapDay = find(occurrences, "2026-03-29T01:30:00Z");
    expect(wall(gapDay.interval.start)).toBe("2026-03-29T03:30:00");
    const resized = resize(gapDay, "end", { minutes: 30 });
    expect(resized.cause !== "delete" && resized.proposed.start).toEqual(gapDay.interval.start);

    const edit = series(resolveRecurrenceEdit(resized, "all", adapters));
    expect(wall(master(edit).placement.start)).toBe("2026-03-26T02:30:00");
    expect(walls(expand(apply([gap], edit)))).toEqual(expectedAfter);
  });

  test(`"all" resizing a first occurrence written in the gap keeps wallStart`, () => {
    const first = timed("first", "2026-03-29T02:30", "2026-03-29T04:00", {
      recurrence: {
        rule: { count: 3, frequency: "DAILY" },
        wallStart: Temporal.PlainDateTime.from("2026-03-29T02:30"),
      },
    });
    const occurrences = expand([first]);
    expect(walls(occurrences)).toEqual([
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
    ]);
    const edit = series(
      resolveRecurrenceEdit(resize(occurrences[0]!, "end", { minutes: 30 }), "all", adapters),
    );
    expect(walls(expand(apply([first], edit)))).toEqual([
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
    ]);
  });

  test(`"following" from the gap-day occurrence keeps later ones at the written time`, () => {
    const occurrences = expand([gap]);
    const gapDay = find(occurrences, "2026-03-29T01:30:00Z");
    const updated = change(gapDay, "update", gapDay.interval);
    const edit = series(resolveRecurrenceEdit(updated, "following", adapters));
    expect(walls(expand(apply([gap], edit))).sort()).toEqual(expectedAfter);
  });

  test(`"all" dragging a 02:30 occurrence onto the spring-forward day moves the series by one day`, () => {
    const occurrences = expand([gap]);
    const dragged = move(find(occurrences, "2026-03-28T01:30:00Z"), { days: 1 });
    // The calendar resolves 29 March 02:30 forward, as the series itself does.
    expect(dragged.cause !== "delete" && wall(dragged.proposed.start)).toBe("2026-03-29T03:30:00");
    const edit = series(resolveRecurrenceEdit(dragged, "all", adapters));
    // Moving by one day at 02:30 also puts the dragged occurrence exactly at the proposed 03:30.
    expect(wall(master(edit).placement.start)).toBe("2026-03-27T02:30:00");
    expect(walls(expand(apply([gap], edit)))).toEqual([
      "2026-03-27T02:30:00",
      "2026-03-28T02:30:00",
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
      "2026-04-01T02:30:00",
      "2026-04-02T02:30:00",
      "2026-04-03T02:30:00",
    ]);
  });
});

describe(`a DST gap with "following"`, () => {
  test(`"following" dragged onto the spring-forward day starts a 02:30 series`, () => {
    const gap = timed("gap", "2026-03-24T02:30", "2026-03-24T03:00", {
      recurrence: { rule: { count: 8, frequency: "DAILY" } },
    });
    const dragged = move(find(expand([gap]), "2026-03-28T01:30:00Z"), { days: 1 });
    const edit = series(resolveRecurrenceEdit(dragged, "following", adapters));
    // Old: 24..27 March. New: from 29 March (03:30 by the gap), then 02:30 again.
    expect(walls(expand(apply([gap], edit))).sort()).toEqual([
      "2026-03-24T02:30:00",
      "2026-03-25T02:30:00",
      "2026-03-26T02:30:00",
      "2026-03-27T02:30:00",
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
      "2026-04-01T02:30:00",
    ]);
  });
});

describe(`timed to all-day: an UNTIL earlier in the day than the occurrences`, () => {
  // Weekly Monday 09:00 Berlin; UNTIL 28 Dec 00:00Z (01:00 Berlin) ends the series on 21 Dec.
  const weekly = timed("weekly", "2026-10-19T09:00", "2026-10-19T10:00", {
    recurrence: {
      rule: { frequency: "WEEKLY", until: Temporal.Instant.from("2026-12-28T00:00:00Z") },
    },
  });
  const toAllDay = (occurrence: Occurrence) =>
    change(occurrence, "move", {
      end: Temporal.PlainDate.from(wall(occurrence.interval.start).slice(0, 10)).add({ days: 1 }),
      kind: "all-day",
      start: Temporal.PlainDate.from(wall(occurrence.interval.start).slice(0, 10)),
    });

  test(`"all" to all-day keeps an UNTIL that fell before the day's occurrence`, () => {
    const before = expand([weekly]);
    expect(before).toHaveLength(10);
    const edit = series(
      resolveRecurrenceEdit(toAllDay(find(before, "2026-10-26T08:00:00Z")), "all", adapters),
    );
    expect(master(edit).recurrence.rule?.until?.toString()).toBe("2026-12-27");
    expect(expand(apply([weekly], edit))).toHaveLength(10);
  });

  test(`"following" to all-day keeps the same last occurrence`, () => {
    const before = expand([weekly]);
    const edit = series(
      resolveRecurrenceEdit(toAllDay(find(before, "2026-11-02T08:00:00Z")), "following", adapters),
    );
    expect(expand(apply([weekly], edit))).toHaveLength(10);
  });
});

const shiftBy = (days: number, from: string) => ({
  days,
  firstAfter: Temporal.PlainDateTime.from(from).add({ days }),
  firstBefore: Temporal.PlainDateTime.from(from),
  time: new Temporal.Duration(),
  toAllDay: false,
});

describe(`judgment calls`, () => {
  const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
    recurrence: { rule: { count: 6, frequency: "WEEKLY" } },
  });

  test(`"all" resizing a moved override changes the series' length, not its time`, () => {
    // 26 Oct (Mon 09:00) was moved to Tue 27 Oct 14:00. The user only stretches its end.
    const moved = overrideOf(standup, "moved", at("2026-10-26T09:00"), {
      end: at("2026-10-27T14:30"),
      kind: "timed",
      start: at("2026-10-27T14:00"),
    });
    const occurrence = find(expand([standup, moved]), "2026-10-26T08:00:00Z");
    const edit = series(
      resolveRecurrenceEdit(resize(occurrence, "end", { minutes: 30 }), "all", adapters),
    );
    // Expected (arguably): the series stays on Monday 09:00 and only its length changes.
    // Actual: delta measured from recurrenceId (Mon 09:00) to Tue 14:00 -> every Monday becomes Tue 14:00.
    expect(wall(master(edit).placement.start)).toBe("2026-10-19T09:00:00");
  });

  test(`BYMONTHDAY=28 can't move to the 29th, which February lacks`, () => {
    const shifted = shiftRule(
      { byMonthDay: [28], frequency: "MONTHLY" },
      shiftBy(1, "2026-10-28T09:00"),
    );
    expect(shifted).toHaveProperty("problem");
  });

  test(`a yearly 31 January can't move to 1 February (left to the rule editor)`, () => {
    const shifted = shiftRule(
      { byMonth: [1], byMonthDay: [31], frequency: "YEARLY" },
      shiftBy(1, "2026-01-31T09:00"),
    );
    expect(shifted).toHaveProperty("problem");
  });

  test(`"following" can delete from an RDATE occurrence`, () => {
    const extra = timed("extra", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: {
        recurrenceDates: [at("2026-10-28T09:00")],
        rule: { count: 6, frequency: "WEEKLY" },
      },
    });
    const rdate = find(expand([extra]), "2026-10-28T08:00:00Z");
    const deleteChange = change(rdate, "delete");
    expect(recurrenceEditScopes(deleteChange, adapters)).toEqual(["this", "following", "all"]);
  });
});

describe(`time zones and excluded first occurrences`, () => {
  test(`an unknown sourceTimeZone is a rejection, not a throw`, () => {
    const bad = {
      ...timed("bad", "2026-10-19T09:00", "2026-10-19T09:30", {
        recurrence: { rule: { frequency: "WEEKLY" } },
      }),
      sourceTimeZone: "Mars/Olympus_Mons",
    } as Event;
    const occurrence = occurrenceOf(bad, Temporal.Instant.from("2026-10-26T08:00:00Z"));
    expect(() =>
      recurrenceEditScopes(move(occurrence, { hours: 1 }, "UTC"), adapters),
    ).not.toThrow();
  });

  test(`"following" on the 2nd occurrence when the 1st is EXDATEd is "all"`, () => {
    const s = timed("s", "2026-10-19T09:00", "2026-10-19T09:30", {
      recurrence: {
        exceptionDates: [at("2026-10-19T09:00")],
        rule: { count: 4, frequency: "WEEKLY" },
      },
    });
    const edit = series(
      resolveRecurrenceEdit(
        move(find(expand([s]), "2026-10-26T08:00:00Z"), { hours: 1 }),
        "following",
        adapters,
      ),
    );
    const after = apply([s], edit);
    const visibleFromOld = expand(after).filter(
      (occurrence) => occurrence.recurrence?.seriesId === "s",
    );
    // The old master has COUNT=1 and its only occurrence excluded: a zero-occurrence event.
    expect(visibleFromOld.length > 0 || edit.series.action === "delete").toBe(true);
  });
});

describe(`round trips`, () => {
  test(`"all" across DST with EXDATEs, an RDATE, an override and UNTIL keeps the set`, () => {
    const base = timed("w", "2026-10-05T09:00", "2026-10-05T09:30", {
      recurrence: {
        exceptionDates: [at("2026-10-12T09:00"), Temporal.PlainDate.from("2026-11-09")],
        recurrenceDates: [at("2026-10-28T14:00")],
        rule: { frequency: "WEEKLY", until: at("2026-11-30T09:00") },
      },
    });
    const ovr = overrideOf(base, "w-ovr", at("2026-10-19T09:00"), {
      end: at("2026-10-21T15:30"),
      kind: "timed",
      start: at("2026-10-21T15:00"),
    });
    const events = [base, ovr];
    const dragged = move(find(expand(events), "2026-10-26T08:00:00Z"), { days: 1, hours: 1 });
    expect(allRoundTrip(events, dragged, { days: 1, hours: 1 })).toEqual([]);
  });

  test(`"all" biweekly MO,WE moved three days keeps the set`, () => {
    const base = timed("bi", "2026-10-05T09:00", "2026-10-05T09:30", {
      recurrence: {
        rule: {
          byDay: [{ weekday: "MO" }, { weekday: "WE" }],
          count: 8,
          frequency: "WEEKLY",
          interval: 2,
        },
      },
    });
    const occurrences = expand([base]);
    const wed = occurrences[3]!;
    expect(allRoundTrip([base], move(wed, { days: 3 }), { days: 3 })).toEqual([]);
  });

  test(`"following" with COUNT across DST, EXDATEs and overrides on both sides`, () => {
    const base = timed("f", "2026-10-05T09:00", "2026-10-05T09:30", {
      recurrence: {
        exceptionDates: [at("2026-10-12T09:00"), at("2026-11-09T09:00")],
        rule: { count: 8, frequency: "WEEKLY" },
      },
    });
    const early = overrideOf(base, "early", at("2026-10-19T09:00"), {
      end: at("2026-10-20T10:30"),
      kind: "timed",
      start: at("2026-10-20T10:00"),
    });
    const late = overrideOf(base, "late", at("2026-11-16T09:00"), {
      end: at("2026-11-18T15:30"),
      kind: "timed",
      start: at("2026-11-18T15:00"),
    });
    const events = [base, early, late];
    const dragged = move(find(expand(events), "2026-10-26T08:00:00Z"), { days: 1, hours: 1 });
    const edit = series(resolveRecurrenceEdit(dragged, "following", adapters));
    expect(master(edit).recurrence.rule).toEqual({ count: 3, frequency: "WEEKLY" });
    expect(edit.newSeries?.recurrence.rule).toEqual({ count: 5, frequency: "WEEKLY" });
    expect(walls(expand(apply(events, edit))).sort()).toEqual([
      "2026-10-05T09:00:00",
      "2026-10-20T10:00:00",
      "2026-10-27T10:00:00",
      "2026-11-03T10:00:00",
      "2026-11-18T15:00:00",
      "2026-11-24T10:00:00",
    ]);
  });

  test(`"following" with UNTIL across DST`, () => {
    const base = timed("u", "2026-10-05T09:00", "2026-10-05T09:30", {
      recurrence: { rule: { frequency: "WEEKLY", until: at("2026-11-23T09:00") } },
    });
    const dragged = move(find(expand([base]), "2026-10-26T08:00:00Z"), { days: 1, hours: 1 });
    const edit = series(resolveRecurrenceEdit(dragged, "following", adapters));
    expect(wall(master(edit).recurrence.rule?.until)).toBe("2026-10-19T09:00:00");
    expect(wall(edit.newSeries?.recurrence.rule?.until)).toBe("2026-11-24T10:00:00");
    expect(walls(expand(apply([base], edit))).sort()).toEqual([
      "2026-10-05T09:00:00",
      "2026-10-12T09:00:00",
      "2026-10-19T09:00:00",
      "2026-10-27T10:00:00",
      "2026-11-03T10:00:00",
      "2026-11-10T10:00:00",
      "2026-11-17T10:00:00",
      "2026-11-24T10:00:00",
    ]);
  });

  test(`resolve and apply don't mutate deeply frozen inputs`, () => {
    const base = deepFreeze(
      timed("z", "2026-10-05T09:00", "2026-10-05T09:30", {
        recurrence: {
          exceptionDates: [at("2026-10-12T09:00")],
          rule: { byDay: [{ weekday: "MO" }], count: 6, frequency: "WEEKLY" },
        },
      }),
    );
    const ovr = deepFreeze(
      overrideOf(base, "z-o", at("2026-10-19T09:00"), {
        end: at("2026-10-20T10:30"),
        kind: "timed",
        start: at("2026-10-20T10:00"),
      }),
    );
    const events = deepFreeze([base, ovr]);
    const occurrences = expand(events);
    for (const scope of ["this", "following", "all"] as const) {
      for (const edited of [
        move(find(occurrences, "2026-10-26T08:00:00Z"), { days: 1 }),
        change(find(occurrences, "2026-10-26T08:00:00Z"), "delete"),
      ]) {
        const edit = resolveRecurrenceEdit(edited, scope, adapters, { occurrences });
        if (edit.type === "series") apply(events, edit);
      }
    }
  });

  test(`"following" biweekly MO,WE,FR split at a Wednesday and moved a day`, () => {
    const base = timed("bf", "2026-10-05T09:00", "2026-10-05T09:30", {
      recurrence: {
        rule: {
          byDay: [{ weekday: "MO" }, { weekday: "WE" }, { weekday: "FR" }],
          count: 9,
          frequency: "WEEKLY",
          interval: 2,
        },
      },
    });
    const before = expand([base]);
    const wed = before[4]!; // Mon 5, Wed 7, Fri 9, Mon 19, Wed 21 Oct, ...
    expect(wall(wed.interval.start)).toBe("2026-10-21T09:00:00");
    const edit = series(resolveRecurrenceEdit(move(wed, { days: 1 }), "following", adapters));
    const expected = walls(before).map((start, index) =>
      index < 4 ? start : Temporal.PlainDateTime.from(start).add({ days: 1 }).toString(),
    );
    expect(walls(expand(apply([base], edit))).sort()).toEqual(expected.sort());
  });
});

describe(`code review`, () => {
  const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
    recurrence: { rule: { count: 6, frequency: "WEEKLY" } },
  });

  test(`a DURATION in weeks takes an override's resize without throwing`, () => {
    const holiday = allDay("holiday", "2026-10-19", "2026-10-26", {
      recurrence: {
        duration: Temporal.Duration.from("P1W"),
        rule: { count: 4, frequency: "WEEKLY", interval: 2 },
      },
    });
    const longer = overrideOf(holiday, "longer", Temporal.PlainDate.from("2026-11-02"), {
      end: Temporal.PlainDate.from("2026-11-10"),
      kind: "all-day",
      start: Temporal.PlainDate.from("2026-11-02"),
    });
    const occurrence = find(expand([holiday, longer]), "2026-11-02");
    const edit = series(
      resolveRecurrenceEdit(resize(occurrence, "end", { days: 1 }), "all", adapters),
    );
    expect(master(edit).recurrence.duration?.toString()).toBe("P8D");
  });

  test(`a change to an override in another zone leaves the series' zone alone`, () => {
    const elsewhere = overrideOf(standup, "elsewhere", at("2026-11-02T09:00"), {
      end: at("2026-11-02T10:00", "America/New_York"),
      kind: "timed",
      sourceTimeZone: "America/New_York",
      start: at("2026-11-02T09:00", "America/New_York"),
    });
    const occurrence = find(expand([standup, elsewhere]), "2026-11-02T08:00:00Z");
    const retitled = change(occurrence, "update", occurrence.interval);
    const edit = series(resolveRecurrenceEdit(retitled, "all", adapters));
    expect(master(edit).placement).toMatchObject({ sourceTimeZone: berlin, start: standup.start });
    expect(edit.otherOverrides.action).toBe("keep");
    // An hour later in New York is an hour later in Berlin too.
    const later = series(
      resolveRecurrenceEdit(move(occurrence, { hours: 1 }, "America/New_York"), "all", adapters),
    );
    expect(wall(master(later).placement.start)).toBe("2026-10-19T10:00:00");
  });

  test(`moving a timed override of an all-day series within its day leaves the series all-day`, () => {
    const daily = allDay("daily", "2026-10-19", "2026-10-20", {
      recurrence: { rule: { count: 5, frequency: "DAILY" } },
    });
    const meeting = overrideOf(daily, "meeting", Temporal.PlainDate.from("2026-10-21"), {
      end: at("2026-10-21T11:00"),
      kind: "timed",
      sourceTimeZone: berlin,
      start: at("2026-10-21T10:00"),
    });
    const occurrence = find(expand([daily, meeting]), "2026-10-21");
    const edit = series(resolveRecurrenceEdit(move(occurrence, { hours: 1 }), "all", adapters));
    expect(master(edit).placement).toMatchObject({
      kind: "all-day",
      start: Temporal.PlainDate.from("2026-10-19"),
    });
    expect(edit.override).toMatchObject({
      action: "update",
      placement: { start: at("2026-10-21T11:00") },
    });
    const nextDay = series(resolveRecurrenceEdit(move(occurrence, { days: 1 }), "all", adapters));
    expect(master(nextDay).placement).toMatchObject({
      start: Temporal.PlainDate.from("2026-10-20"),
    });
  });

  test(`a first occurrence dropped onto a DST gap keeps the written time for the rest`, () => {
    const early = timed("early", "2026-03-27T02:30", "2026-03-27T03:00", {
      recurrence: { rule: { count: 4, frequency: "DAILY" } },
    });
    const first = find(expand([early]), "2026-03-27T01:30:00Z");
    const edit = series(resolveRecurrenceEdit(move(first, { days: 2 }), "all", adapters));
    expect(master(edit).recurrence.wallStart?.toString()).toBe("2026-03-29T02:30:00");
    expect(walls(expand(apply([early], edit)))).toEqual([
      "2026-03-29T03:30:00",
      "2026-03-30T02:30:00",
      "2026-03-31T02:30:00",
      "2026-04-01T02:30:00",
    ]);
  });

  test(`an extra date before the first occurrence can't end a series without a rule`, () => {
    const visits = timed("visits", "2026-10-20T09:00", "2026-10-20T10:00", {
      recurrence: { recurrenceDates: [at("2026-10-19T09:00"), at("2026-10-22T09:00")] },
    });
    const early = find(expand([visits]), "2026-10-19T07:00:00Z");
    expect(resolveRecurrenceEdit(change(early, "delete"), "following", adapters)).toMatchObject({
      reason: "extra-occurrence",
      type: "rejected",
    });
    expect(recurrenceEditScopes(change(early, "delete"), adapters)).toEqual(["this", "all"]);
  });

  test(`a yearly date can't move across 29 February, but can elsewhere`, () => {
    expect(shiftRule({ frequency: "YEARLY" }, shiftBy(20, "2027-02-15T09:00"))).toHaveProperty(
      "problem",
    );
    expect(shiftRule({ frequency: "YEARLY" }, shiftBy(1, "2026-10-31T09:00"))).toEqual({
      rule: { frequency: "YEARLY" },
    });
  });

  test(`deleting the series deletes overrides whose original start can't be read`, () => {
    const odd = overrideOf(standup, "odd", Temporal.PlainDate.from("2026-11-02"), {
      end: at("2026-11-02T12:00"),
      kind: "timed",
      start: at("2026-11-02T11:00"),
    });
    const occurrence = find(expand([standup]), "2026-10-26T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(change(occurrence, "delete"), "all", adapters));
    expect(apply([standup, odd], edit)).toEqual([]);
  });
});
