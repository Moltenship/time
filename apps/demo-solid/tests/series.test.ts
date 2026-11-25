import type { CalendarEventChange } from "@moltenship/calendar-core";
import { expect, test } from "vite-plus/test";

import type { Meeting } from "../src/calendar";
import { applyToSeries, seriesScopes } from "../src/series";

type Change = Exclude<CalendarEventChange<Meeting, string, string>, { readonly cause: "create" }>;

const day = Temporal.PlainDate.from("2026-10-05");
const sync = (offset: number): Meeting => ({
  id: `sync-${offset + 1}`,
  interval: {
    end: Temporal.Instant.from(`${day.add({ days: offset }).toString()}T16:30:00Z`),
    kind: "timed",
    start: Temporal.Instant.from(`${day.add({ days: offset }).toString()}T16:00:00Z`),
  },
  series: "sync",
  title: "Team sync",
});
const lunch: Meeting = {
  id: "lunch",
  interval: {
    end: Temporal.Instant.from("2026-10-06T13:00:00Z"),
    kind: "timed",
    start: Temporal.Instant.from("2026-10-06T12:00:00Z"),
  },
  title: "Lunch",
};
const events = [sync(0), sync(1), sync(2), lunch];

/** Moves an occurrence an hour later, as a drag would propose it. */
const later = (event: Meeting) =>
  ({
    cause: "move",
    event,
    eventId: event.id,
    proposed: {
      end: (event.interval.end as Temporal.Instant).add({ hours: 1 }),
      kind: "timed",
      start: (event.interval.start as Temporal.Instant).add({ hours: 1 }),
    },
  }) as unknown as Change;

const starts = (list: readonly Meeting[]) =>
  list.map(({ id, interval }) => `${id} ${interval.start.toString()}`);

test("the first occurrence offers no This and following", () => {
  expect(seriesScopes(later(sync(0)), events)).toEqual(["this", "all"]);
  expect(seriesScopes(later(sync(1)), events)).toEqual(["this", "following", "all"]);
});

test("a move applies to this, the following, or all occurrences, by the same amount", () => {
  expect(starts(applyToSeries(events, later(sync(1)), "this"))).toEqual([
    "sync-1 2026-10-05T16:00:00Z",
    "sync-2 2026-10-06T17:00:00Z",
    "sync-3 2026-10-07T16:00:00Z",
    "lunch 2026-10-06T12:00:00Z",
  ]);
  expect(starts(applyToSeries(events, later(sync(1)), "following"))).toEqual([
    "sync-1 2026-10-05T16:00:00Z",
    "sync-2 2026-10-06T17:00:00Z",
    "sync-3 2026-10-07T17:00:00Z",
    "lunch 2026-10-06T12:00:00Z",
  ]);
  expect(starts(applyToSeries(events, later(sync(1)), "all"))).toEqual([
    "sync-1 2026-10-05T17:00:00Z",
    "sync-2 2026-10-06T17:00:00Z",
    "sync-3 2026-10-07T17:00:00Z",
    "lunch 2026-10-06T12:00:00Z",
  ]);
});

test("a delete removes the occurrences in its scope", () => {
  const remove = { cause: "delete", event: sync(1), eventId: "sync-2" } as unknown as Change;
  expect(applyToSeries(events, remove, "following").map(({ id }) => id)).toEqual([
    "sync-1",
    "lunch",
  ]);
  expect(applyToSeries(events, remove, "all").map(({ id }) => id)).toEqual(["lunch"]);
});
