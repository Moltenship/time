// A calendar in another zone than its series moves occurrences on its own clock. In 2026 New York
// is on summer time from 8 March and Berlin from 29 March, so for those three weeks a 10:00 Berlin
// series shows at 05:00 in New York instead of 04:00. `options.timeZone` lets a drag by days there
// keep the series at 10:00.
import { describe, expect, test } from "vite-plus/test";

import {
  applyRecurrenceEdit,
  resolveRecurrenceEdit,
  type RecurrenceEdit,
  type RecurrenceSeriesEdit,
  type ResolveRecurrenceEditOptions,
} from "../../src";
import {
  adapters,
  at,
  expand,
  find,
  move,
  overrideOf,
  timed,
  wall,
  type Event,
  type Occurrence,
} from "./harness";

const newYork = "America/New_York";
const kolkata = "Asia/Kolkata";
const inNewYork: ResolveRecurrenceEditOptions<Event, string> = { timeZone: newYork };

// Thursdays at 10:00 Berlin: 5, 12, 19 and 26 March, 2 and 9 April.
const standup = timed("standup", "2026-03-05T10:00", "2026-03-05T10:30", {
  recurrence: { rule: { count: 6, frequency: "WEEKLY" } },
});

type SeriesEdit = RecurrenceSeriesEdit<Event, string, string>;

function series(edit: RecurrenceEdit<Event, string, string>): SeriesEdit {
  if (edit.type !== "series") throw new Error(`Expected a series edit, got ${edit.type}`);
  return edit;
}

function walls(occurrences: readonly Occurrence[], timeZone = "Europe/Berlin"): string[] {
  return occurrences.map((occurrence) => wall(occurrence.interval.start, timeZone)).sort();
}

let counter = 0;
function applied(edit: RecurrenceEdit<Event, string, string>): string[] {
  const events = applyRecurrenceEdit([standup], series(edit), {
    createId: () => `created-${++counter}`,
  });
  return walls(expand(events));
}

// 26 March, 05:00 in New York, dragged a week to 2 April, 05:00, which is 11:00 in Berlin.
const lastWinterWeek = () =>
  move(find(expand([standup]), "2026-03-26T09:00:00Z"), { days: 7 }, newYork);

describe(`a drag by days on a calendar in another zone`, () => {
  test(`"all" without the calendar's zone takes the time it was dropped at`, () => {
    expect(applied(resolveRecurrenceEdit(lastWinterWeek(), "all", adapters))).toEqual([
      "2026-03-12T11:00:00",
      "2026-03-19T11:00:00",
      "2026-03-26T11:00:00",
      "2026-04-02T11:00:00",
      "2026-04-09T11:00:00",
      "2026-04-16T11:00:00",
    ]);
  });

  test(`"all" with the calendar's zone moves the series a week and keeps 10:00`, () => {
    const edit = series(resolveRecurrenceEdit(lastWinterWeek(), "all", adapters, inNewYork));
    expect(applied(edit)).toEqual([
      "2026-03-12T10:00:00",
      "2026-03-19T10:00:00",
      "2026-03-26T10:00:00",
      "2026-04-02T10:00:00",
      "2026-04-09T10:00:00",
      "2026-04-16T10:00:00",
    ]);
    // The dragged occurrence keeps following the selection: 2 April, 10:00 Berlin.
    expect(edit.occurrenceIds.get("standup::2026-03-26T09:00:00Z")).toBe(
      "standup::2026-04-02T08:00:00Z",
    );
  });

  test(`"all" from the first occurrence keeps 10:00 too`, () => {
    // 5 March, 04:00 in New York, a week on is 12 March, 04:00: 09:00 in Berlin.
    const first = move(find(expand([standup]), "2026-03-05T09:00:00Z"), { days: 7 }, newYork);
    expect(applied(resolveRecurrenceEdit(first, "all", adapters, inNewYork))).toEqual([
      "2026-03-12T10:00:00",
      "2026-03-19T10:00:00",
      "2026-03-26T10:00:00",
      "2026-04-02T10:00:00",
      "2026-04-09T10:00:00",
      "2026-04-16T10:00:00",
    ]);
  });

  test(`"following" starts the new series at 10:00`, () => {
    // 19 March, 05:00 in New York, two weeks on is 2 April, 05:00: 11:00 in Berlin.
    const third = move(find(expand([standup]), "2026-03-19T09:00:00Z"), { days: 14 }, newYork);
    const without = series(resolveRecurrenceEdit(third, "following", adapters));
    expect(applied(without)).toEqual([
      "2026-03-05T10:00:00",
      "2026-03-12T10:00:00",
      "2026-04-02T11:00:00",
      "2026-04-09T11:00:00",
      "2026-04-16T11:00:00",
      "2026-04-23T11:00:00",
    ]);
    const edit = series(resolveRecurrenceEdit(third, "following", adapters, inNewYork));
    expect(applied(edit)).toEqual([
      "2026-03-05T10:00:00",
      "2026-03-12T10:00:00",
      "2026-04-02T10:00:00",
      "2026-04-09T10:00:00",
      "2026-04-16T10:00:00",
      "2026-04-23T10:00:00",
    ]);
  });

  test(`a drag that also changes the time of day still takes the time it was dropped at`, () => {
    // 2 April, 06:00 in New York is 12:00 in Berlin.
    const later = move(
      find(expand([standup]), "2026-03-26T09:00:00Z"),
      { days: 7, hours: 1 },
      newYork,
    );
    const edit = series(resolveRecurrenceEdit(later, "all", adapters, inNewYork));
    expect(applied(edit)[0]).toBe("2026-03-12T12:00:00");
  });

  test(`"this" keeps the occurrence where it was dropped`, () => {
    const edit = series(resolveRecurrenceEdit(lastWinterWeek(), "this", adapters, inNewYork));
    expect(edit.override?.action).toBe("create");
    expect(edit.override?.action === "create" && wall(edit.override.placement.start)).toBe(
      "2026-04-02T11:00:00",
    );
  });

  test(`a calendar in the series' own zone gives the same edit with or without it`, () => {
    const occurrence = find(expand([standup]), "2026-03-26T09:00:00Z");
    const dragged = move(occurrence, { days: 7 });
    expect(resolveRecurrenceEdit(dragged, "all", adapters, { timeZone: "Europe/Berlin" })).toEqual(
      resolveRecurrenceEdit(dragged, "all", adapters),
    );
  });

  test(`an override in another zone, dragged by days on a calendar in the series' zone`, () => {
    // 5 March's occurrence moved to 09:00 in New York, 15:00 in Berlin. A week later on the Berlin
    // clock is 10:00 in New York, which switched to summer time on 8 March.
    const moved = overrideOf(standup, "moved", at("2026-03-05T10:00"), {
      end: at("2026-03-05T09:30", newYork),
      kind: "timed",
      sourceTimeZone: newYork,
      start: at("2026-03-05T09:00", newYork),
    });
    const dragged = move(find(expand([standup, moved]), "2026-03-05T09:00:00Z"), { days: 7 });
    const edit = series(
      resolveRecurrenceEdit(dragged, "all", adapters, { timeZone: "Europe/Berlin" }),
    );
    expect(edit.series.action === "update" && wall(edit.series.placement.start)).toBe(
      "2026-03-12T10:00:00",
    );
  });

  test(`a day move onto the second 02:30 of DST's end keeps that instant`, () => {
    // 02:30 in Berlin is 07:00 in Kolkata. A day back from 26 October is 25 October, 07:00 there,
    // which is 01:30 UTC: the second 02:30 in Berlin, as the clocks go back.
    const nightly = timed("nightly", "2026-10-26T02:30", "2026-10-26T03:00", {
      recurrence: { rule: { count: 5, frequency: "DAILY" } },
    });
    const dragged = move(find(expand([nightly]), "2026-10-26T01:30:00Z"), { days: -1 }, kolkata);
    const edit = series(resolveRecurrenceEdit(dragged, "all", adapters, { timeZone: kolkata }));
    expect(edit.series.action === "update" && String(edit.series.placement.start)).toBe(
      "2026-10-25T01:30:00Z",
    );
  });

  test(`a calendar zone that isn't a time zone is a rejection`, () => {
    expect(
      resolveRecurrenceEdit(lastWinterWeek(), "all", adapters, { timeZone: "Mars/Olympus" }),
    ).toMatchObject({ reason: "invalid-time-zone", type: "rejected" });
  });
});
