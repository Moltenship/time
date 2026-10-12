import type { EventId, ResourceId } from "@moltenship/calendar-core";

import type { RecurrenceAdapters, RecurrenceDate } from "../types";
import { datesEqual, fromWall, toWall } from "./dates";
import { rekey } from "./keys";
import { shiftRule } from "./rule-shift";
import {
  checkRule,
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
  const move = measureMove(series, proposed, options);
  if ("type" in move) return move;
  const unchanged = isUnchanged(series, move);

  // The first occurrence moves as every occurrence does, by the same wall-clock delta. When that
  // lands in a DST gap, `wallStart` keeps the written time, as ICS does; otherwise it goes.
  let firstStart: RecurrenceDate = series.first.start;
  let firstWall = series.wallFirst;
  let wallStart = series.wallStart;
  if (!unchanged) {
    wallStart = undefined;
    if (datesEqual(series.recurrenceId, series.first.start)) {
      firstStart = proposed.start;
      firstWall = move.wallTo;
    } else if (move.to.kind === "all-day") {
      firstWall = series.wallFirst.toPlainDate().add({ days: move.days }).toPlainDateTime();
      firstStart = firstWall.toPlainDate();
    } else {
      firstWall = series.wallFirst.add(move.wall);
      firstStart = fromWall(firstWall, move.to);
      if (move.to.kind === "timed" && !toWall(firstStart, move.to).equals(firstWall)) {
        wallStart = firstWall;
      }
    }
  }

  const shift = keyShift(series, move, { from: series.first.start, to: firstStart });
  let { rule } = series.recurrence;
  if (rule !== undefined && !unchanged) {
    const shifted = shiftRule(rule, {
      days: move.days,
      firstAfter: firstWall,
      firstBefore: series.wallFirst,
      time: move.time,
      toAllDay: move.to.kind === "all-day" && series.time.kind !== "all-day",
    });
    if ("problem" in shifted) return reject("rule-cannot-move", shifted.problem);
    rule =
      rule.until === undefined
        ? shifted.rule
        : { ...shifted.rule, until: rekey(shift, rule.until, "until") ?? rule.until };
  }

  const { duration, placement } = seriesPlacement(firstStart, series, move, change);
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
