import type { EventId, ResourceId } from "@moltenship/calendar-core";

import type { RecurrenceAdapters, RecurrenceDate } from "../types";
import { datesEqual, fromWall, toWall } from "./dates";
import { rekey, targetWall } from "./keys";
import { shiftRule } from "./rule-shift";
import {
  checkRule,
  landing,
  isUnchanged,
  keyShift,
  measureMove,
  noIds,
  occurrenceIds,
  overrideOf,
  reject,
  rekeyExceptions,
  rekeyExtras,
  seriesPlacement,
  withFields,
  type Change,
  type Options,
  type Series,
} from "./series";
import type { RecurrenceEdit } from "./types";

/**
 * `"all"`: the master moves by the edited occurrence's delta from its original start, and its rule,
 * EXDATEs, RDATEs, UNTIL and overrides' original starts move with it. A delete removes the series.
 */
export function resolveAll<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: Change<TEvent, TEventId, TResourceId>,
  series: Series<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: Options<TEvent, TEventId>,
): RecurrenceEdit<TEvent, TEventId, TResourceId> {
  const override = overrideOf(change, adapters);
  const base = {
    cause: change.cause,
    recurrenceId: series.recurrenceId,
    scope: "all",
    seriesId: series.id,
    type: "series",
  } as const;

  if (change.cause === "delete") {
    return {
      ...base,
      occurrenceIds: noIds,
      otherOverrides: { action: "delete", series: "current", shift: keyShift(series, undefined) },
      ...(override === undefined ? {} : { override: { action: "delete", ...override } }),
      series: { action: "delete", event: series.event, eventId: series.id },
    };
  }

  const { proposed } = change;
  const move = measureMove(series, change, options);
  if ("type" in move) return move;
  const unchanged = isUnchanged(series, move);
  const toAllDay = move.to.kind === "all-day" && series.time.kind !== "all-day";

  // The rule moves first: an ordinal weekday rule places each date within its month.
  let { rule } = series.recurrence;
  let shift = keyShift(series, move);
  if (rule !== undefined && !unchanged) {
    const shifted = shiftRule(rule, {
      days: move.days,
      firstAfter: series.wallFirst.add(move.wall),
      firstBefore: series.wallFirst,
      time: move.time,
      toAllDay,
    });
    if ("problem" in shifted) return reject("rule-cannot-move", shifted.problem);
    rule = shifted.rule;
    if (shifted.ordinals !== undefined) shift = { ...shift, ordinals: shifted.ordinals };
  }
  const landed = landing(shift, series.recurrenceId, move);
  if (landed !== undefined) return landed;

  // The first occurrence moves as every occurrence does. When it lands in a DST gap, `wallStart`
  // keeps the written time, as ICS does; otherwise it goes.
  let firstStart: RecurrenceDate = series.first.start;
  let wallStart = series.wallStart;
  if (!unchanged) {
    const firstWall = targetWall(shift, series.first.start);
    // The first occurrence dropped as it is keeps its exact start, as a second 02:30 of DST's end.
    firstStart =
      datesEqual(series.recurrenceId, series.first.start) && override === undefined
        ? proposed.start
        : fromWall(firstWall, move.to);
    wallStart =
      move.to.kind === "timed" && !toWall(firstStart, move.to).equals(firstWall)
        ? firstWall
        : undefined;
  }
  shift = { ...shift, anchor: { from: series.first.start, to: firstStart } };
  if (rule?.until !== undefined && !unchanged) {
    rule = { ...rule, until: rekey(shift, rule.until, "until") ?? rule.until };
  }

  const { duration, placement } = seriesPlacement(
    firstStart,
    series,
    move,
    change,
    override !== undefined,
  );
  const problem = checkRule(rule, {
    ...placement,
    ...(wallStart === undefined ? {} : { wallStart }),
  });
  if (problem !== undefined) return problem;

  const recurrence = withFields(series.recurrence, {
    duration,
    exceptionDates: unchanged
      ? series.recurrence.exceptionDates
      : rekeyExceptions(series.recurrence.exceptionDates, shift),
    recurrenceDates: unchanged
      ? series.recurrence.recurrenceDates
      : rekeyExtras(series.recurrence.recurrenceDates, shift),
    rule,
    wallStart: unchanged ? series.recurrence.wallStart : wallStart,
  });

  const editedKey = unchanged ? series.recurrenceId : rekey(shift, series.recurrenceId, "start")!;
  return {
    ...base,
    occurrenceIds: unchanged
      ? noIds
      : occurrenceIds(change.eventId, editedKey, series.id, series.id, options, (recurrenceId) =>
          rekey(shift, recurrenceId, "start"),
        ),
    otherOverrides: unchanged
      ? { action: "keep", series: "current" }
      : { action: "rekey", series: "current", shift },
    ...(override === undefined
      ? {}
      : {
          override: {
            action: "update",
            ...override,
            placement: proposed,
            recurrenceId: editedKey,
            series: "current",
          },
        }),
    series: { action: "update", event: series.event, eventId: series.id, placement, recurrence },
  };
}
