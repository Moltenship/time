// A calendar in another zone than its series moves occurrences on its own clock. In 2026 New York
// is on summer time from 8 March and Berlin from 29 March, so for those three weeks a 10:00 Berlin
// series shows at 05:00 in New York instead of 04:00. `options.timeZone` replays the change on the
// series' clock: a drag by days keeps the series at 10:00, a drag an hour later moves it an hour.
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
  change,
  expand,
  find,
  move,
  overrideOf,
  resize,
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

describe(`a change on a calendar in another zone`, () => {
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

  test(`"following" with a later time starts the new series that much later on its clock`, () => {
    // 19 March, 05:00 in New York, two weeks and 30 minutes on is 2 April, 05:30: 11:30 in Berlin.
    const third = move(
      find(expand([standup]), "2026-03-19T09:00:00Z"),
      { days: 14, minutes: 30 },
      newYork,
    );
    const edit = series(resolveRecurrenceEdit(third, "following", adapters, inNewYork));
    expect(edit.newSeries && wall(edit.newSeries.placement.start)).toBe("2026-04-02T10:30:00");
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

  test(`a drag that also changes the time of day moves the series by as much on its clock`, () => {
    // A week and an hour on from 26 March, 05:00 in New York is 2 April, 06:00 there: 12:00 in
    // Berlin, but a week and an hour on the series' clock is 11:00.
    const later = move(
      find(expand([standup]), "2026-03-26T09:00:00Z"),
      { days: 7, hours: 1 },
      newYork,
    );
    expect(applied(resolveRecurrenceEdit(later, "all", adapters))[0]).toBe("2026-03-12T12:00:00");
    const edit = series(resolveRecurrenceEdit(later, "all", adapters, inNewYork));
    expect(applied(edit)[0]).toBe("2026-03-12T11:00:00");
    expect(edit.occurrenceIds.get("standup::2026-03-26T09:00:00Z")).toBe(
      "standup::2026-04-02T09:00:00Z",
    );
  });

  test(`an editor update to another date and time is replayed on the series' clock`, () => {
    // The editor shows 26 March at 05:00 in New York; the user picks 2 April at 05:30 there.
    const occurrence = find(expand([standup]), "2026-03-26T09:00:00Z");
    const updated = change(occurrence, "update", {
      end: at("2026-04-02T06:00", newYork),
      kind: "timed",
      sourceTimeZone: "Europe/Berlin",
      start: at("2026-04-02T05:30", newYork),
    });
    expect(applied(resolveRecurrenceEdit(updated, "all", adapters))[0]).toBe("2026-03-12T11:30:00");
    expect(applied(resolveRecurrenceEdit(updated, "all", adapters, inNewYork))[0]).toBe(
      "2026-03-12T10:30:00",
    );
  });

  test(`a resize by days across New York's change stretches the series by days on its clock`, () => {
    // 5 March, 04:00–04:30 in New York. A week on is 12 March, 04:30 there, after New York has
    // moved its clocks: 09:30 in Berlin, an hour short of a week on the series' clock.
    const first = find(expand([standup]), "2026-03-05T09:00:00Z");
    const stretched = resize(first, "end", { days: 7 }, newYork);
    const end = (edit: RecurrenceEdit<Event, string, string>) => {
      const { series: write } = series(edit);
      return write.action === "update" ? wall(write.placement.end) : undefined;
    };
    expect(end(resolveRecurrenceEdit(stretched, "all", adapters))).toBe("2026-03-12T09:30:00");
    expect(end(resolveRecurrenceEdit(stretched, "all", adapters, inNewYork))).toBe(
      "2026-03-12T10:30:00",
    );
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

  test(`on the series' own spring-forward night, the change is the one the series' zone makes`, () => {
    // 02:30 doesn't exist in Berlin on 29 March, so that night's occurrence shows 03:30–04:00.
    const nightly = timed("nightly", "2026-03-27T02:30", "2026-03-27T03:00", {
      recurrence: { rule: { count: 5, frequency: "DAILY" } },
    });
    const gapNight = find(expand([nightly]), "2026-03-29T01:30:00Z");
    const startOf = (edit: RecurrenceEdit<Event, string, string>) => {
      const { series: write } = series(edit);
      return write.action === "update"
        ? `${wall(write.placement.start)}–${wall(write.placement.end).slice(11)}`
        : write.action;
    };
    // An hour later, from New York or from Berlin, moves the series where Berlin's calendar does.
    const later = startOf(resolveRecurrenceEdit(move(gapNight, { hours: 1 }), "all", adapters));
    expect(later).toBe("2026-03-27T04:30:00–05:00:00");
    expect(
      startOf(
        resolveRecurrenceEdit(move(gapNight, { hours: 1 }, newYork), "all", adapters, inNewYork),
      ),
    ).toBe(later);
    // A day later in the editor keeps the time written and the length, from either calendar.
    const { end, start } = gapNight.interval as { end: Temporal.Instant; start: Temporal.Instant };
    const nextDay = (timeZone: string) =>
      change(gapNight, "update", {
        end: end.toZonedDateTimeISO(timeZone).add({ days: 1 }).toInstant(),
        kind: "timed",
        sourceTimeZone: "Europe/Berlin",
        start: start.toZonedDateTimeISO(timeZone).add({ days: 1 }).toInstant(),
      });
    expect(startOf(resolveRecurrenceEdit(nextDay(newYork), "all", adapters, inNewYork))).toBe(
      "2026-03-28T02:30:00–03:00:00",
    );
    expect(startOf(resolveRecurrenceEdit(nextDay("Europe/Berlin"), "all", adapters))).toBe(
      "2026-03-28T02:30:00–03:00:00",
    );
  });

  test(`a move takes one change for both ends, whatever the occurrence's length`, () => {
    // 07:30 in Berlin is 01:30 in New York on 8 March, just before New York skips 02:00–03:00.
    // Thirty minutes later is 08:00 in Berlin, for a two-hour occurrence and a half-hour one.
    const at730 = (minutes: number) =>
      timed(`s${minutes}`, "2026-03-06T07:30", "2026-03-06T07:30", {
        end: at("2026-03-06T07:30").add({ minutes }),
        recurrence: { rule: { count: 5, frequency: "DAILY" } },
      } as Partial<Event>);
    for (const minutes of [120, 30]) {
      const occurrence = find(expand([at730(minutes)]), "2026-03-08T06:30:00Z");
      const edit = series(
        resolveRecurrenceEdit(
          move(occurrence, { minutes: 30 }, newYork),
          "all",
          adapters,
          inNewYork,
        ),
      );
      expect(edit.series.action === "update" && wall(edit.series.placement.start)).toBe(
        "2026-03-06T08:00:00",
      );
    }
  });

  test(`a calendar zone that isn't a time zone is a rejection`, () => {
    expect(
      resolveRecurrenceEdit(lastWinterWeek(), "all", adapters, { timeZone: "Mars/Olympus" }),
    ).toMatchObject({ reason: "invalid-time-zone", type: "rejected" });
  });
});
