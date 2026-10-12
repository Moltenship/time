import type { TimedCalendarEventInterval } from "@moltenship/calendar-core";
import { describe, expect, test } from "vite-plus/test";

import {
  isRecurringChange,
  recurrenceEditScopes,
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
  type Change,
  type Event,
} from "./harness";

// Weekly on Monday at 09:00 in Berlin, from 19 October 2026: DST ends on 25 October.
const standup = timed("standup", "2026-10-19T09:00", "2026-10-19T09:30", {
  recurrence: { rule: { frequency: "WEEKLY" } },
});

function series(
  edit: RecurrenceEdit<Event, string, string>,
): RecurrenceSeriesEdit<Event, string, string> {
  if (edit.type !== "series")
    throw new Error(`Expected a series edit, got ${JSON.stringify(edit)}`);
  return edit;
}

describe("changes that need no scope", () => {
  const lunch = timed("lunch", "2026-10-20T12:00", "2026-10-20T13:00");

  test("a one-off event passes through with the event unwrapped", () => {
    const occurrence = find(expand([lunch]), "lunch");
    const moved = move(occurrence, { hours: 1 });
    expect(isRecurringChange(moved)).toBe(false);
    for (const scope of ["this", "following", "all"] as const) {
      const edit = resolveRecurrenceEdit(moved, scope, adapters);
      expect(edit).toEqual({
        change: { ...moved, event: lunch, eventId: "lunch" },
        type: "event",
      });
    }
    expect(recurrenceEditScopes(moved, adapters)).toEqual([]);
  });

  test("a create passes through as it is", () => {
    const create: Change = {
      cause: "create",
      event: null,
      eventId: null,
      id: "change-1",
      original: null,
      proposed: { ...allDay("x", "2026-10-20", "2026-10-21"), resourceIds: [] },
    };
    expect(isRecurringChange(create)).toBe(false);
    expect(resolveRecurrenceEdit(create, "all", adapters)).toEqual({
      change: create,
      type: "event",
    });
  });

  test("an occurrence of a series is recurring, a delete too", () => {
    const occurrence = find(expand([standup]), "2026-10-26T08:00:00Z");
    expect(isRecurringChange(move(occurrence, { hours: 1 }))).toBe(true);
    expect(isRecurringChange(change(occurrence, "delete"))).toBe(true);
  });

  test("does not mutate its inputs", () => {
    const occurrences = expand([standup]);
    const frozen = structuredClone(standup.recurrence);
    const occurrence = find(occurrences, "2026-10-26T08:00:00Z");
    const moved = move(occurrence, { days: 1 });
    for (const scope of ["this", "following", "all"] as const) {
      resolveRecurrenceEdit(moved, scope, adapters);
      resolveRecurrenceEdit(change(occurrence, "delete"), scope, adapters);
    }
    expect(standup.recurrence).toEqual(frozen);
  });
});

describe('"this"', () => {
  test("a move creates an override that keeps the original start, and so the ID", () => {
    const occurrence = find(expand([standup]), "2026-10-26T08:00:00Z");
    const moved = move(occurrence, { hours: 2 });
    const edit = series(resolveRecurrenceEdit(moved, "this", adapters));
    expect(edit).toMatchObject({
      cause: "move",
      otherOverrides: { action: "keep" },
      override: {
        action: "create",
        from: standup,
        placement: moved.proposed,
        recurrenceId: at("2026-10-26T09:00"),
        seriesId: "standup",
      },
      scope: "this",
      series: { action: "keep" },
      seriesId: "standup",
    });
    expect(edit.occurrenceIds.size).toBe(0);
  });

  test("a resize or an update of an overridden occurrence updates its override", () => {
    const moved = overrideOf(standup, "moved", at("2026-10-26T09:00"), {
      end: at("2026-10-26T15:00"),
      kind: "timed",
      start: at("2026-10-26T14:00"),
    });
    const occurrence = find(expand([standup, moved]), "2026-10-26T08:00:00Z");
    expect(occurrence.recurrence?.override).toBe(moved);
    for (const cause of ["resize-end", "update"] as const) {
      const proposed = {
        ...(occurrence.interval as TimedCalendarEventInterval),
        end: at("2026-10-26T16:00"),
      };
      const edit = series(
        resolveRecurrenceEdit(change(occurrence, cause, proposed), "this", adapters),
      );
      expect(edit.override).toEqual({
        action: "update",
        event: moved,
        eventId: "moved",
        placement: { ...proposed, resourceIds: [] },
        recurrenceId: at("2026-10-26T09:00"),
        series: "current",
      });
      expect(edit.series).toEqual({ action: "keep" });
    }
  });

  test("moving an occurrence to another kind gives the override that kind", () => {
    const occurrence = find(expand([standup]), "2026-10-26T08:00:00Z");
    const proposed = {
      end: Temporal.PlainDate.from("2026-10-28"),
      kind: "all-day" as const,
      start: Temporal.PlainDate.from("2026-10-27"),
    };
    const edit = series(
      resolveRecurrenceEdit(change(occurrence, "move", proposed), "this", adapters),
    );
    expect(edit.override).toMatchObject({
      action: "create",
      placement: proposed,
      recurrenceId: at("2026-10-26T09:00"),
    });
  });

  test("a delete adds an EXDATE and drops the override", () => {
    const moved = overrideOf(standup, "moved", at("2026-11-02T09:00"), {
      end: at("2026-11-02T12:00"),
      kind: "timed",
      start: at("2026-11-02T11:00"),
    });
    const master = {
      ...standup,
      recurrence: { ...standup.recurrence, exceptionDates: [at("2026-10-26T09:00")] },
    };
    const occurrence = find(expand([master, moved]), "2026-11-02T08:00:00Z");
    const edit = series(resolveRecurrenceEdit(change(occurrence, "delete"), "this", adapters));
    expect(edit.series).toEqual({
      action: "update",
      event: master,
      eventId: "standup",
      placement: {
        end: at("2026-10-19T09:30"),
        kind: "timed",
        resourceIds: [],
        sourceTimeZone: "Europe/Berlin",
        start: at("2026-10-19T09:00"),
      },
      recurrence: {
        exceptionDates: [at("2026-10-26T09:00"), at("2026-11-02T09:00")],
        rule: { frequency: "WEEKLY" },
      },
    });
    expect(edit.override).toEqual({ action: "delete", event: moved, eventId: "moved" });
  });

  test("a delete of the first occurrence excludes it too", () => {
    const occurrence = find(expand([standup]), "2026-10-19T07:00:00Z");
    const edit = series(resolveRecurrenceEdit(change(occurrence, "delete"), "this", adapters));
    expect(edit.series).toMatchObject({
      recurrence: { exceptionDates: [at("2026-10-19T09:00")] },
    });
    expect(edit.override).toBeUndefined();
  });

  test("all-day and floating series exclude dates of their kind", () => {
    const daily = allDay("daily", "2026-10-19", "2026-10-20", {
      recurrence: { rule: { frequency: "DAILY" } },
    });
    const evening = floating("evening", "2026-10-19T18:00", "2026-10-19T19:00", {
      recurrence: { rule: { frequency: "DAILY" } },
    });
    const occurrences = expand([daily, evening]);
    expect(
      series(
        resolveRecurrenceEdit(change(find(occurrences, "2026-10-21"), "delete"), "this", adapters),
      ).series,
    ).toMatchObject({ recurrence: { exceptionDates: [Temporal.PlainDate.from("2026-10-21")] } });
    expect(
      series(
        resolveRecurrenceEdit(
          change(find(occurrences, "2026-10-21T18:00:00"), "delete"),
          "this",
          adapters,
        ),
      ).series,
    ).toMatchObject({
      recurrence: { exceptionDates: [Temporal.PlainDateTime.from("2026-10-21T18:00")] },
    });
  });

  test("an override without its master can change, and a delete cancels it", () => {
    const invitation = overrideOf(standup, "invite", at("2026-10-26T09:00"), {
      end: at("2026-10-26T11:00"),
      kind: "timed",
      start: at("2026-10-26T10:00"),
    });
    const occurrence = find(expand([invitation]), "standup::2026-10-26T08:00:00Z");
    expect(occurrence.recurrence?.series).toBeUndefined();

    const moved = move(occurrence, { hours: 1 });
    expect(series(resolveRecurrenceEdit(moved, "this", adapters)).override).toMatchObject({
      action: "update",
      eventId: "invite",
      placement: moved.proposed,
    });

    const deleted = series(resolveRecurrenceEdit(change(occurrence, "delete"), "this", adapters));
    expect(deleted.series).toEqual({ action: "keep" });
    expect(deleted.override).toMatchObject({
      action: "update",
      cancelled: true,
      eventId: "invite",
      recurrenceId: at("2026-10-26T09:00"),
    });

    for (const scope of ["following", "all"] as const) {
      expect(resolveRecurrenceEdit(moved, scope, adapters)).toMatchObject({
        reason: "missing-series",
        type: "rejected",
      });
    }
    expect(recurrenceEditScopes(moved, adapters)).toEqual(["this"]);
  });
});
