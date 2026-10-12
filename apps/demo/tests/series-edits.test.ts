import {
  moveEventPlacement,
  plainDateInterval,
  type CalendarEventPlacement,
  type CalendarWallClockDelta,
} from "@moltenship/calendar";
import {
  createOccurrenceExpander,
  formatRecurrenceRule,
  resolveRecurrenceEdit,
  type RecurrenceEditScope,
  type RecurrenceRule,
} from "@moltenship/calendar-recurrence";
import { describe, expect, test } from "vite-plus/test";

import { demoAdapters, type DemoEvent, type DemoOccurrence } from "../src/calendar";
import type { DemoEventChange } from "../src/event-changes";
import type { DemoResourceId } from "../src/resources";
import { createSeriesEvents } from "../src/seed-series";
import { applySeriesEdit, type SeriesEditExtras } from "../src/series-edits";

const timeZone = "Europe/Berlin";
const today = Temporal.PlainDate.from("2026-10-12");
const seeded = createSeriesEvents(today, timeZone);
const range = plainDateInterval(today, today.add({ weeks: 3 }));

function expand(events: readonly DemoEvent[]) {
  const expander = createOccurrenceExpander(demoAdapters, { defaultTimeZone: timeZone });
  return expander.expand(events, { range, timeZone }).occurrences;
}

function placementOf({ event, interval }: DemoOccurrence): CalendarEventPlacement<DemoResourceId> {
  return { ...interval, resourceIds: event.resourceIds ?? [] };
}

let ids = 0;
const createId = () => `created-${++ids}`;

/** Changes an occurrence as the calendar would, resolves the scope, and applies the edit. */
function edit(
  events: readonly DemoEvent[],
  occurrenceId: string,
  scope: RecurrenceEditScope,
  change: { readonly delta?: CalendarWallClockDelta; readonly cause?: "delete" },
  extras?: SeriesEditExtras,
) {
  const occurrences = expand(events);
  const occurrence = occurrences.find(({ id }) => id === occurrenceId);
  if (occurrence === undefined) throw new Error(`${occurrenceId} isn't shown`);
  const original = placementOf(occurrence);
  const base = { event: occurrence, eventId: occurrence.id, id: "change", original };
  const calendarChange: DemoEventChange =
    change.cause === "delete"
      ? { ...base, cause: "delete", proposed: null }
      : {
          ...base,
          cause: "move",
          proposed: moveEventPlacement(original, change.delta ?? {}, { timeZone }),
        };
  const resolved = resolveRecurrenceEdit(calendarChange, scope, demoAdapters, {
    defaultTimeZone: timeZone,
    newSeriesId: "split",
    occurrences,
  });
  if (resolved.type !== "series") throw new Error(`expected a series edit, got ${resolved.type}`);
  const next = applySeriesEdit(events, resolved, createId, {
    timeZone,
    ...extras,
    ...(calendarChange.proposed === null ? {} : { placement: calendarChange.proposed }),
  });
  return { edit: resolved, events: next, occurrences: expand(next) };
}

const wall = ({ interval }: DemoOccurrence) =>
  interval.kind === "timed"
    ? interval.start
        .toZonedDateTimeISO(timeZone)
        .toPlainDateTime()
        .toString({ smallestUnit: "minute" })
    : String(interval.start);
const standups = (occurrences: readonly DemoOccurrence[]) =>
  occurrences.filter(({ event }) => event.title === "Standup" || event.title === "Daily sync");
const ruleOf = (events: readonly DemoEvent[], id: string) => {
  const rule = events.find((event) => event.id === id)?.recurrence?.rule;
  return rule === undefined ? undefined : formatRecurrenceRule(rule);
};
const tuesday = "standup::2026-10-13T07:30:00Z";

describe("series edits on the demo's events", () => {
  test('"this" moves one occurrence with an override that keeps its ID', () => {
    const result = edit(seeded, tuesday, "this", { delta: { hours: 1 } });
    const moved = result.occurrences.find(({ id }) => id === tuesday);

    expect(moved && wall(moved)).toBe("2026-10-13T10:30");
    expect(moved?.event).toMatchObject({
      id: "created-1",
      override: { seriesId: "standup" },
      resourceIds: ["room-orchid"],
      title: "Standup",
    });
    expect(moved?.event.recurrence).toBeUndefined();
    expect(result.edit.occurrenceIds.size).toBe(0);
  });

  test('"this" deletes one occurrence with an exception date', () => {
    const result = edit(seeded, tuesday, "this", { cause: "delete" });
    const master = result.events.find(({ id }) => id === "standup");

    expect(result.occurrences.some(({ id }) => id === tuesday)).toBe(false);
    expect(master?.recurrence?.exceptionDates?.map(String)).toContain("2026-10-13T07:30:00Z");
  });

  test('"all" moves the series, its exceptions and its override, and renames the occurrences', () => {
    const result = edit(seeded, tuesday, "all", { delta: { minutes: 30 } });
    const times = standups(result.occurrences).map(wall).toSorted();

    expect(new Set(times.map((time) => time.slice(11)))).toEqual(new Set(["10:00"]));
    // Still no standup on the offsite days.
    expect(times.map((time) => time.slice(0, 10))).not.toContain("2026-10-21");
    expect(
      result.events.find(({ id }) => id === "standup-moved")?.override?.recurrenceId.toString(),
    ).toBe("2026-10-14T08:00:00Z");
    expect(result.edit.occurrenceIds.get(tuesday)).toBe("standup::2026-10-13T08:00:00Z");
  });

  test('"following" ends the series and starts one where the occurrence went', () => {
    const thursday = "standup::2026-10-15T07:30:00Z";
    const result = edit(seeded, thursday, "following", { delta: { hours: -1 } });

    expect(ruleOf(result.events, "standup")).toBe(
      "FREQ=WEEKLY;UNTIL=20261014T073000Z;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(ruleOf(result.events, "split")).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(result.events.find(({ id }) => id === "split")).toMatchObject({
      kind: "timed",
      sourceTimeZone: timeZone,
      title: "Standup",
    });
    expect(result.edit.occurrenceIds.get(thursday)).toBe("split::2026-10-15T06:30:00Z");
    expect(standups(result.occurrences).map(wall).toSorted().slice(0, 5)).toEqual([
      "2026-10-12T09:30",
      "2026-10-13T09:30",
      "2026-10-14T10:00",
      "2026-10-15T08:30",
      "2026-10-16T08:30",
    ]);
  });

  test("the editor's fields go to every occurrence the scope covers", () => {
    const fields = { calendarId: "personal", title: "Daily sync" } as const;
    const all = edit(seeded, tuesday, "all", {}, { fields });
    const titles = (events: readonly DemoEvent[]) =>
      events
        .filter(({ id }) => id.startsWith("standup") || id === "split")
        .map(({ title }) => title);

    // The moved override had the series' title, so it follows; its description stays its own.
    expect(titles(all.events)).toEqual(["Daily sync", "Daily sync"]);
    expect(all.events.find(({ id }) => id === "standup-moved")?.description).toBeDefined();
    expect(all.events.find(({ id }) => id === "standup")?.calendarId).toBe("personal");

    const one = edit(seeded, tuesday, "this", {}, { fields });
    expect(one.events.find(({ id }) => id === "standup")?.title).toBe("Standup");
    expect(one.occurrences.find(({ id }) => id === tuesday)?.event.title).toBe("Daily sync");
  });

  test("a new rule starts the occurrences over, dropping exceptions and overrides", () => {
    const daily: RecurrenceRule = { frequency: "DAILY" };
    const all = edit(seeded, tuesday, "all", {}, { rule: daily });

    expect(ruleOf(all.events, "standup")).toBe("FREQ=DAILY");
    expect(
      all.events.find(({ id }) => id === "standup")?.recurrence?.exceptionDates,
    ).toBeUndefined();
    expect(all.events.some(({ id }) => id === "standup-moved")).toBe(false);

    const following = edit(seeded, tuesday, "following", {}, { rule: daily });
    expect(ruleOf(following.events, "split")).toBe("FREQ=DAILY");
    // The moved Wednesday came after the split, so it goes; the series before it stays.
    expect(following.events.some(({ id }) => id === "standup-moved")).toBe(false);
    expect(ruleOf(following.events, "standup")).toContain("UNTIL=20261012T073000Z");
  });

  test("without a rule the series is one event where the occurrence went", () => {
    const all = edit(seeded, tuesday, "all", { delta: { hours: 2 } }, { rule: null });
    const standup = all.events.find(({ id }) => id === "standup");

    expect(standup?.recurrence).toBeUndefined();
    expect(standup?.start.toString()).toBe("2026-10-13T09:30:00Z");
    expect(all.events.some(({ id }) => id === "standup-moved")).toBe(false);
    expect(standups(all.occurrences)).toHaveLength(1);

    const following = edit(seeded, tuesday, "following", {}, { rule: null });
    expect(following.events.find(({ id }) => id === "split")?.recurrence).toBeUndefined();
    expect(standups(following.occurrences).map(wall)).toEqual([
      "2026-10-12T09:30",
      "2026-10-13T09:30",
    ]);
  });

  test("a new end keeps the series' exceptions and overrides", () => {
    const until = Temporal.Instant.from("2026-12-31T22:59:59Z");
    const all = edit(seeded, tuesday, "all", {}, { end: { until } });
    const master = all.events.find(({ id }) => id === "standup");

    expect(ruleOf(all.events, "standup")).toBe(
      "FREQ=WEEKLY;UNTIL=20261231T225959Z;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(master?.recurrence?.exceptionDates).toHaveLength(3);
    expect(all.events.some(({ id }) => id === "standup-moved")).toBe(true);
  });

  test("a count is the whole series', so a split leaves the new series what remains", () => {
    // Daily for 21 days from Monday the 12th; the 19th is the eighth.
    const walk = "dog-walk::2026-10-19T06:00:00Z";
    const weekdays: RecurrenceRule = {
      byDay: (["MO", "TU", "WE", "TH", "FR"] as const).map((weekday) => ({ weekday })),
      frequency: "WEEKLY",
    };

    const kept = edit(seeded, walk, "following", {}, { rule: weekdays });
    expect(ruleOf(kept.events, "dog-walk")).toBe("FREQ=DAILY;COUNT=7");
    expect(ruleOf(kept.events, "split")).toBe("FREQ=WEEKLY;COUNT=14;BYDAY=MO,TU,WE,TH,FR");

    const changed = edit(seeded, walk, "following", {}, { end: { count: 10 } });
    expect(ruleOf(changed.events, "split")).toBe("FREQ=DAILY;COUNT=3");
  });

  test("a series repeating another way starts on the first day its new rule has", () => {
    // The review started on Tuesday 14 April, the second Tuesday; it moves to the 13th of each month.
    const review = "monthly-review::2026-10-13T12:00:00Z";
    const thirteenth: RecurrenceRule = { byMonthDay: [13], frequency: "MONTHLY" };
    const result = edit(seeded, review, "all", {}, { rule: thirteenth });
    const master = result.events.find(({ id }) => id === "monthly-review");

    expect(master?.start.toString()).toBe("2026-05-13T12:00:00Z");
    expect(master?.end.toString()).toBe("2026-05-13T13:00:00Z");
    expect(result.occurrences.find(({ event }) => event.title === "Monthly review")?.id).toBe(
      review,
    );
  });
});
