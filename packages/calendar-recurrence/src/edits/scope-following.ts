import type { EventId, ResourceId } from "@moltenship/calendar-core";

import { compareDates, datesEqual, fromWall, justAfter, toWall } from "../internal/dates";
import { expandRecurrenceRule } from "../rule/expand";
import type {
  RecurrenceAdapters,
  RecurrenceDate,
  RecurrencePeriod,
  RecurrenceRule,
} from "../types";
import { extraStart, readKey, rekey, seriesWall } from "./keys";
import { shiftRule } from "./rule-shift";
import { resolveAll } from "./scope-all";
import {
  checkRule,
  isExcluded,
  landing,
  keyShift,
  measureMove,
  noIds,
  occurrenceIds,
  overrideOf,
  reject,
  rekeyExceptions,
  rekeyExtras,
  ruleRejection,
  ruleStart,
  seriesPlacement,
  withFields,
  type Change,
  type Options,
  type Series,
} from "./series";
import type { RecurrenceEdit, RecurrenceOverrideWrite } from "./types";

type Side = "after" | "at" | "before" | "both";

function withoutCount(rule: RecurrenceRule): RecurrenceRule {
  const { count: _count, ...rest } = rule;
  return rest;
}

/**
 * `"following"`: the series ends right before the edited occurrence, and a new one starts where it
 * went with the rest of the rule. Later EXDATEs, RDATEs and overrides move to it. A delete only
 * ends the series. When nothing before the occurrence is left to show, it is `"all"`.
 */
export function resolveFollowing<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: Change<TEvent, TEventId, TResourceId>,
  series: Series<TEvent, TEventId, TResourceId>,
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: Options<TEvent, TEventId>,
): RecurrenceEdit<TEvent, TEventId, TResourceId> {
  const { recurrence, recurrenceId } = series;
  const { rule } = recurrence;
  const identity = keyShift(series, undefined);
  const extras = recurrence.recurrenceDates ?? [];
  const isExtra = extras.some((extra) => {
    const start = extraStart(identity, extra);
    return start !== undefined && datesEqual(start, recurrenceId);
  });

  // The rule's starts up to the occurrence, excluded ones included: they count toward COUNT.
  let starts: readonly RecurrenceDate[] =
    compareDates(series.first.start, recurrenceId) < 0 ? [series.first.start] : [];
  if (rule !== undefined) {
    try {
      const expansion = expandRecurrenceRule(rule, ruleStart(series), {
        before: justAfter(recurrenceId),
        ...(options.maxIterations === undefined ? {} : { maxIterations: options.maxIterations }),
      });
      if (expansion.truncated) {
        return reject("iteration-limit", "The previous occurrence is too many steps away.");
      }
      starts = expansion.dates;
    } catch (error) {
      return ruleRejection(error);
    }
  } else if (!isExtra) {
    return reject("unknown-occurrence", "The series doesn't have this occurrence.");
  } else if (starts.length === 0) {
    return reject(
      "extra-occurrence",
      "The first occurrence always happens, so an extra date before it can't end the series.",
    );
  }
  // An occurrence only an RDATE adds can end the series, but the rule can't continue from it.
  const last = starts.at(-1);
  const produced = rule !== undefined && last !== undefined && datesEqual(last, recurrenceId);
  if (rule !== undefined && !produced) {
    if (!isExtra) {
      return reject("unknown-occurrence", "The series' rule doesn't produce this occurrence.");
    }
    // The first occurrence always happens, so an extra date before it can't end the series.
    if (change.cause !== "delete" || last === undefined) {
      return reject(
        "extra-occurrence",
        "The occurrence is an extra date, so the rule can't continue from it.",
      );
    }
  }
  const earlier = produced ? starts.slice(0, -1) : starts;

  // EXDATEs and RDATEs before the occurrence stay; later ones move to the new series. A whole-day
  // EXDATE on the occurrence's day applies to both.
  const day = seriesWall(recurrenceId, identity).toPlainDate();
  const side = (date: RecurrenceDate, role: "exception" | "start"): Side => {
    if (date instanceof Temporal.PlainDate && series.first.kind !== "all-day" && role !== "start") {
      const order = Temporal.PlainDate.compare(date, day);
      return order < 0 ? "before" : order > 0 ? "after" : "both";
    }
    const key = readKey(identity, date, role);
    if (key === undefined) return "before";
    const order = compareDates(key, recurrenceId);
    return order < 0 ? "before" : order > 0 ? "after" : "at";
  };
  const extraSide = (extra: RecurrenceDate | RecurrencePeriod): Side => {
    const start = extraStart(identity, extra);
    return start === undefined ? "before" : side(start, "start");
  };
  const exceptions = recurrence.exceptionDates;
  const exceptionsBefore = exceptions?.filter((date) => side(date, "exception") !== "after");
  const exceptionsAfter = exceptions?.filter((date) => side(date, "exception") !== "before");
  const extrasBefore = recurrence.recurrenceDates?.filter((extra) => extraSide(extra) === "before");
  const extrasAfter = recurrence.recurrenceDates?.filter((extra) => extraSide(extra) === "after");

  const shown = (start: RecurrenceDate | undefined) =>
    start !== undefined && !isExcluded(series, start);
  if (
    !earlier.some(shown) &&
    !(extrasBefore ?? []).some((extra) => shown(extraStart(identity, extra)))
  ) {
    return resolveAll(change, series, adapters, options);
  }

  // End the series right before the occurrence: UNTIL at the previous start, or the number of
  // occurrences before it when the rule ends by COUNT alone.
  const count = earlier.length;
  const ended =
    rule === undefined
      ? undefined
      : rule.count !== undefined && rule.until === undefined
        ? { ...rule, count }
        : { ...withoutCount(rule), until: earlier.at(-1)! };
  const endedSeries = {
    action: "update",
    event: series.event,
    eventId: series.id,
    placement: series.placement,
    recurrence: withFields(recurrence, {
      exceptionDates: exceptionsBefore,
      recurrenceDates: extrasBefore,
      rule: ended,
    }),
  } as const;
  const override = overrideOf(change, adapters);
  const base = {
    cause: change.cause,
    recurrenceId,
    scope: "following",
    seriesId: series.id,
    type: "series",
  } as const;

  if (change.cause === "delete") {
    return {
      ...base,
      occurrenceIds: noIds,
      otherOverrides: { action: "delete", after: recurrenceId, series: "current", shift: identity },
      ...(override === undefined ? {} : { override: { action: "delete", ...override } }),
      series: endedSeries,
    };
  }

  const { proposed } = change;
  const move = measureMove(series, change, options);
  if ("type" in move) return move;
  // The new series starts where the user's change puts the occurrence: where it was dropped, or,
  // for an override or a day move on a calendar in another zone, its original start moved by the
  // same change.
  const start =
    override === undefined && move.dropped ? proposed.start : fromWall(move.wallTo, move.to);
  let shift = keyShift(series, move, { from: recurrenceId, to: start });
  let next: RecurrenceRule | undefined;
  if (rule !== undefined) {
    const shifted = shiftRule(rule, {
      days: move.days,
      firstAfter: move.wallTo,
      firstBefore: move.wallFrom,
      time: move.time,
      toAllDay: move.to.kind === "all-day" && series.time.kind !== "all-day",
    });
    if ("problem" in shifted) return reject("rule-cannot-move", shifted.problem);
    if (shifted.ordinals !== undefined) shift = { ...shift, ordinals: shifted.ordinals };
    const landed = landing(shift, recurrenceId, move);
    if (landed !== undefined) return landed;
    next = {
      ...shifted.rule,
      ...(rule.count === undefined ? {} : { count: rule.count - count }),
      ...(rule.until === undefined
        ? {}
        : { until: rekey(shift, rule.until, "until") ?? rule.until }),
    };
  }

  const { duration, placement } = seriesPlacement(
    start,
    series,
    move,
    change,
    override !== undefined,
  );
  // A start a DST gap moved forward keeps the written time, so later ones repeat at it.
  const wallStart =
    move.to.kind === "timed" && !toWall(start, move.to).equals(move.wallTo)
      ? move.wallTo
      : undefined;
  const problem = checkRule(next, {
    ...placement,
    ...(wallStart === undefined ? {} : { wallStart }),
  });
  if (problem !== undefined) return problem;
  const nonEmpty = <T>(values: readonly T[] | undefined) =>
    values === undefined || values.length === 0 ? undefined : values;
  const started = withFields(
    {},
    {
      duration,
      exceptionDates: nonEmpty(rekeyExceptions(exceptionsAfter, shift)),
      recurrenceDates: nonEmpty(rekeyExtras(extrasAfter, shift)),
      rule: next,
      wallStart,
    },
  );

  const { newSeriesId } = options;
  const moved: RecurrenceOverrideWrite<TEvent, TEventId, TResourceId> | undefined =
    override === undefined
      ? undefined
      : {
          action: "update",
          ...override,
          placement: proposed,
          recurrenceId: start,
          series: "new",
        };
  return {
    ...base,
    newSeries: {
      from: series.event,
      ...(newSeriesId === undefined ? {} : { id: newSeriesId }),
      placement,
      recurrence: started,
    },
    occurrenceIds:
      newSeriesId === undefined
        ? noIds
        : occurrenceIds(change.eventId, start, series.id, newSeriesId, options, (key) =>
            side(key, "start") === "after" ? rekey(shift, key, "start") : undefined,
          ),
    otherOverrides: { action: "rekey", after: recurrenceId, series: "new", shift },
    ...(moved === undefined ? {} : { override: moved }),
    series: endedSeries,
  };
}
