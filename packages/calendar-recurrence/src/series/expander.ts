import type { CalendarEventInterval, EventId, ResourceId } from "@moltenship/calendar-core";

import { coerceRecurrenceDate, type RecurrenceDateRole } from "../dates";
import { occurrenceId, recurrenceKey } from "../occurrence-id";
import { DEFAULT_MAX_ITERATIONS, expandRecurrenceRule } from "../rule/expand";
import type {
  EventRecurrence,
  OccurrenceExpander,
  OccurrenceExpanderOptions,
  OccurrenceExpansion,
  OccurrenceRange,
  RecurrenceAdapters,
  RecurrenceDate,
  RecurrenceIssue,
  RecurrenceOccurrence,
  RecurrenceOverride,
  RecurrenceRule,
  RecurrenceRuleExpansion,
  RecurrenceRuleStart,
} from "../types";
import {
  compareDates,
  dateTypes,
  durationBetween,
  intervalOf,
  isInterval,
  isTimeZone,
  kindOf,
  rangeBounds,
  sameInterval,
} from "./clock";

// How many ranges each series remembers, and how many rule windows.
const rangesPerSeries = 4;
const windowsPerSeries = 8;
// A nominal DURATION lasts more or less than its exact time across DST; the rule window starts
// this much earlier to cover it.
const nominalMargin = Temporal.Duration.from({ days: 2 });

type Issue<TEvent, TEventId extends EventId> = RecurrenceIssue<TEvent, TEventId>;
/** An issue before it learns its event's position in the input. */
type IssueDraft<TEvent, TEventId extends EventId> = Omit<Issue<TEvent, TEventId>, "index">;
type Occurrence<TEvent, TEventId extends EventId> = RecurrenceOccurrence<TEvent, TEventId>;

/** What a series' master says, read once per master object. */
interface SeriesPlan<TEvent, TEventId extends EventId> {
  /** Date-only EXDATE keys on timed and floating series, which exclude the whole day. */
  readonly exceptionDays: ReadonlySet<string>;
  /** EXDATE keys. */
  readonly exceptions: ReadonlySet<string>;
  /** RDATEs in the series' kind, in order and without duplicates. */
  readonly extraDates: readonly RecurrenceDate[];
  readonly first: CalendarEventInterval;
  readonly issues: readonly IssueDraft<TEvent, TEventId>[];
  /** The first occurrence's exact length, or the DURATION's nominal one. */
  readonly length: Temporal.Duration;
  readonly nominal: boolean;
  readonly rule: RecurrenceRule | undefined;
  readonly start: RecurrenceRuleStart;
  /** Where a timed series repeats, and where instants on other series are read. */
  readonly timeZone: string;
}

type RuleDates = RecurrenceRuleExpansion | { readonly error: unknown };

interface OverrideResult<TEvent, TEventId extends EventId> {
  readonly issues: readonly IssueDraft<TEvent, TEventId>[];
  /** Absent for a cancelled override and for one a later override replaced. */
  readonly occurrence?: Occurrence<TEvent, TEventId>;
}

interface SeriesResult<TEvent, TEventId extends EventId> {
  readonly issues: readonly IssueDraft<TEvent, TEventId>[];
  readonly occurrences: readonly Occurrence<TEvent, TEventId>[];
  readonly overrides: ReadonlyMap<
    OverrideRecord<TEvent, TEventId>,
    OverrideResult<TEvent, TEventId>
  >;
}

interface SkippedRecord<TEvent, TEventId extends EventId> {
  readonly issue: IssueDraft<TEvent, TEventId>;
  readonly role: "skipped";
}

interface OneOffRecord<TEvent, TEventId extends EventId> {
  readonly occurrence: Occurrence<TEvent, TEventId>;
  readonly role: "one-off";
}

interface MasterRecord<TEvent, TEventId extends EventId> {
  readonly event: TEvent;
  readonly id: TEventId;
  readonly interval: CalendarEventInterval;
  plan?: SeriesPlan<TEvent, TEventId> | IssueDraft<TEvent, TEventId>;
  /** The last expansion's occurrences by recurrence key, reused when they come out the same. */
  pool: ReadonlyMap<string, Occurrence<TEvent, TEventId>>;
  readonly ranges: Map<
    string,
    {
      readonly overrides: readonly OverrideRecord<TEvent, TEventId>[];
      readonly result: SeriesResult<TEvent, TEventId>;
    }
  >;
  readonly recurrence: EventRecurrence;
  readonly role: "master";
  readonly windows: Map<string, RuleDates>;
}

interface OverrideRecord<TEvent, TEventId extends EventId> {
  readonly event: TEvent;
  readonly id: TEventId;
  readonly interval: CalendarEventInterval;
  /** Problems with the event itself, such as a recurrence it can't have. */
  readonly issues: readonly IssueDraft<TEvent, TEventId>[];
  readonly override: RecurrenceOverride<TEventId>;
  readonly role: "override";
  /** The occurrence it last showed as, reused while its series and recurrence ID stay. */
  shown?: {
    readonly key: string;
    readonly occurrence: Occurrence<TEvent, TEventId>;
    readonly series: TEvent | undefined;
  };
}

type EventRecord<TEvent, TEventId extends EventId> =
  | MasterRecord<TEvent, TEventId>
  | OneOffRecord<TEvent, TEventId>
  | OverrideRecord<TEvent, TEventId>
  | SkippedRecord<TEvent, TEventId>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isObject(value: unknown): value is object {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function sameItems<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function remember<K, V>(map: Map<K, V>, key: K, value: V, capacity: number): void {
  map.delete(key);
  map.set(key, value);
  if (map.size > capacity) map.delete(map.keys().next().value as K);
}

/** An engine error as an issue code: the baseline engine says which rules it doesn't support. */
function ruleProblem(error: unknown): "invalid-rule" | "unsupported-rule" {
  return error instanceof RangeError && /isn't supported/.test(error.message)
    ? "unsupported-rule"
    : "invalid-rule";
}

function endOf<TEvent, TEventId extends EventId>(
  plan: SeriesPlan<TEvent, TEventId>,
  start: RecurrenceDate,
): RecurrenceDate {
  const { length } = plan;
  if (start instanceof Temporal.Instant) {
    return plan.nominal
      ? start.toZonedDateTimeISO(plan.timeZone).add(length).toInstant()
      : start.add(length);
  }
  if (start instanceof Temporal.PlainDate && plan.nominal) {
    // As `getEventEnd` does: a time part, which a date's DURATION shouldn't have, rounds up.
    return start.add(
      length.round({
        largestUnit: "day",
        relativeTo: start,
        roundingMode: "expand",
        smallestUnit: "day",
      }),
    );
  }
  return start.add(length);
}

/** The earliest original start whose occurrence can still reach `rangeStart`. */
function reachOf<TEvent, TEventId extends EventId>(
  plan: SeriesPlan<TEvent, TEventId>,
  rangeStart: RecurrenceDate,
): RecurrenceDate {
  const { length } = plan;
  if (rangeStart instanceof Temporal.Instant) {
    if (!plan.nominal) return rangeStart.subtract(length);
    const zoned = rangeStart.toZonedDateTimeISO(plan.timeZone);
    return zoned.subtract(length).subtract(nominalMargin).toInstant();
  }
  const reach = rangeStart.subtract(length);
  return plan.nominal ? reach.subtract(nominalMargin) : reach;
}

/**
 * Expands the application's events into what the calendar shows for a range: each series' master
 * becomes its occurrences that overlap the range, overrides replace the occurrences they name, and
 * one-off events pass through. Problems become issues, with the event's input position, rather
 * than exceptions.
 *
 * - Pass the calendar's `loadRange`. Timed series compare instants, the range's dates at the start
 *   of day in `timeZone`; all-day series compare dates and floating ones wall times. An occurrence
 *   overlapping the range counts, even one that starts before it.
 * - Every occurrence lasts exactly as long as the first, or the recurrence's nominal `duration` in
 *   the series' time zone (RFC 5545 §3.8.5.3). Timed series repeat in `sourceTimeZone`, else
 *   `defaultTimeZone`, else UTC.
 * - EXDATE removes the occurrence with that original start, and a date-only one every occurrence
 *   starting that day. RDATE adds one, once even when the rule has it too. Dates of another kind
 *   go through `coerceRecurrenceDate`; one it can't convert is dropped with `date-kind-mismatch`.
 * - Overrides and one-off events pass through whatever the range. An override takes the ID of the
 *   occurrence it replaces, and hides it; a cancelled one only hides it. Of two overrides for the
 *   same occurrence the later wins (`duplicate-override`). One whose master is missing keeps that
 *   ID, without `series`, and reports `missing-series`. An event with both a recurrence and an
 *   override is an override; its recurrence is ignored with `unsupported-rule`.
 * - Output follows the input order of events, each series' occurrences in time order. Two masters
 *   with one ID both expand, and the snapshot reports their duplicate IDs, as it does for others.
 *
 * Work is reused for events that are the same objects as before: each series remembers its last
 * few ranges and rule windows, and an occurrence that comes out the same keeps its object, so
 * memoized views don't re-render. Treat events as immutable.
 */
export function createOccurrenceExpander<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  adapters: RecurrenceAdapters<TEvent, TEventId, TResourceId>,
  options: OccurrenceExpanderOptions = {},
): OccurrenceExpander<TEvent, TEventId> {
  type Draft = IssueDraft<TEvent, TEventId>;
  type Master = MasterRecord<TEvent, TEventId>;
  type Override = OverrideRecord<TEvent, TEventId>;
  type Plan = SeriesPlan<TEvent, TEventId>;
  type Record = EventRecord<TEvent, TEventId>;
  type Result = SeriesResult<TEvent, TEventId>;

  const defaultTimeZone = options.defaultTimeZone ?? "UTC";
  const records = new WeakMap<object, Record>();
  const noOverrides: readonly Override[] = Object.freeze([]);
  let last:
    | {
        readonly events: readonly TEvent[];
        readonly key: string;
        readonly result: OccurrenceExpansion<TEvent, TEventId>;
      }
    | undefined;

  function draft(
    code: Draft["code"],
    event: TEvent,
    eventId: TEventId | undefined,
    message: string,
  ): Draft {
    return { code, event, ...(eventId === undefined ? {} : { eventId }), message };
  }

  function read(event: TEvent): Record {
    let accessor = "getId";
    let eventId: TEventId | undefined;
    try {
      const id = adapters.event.getId(event);
      eventId = id;
      accessor = "getRecurrence";
      const recurrence = adapters.recurrence.getRecurrence(event);
      accessor = "getOverride";
      const override = adapters.recurrence.getOverride?.(event);
      if (override !== undefined && kindOf(override.recurrenceId) === undefined) {
        throw new TypeError("recurrenceId isn't a Temporal date");
      }
      accessor = "getInterval";
      const interval = adapters.event.getInterval(event);
      if (override !== undefined) {
        if (!isInterval(interval)) throw new TypeError("not a valid event interval");
        const issues =
          recurrence === undefined
            ? []
            : [draft("unsupported-rule", event, id, "An override's own recurrence is ignored.")];
        return { event, id, interval, issues, override, role: "override" };
      }
      if (recurrence !== undefined) {
        if (!isInterval(interval)) throw new TypeError("not a valid event interval");
        return {
          event,
          id,
          interval,
          pool: new Map(),
          ranges: new Map(),
          recurrence,
          role: "master",
          windows: new Map(),
        };
      }
      // The snapshot validates one-off events, as it does without recurrence.
      return { occurrence: Object.freeze({ event, id, interval }), role: "one-off" };
    } catch (error) {
      const message = `${accessor}: ${errorMessage(error)}`;
      return { issue: draft("adapter-error", event, eventId, message), role: "skipped" };
    }
  }

  function recordOf(event: TEvent): Record {
    if (!isObject(event)) return read(event);
    let record = records.get(event);
    if (record === undefined) {
      record = read(event);
      records.set(event, record);
    }
    return record;
  }

  function plan(master: Master): Plan | Draft {
    const { event, id, interval: first, recurrence } = master;
    const timeZone =
      first.kind === "timed" ? (first.sourceTimeZone ?? defaultTimeZone) : defaultTimeZone;
    const dates = [
      recurrence.rule?.until,
      ...(recurrence.exceptionDates ?? []),
      ...(recurrence.recurrenceDates ?? []),
    ];
    const usesZone =
      first.kind === "timed" || dates.some((date) => date instanceof Temporal.Instant);
    if (usesZone && !isTimeZone(timeZone)) {
      return draft("invalid-time-zone", event, id, `${timeZone} isn't a time zone.`);
    }

    const issues: Draft[] = [];
    const coerce = (
      values: readonly RecurrenceDate[] | undefined,
      name: string,
      role: RecurrenceDateRole,
    ): RecurrenceDate[] => {
      const coerced: RecurrenceDate[] = [];
      let dropped = 0;
      for (const value of values ?? []) {
        if (kindOf(value) === undefined) throw new TypeError(`${name} holds a non-date value.`);
        const date = coerceRecurrenceDate(value, first, role, { timeZone });
        if (date === undefined) dropped += 1;
        else coerced.push(date);
      }
      if (dropped > 0) {
        const count = dropped === 1 ? "1 date" : `${dropped} dates`;
        const message = `${name}: ${count} can't be a ${dateTypes[first.kind]}; dropped.`;
        issues.push(draft("date-kind-mismatch", event, id, message));
      }
      return coerced;
    };

    const exceptions = new Set<string>();
    const exceptionDays = new Set<string>();
    for (const date of coerce(recurrence.exceptionDates, "exceptionDates", "exception")) {
      (kindOf(date) === first.kind ? exceptions : exceptionDays).add(recurrenceKey(date));
    }
    const extraDates = new Map<string, RecurrenceDate>();
    for (const date of coerce(recurrence.recurrenceDates, "recurrenceDates", "start")) {
      extraDates.set(recurrenceKey(date), date);
    }
    let { rule } = recurrence;
    if (rule?.until !== undefined) {
      const [until] = coerce([rule.until], "until", "until");
      rule = { ...rule, until };
    }

    const start: RecurrenceRuleStart =
      first.kind !== "timed"
        ? first
        : {
            ...first,
            sourceTimeZone: timeZone,
            ...(recurrence.wallStart === undefined ? {} : { wallStart: recurrence.wallStart }),
          };
    return {
      exceptionDays,
      exceptions,
      extraDates: [...extraDates.values()].sort(compareDates),
      first,
      issues,
      length: recurrence.duration ?? durationBetween(first.start, first.end),
      nominal: recurrence.duration !== undefined,
      rule,
      start,
      timeZone,
    };
  }

  function excluded(plan: Plan, start: RecurrenceDate, key: string): boolean {
    if (plan.exceptions.has(key)) return true;
    if (plan.exceptionDays.size === 0) return false;
    const day =
      start instanceof Temporal.Instant
        ? start.toZonedDateTimeISO(plan.timeZone).toPlainDate()
        : start instanceof Temporal.PlainDateTime
          ? start.toPlainDate()
          : start;
    return plan.exceptionDays.has(recurrenceKey(day));
  }

  function ruleDates(
    master: Master,
    plan: Plan,
    from: RecurrenceDate,
    before: RecurrenceDate,
  ): RuleDates {
    const key = `${String(from)}/${String(before)}`;
    let dates = master.windows.get(key);
    if (dates === undefined) {
      if (plan.rule === undefined) {
        const { start } = plan.first;
        const inside = compareDates(start, from) >= 0 && compareDates(start, before) < 0;
        dates = { dates: inside ? [start] : [], truncated: false };
      } else {
        try {
          dates = expandRecurrenceRule(plan.rule, plan.start, {
            before,
            from,
            ...(options.maxIterations === undefined
              ? {}
              : { maxIterations: options.maxIterations }),
          });
        } catch (error) {
          dates = { error };
        }
      }
    }
    remember(master.windows, key, dates, windowsPerSeries);
    return dates;
  }

  function overrideOccurrence(
    override: Override,
    series: TEvent | undefined,
    seriesId: TEventId,
    recurrenceId: RecurrenceDate,
  ): Occurrence<TEvent, TEventId> {
    const key = recurrenceKey(recurrenceId);
    const { shown } = override;
    if (shown !== undefined && shown.series === series && shown.key === key) {
      return shown.occurrence;
    }
    const { event } = override;
    const occurrence = Object.freeze({
      event,
      id: occurrenceId(seriesId, recurrenceId),
      interval: override.interval,
      recurrence: Object.freeze({
        override: event,
        recurrenceId,
        ...(series === undefined ? {} : { series }),
        seriesId,
      }),
    });
    override.shown = { key, occurrence, series };
    return occurrence;
  }

  /**
   * Which occurrences a series' overrides replace, by key, and what each override shows. `coerce`
   * brings a recurrence ID into the series' kind, or gives `undefined` when it can't.
   */
  function resolveOverrides(
    master: Master,
    overrides: readonly Override[],
    coerce: (date: RecurrenceDate) => RecurrenceDate | undefined,
  ): { readonly replaced: ReadonlySet<string>; readonly results: Result["overrides"] } {
    const results = new Map<Override, OverrideResult<TEvent, TEventId>>();
    const winners = new Map<string, Override>();
    const shows = (override: Override, recurrenceId: RecurrenceDate) =>
      override.override.cancelled === true
        ? {}
        : { occurrence: overrideOccurrence(override, master.event, master.id, recurrenceId) };

    for (const override of overrides) {
      const { recurrenceId } = override.override;
      const coerced = coerce(recurrenceId);
      if (coerced === undefined) {
        // It can't name an occurrence, so it shows on its own and replaces none.
        const type = dateTypes[master.interval.kind];
        const message = `recurrenceId can't be a ${type} like its series' start.`;
        const issues = [draft("date-kind-mismatch", override.event, override.id, message)];
        results.set(override, { issues, ...shows(override, recurrenceId) });
        continue;
      }
      const key = recurrenceKey(coerced);
      const earlier = winners.get(key);
      if (earlier !== undefined) {
        const message = `A later override replaces the same occurrence, ${key}.`;
        const issue = draft("duplicate-override", earlier.event, earlier.id, message);
        results.set(earlier, { issues: [issue] });
      }
      winners.set(key, override);
      results.set(override, { issues: [], ...shows(override, coerced) });
    }
    return { replaced: new Set(winners.keys()), results };
  }

  function expandSeries(
    master: Master,
    plan: Plan,
    overrides: readonly Override[],
    range: { readonly end: RecurrenceDate; readonly start: RecurrenceDate },
  ): Result {
    const { event: series, id: seriesId } = master;
    const issues: Draft[] = [...plan.issues];
    const { replaced, results } = resolveOverrides(master, overrides, (date) =>
      coerceRecurrenceDate(date, plan.first, "start", { timeZone: plan.timeZone }),
    );

    const occurrences: Occurrence<TEvent, TEventId>[] = [];
    if (compareDates(range.start, range.end) >= 0) {
      return { issues, occurrences, overrides: results };
    }

    // The original starts whose occurrences may overlap the range.
    const from = reachOf(plan, range.start);
    const before = range.end;
    const starts = new Map<string, RecurrenceDate>();
    const dates = ruleDates(master, plan, from, before);
    if ("error" in dates) {
      issues.push(draft(ruleProblem(dates.error), series, seriesId, errorMessage(dates.error)));
      // The first occurrence is always one, so it still shows.
      const { start } = plan.first;
      if (compareDates(start, from) >= 0 && compareDates(start, before) < 0) {
        starts.set(recurrenceKey(start), start);
      }
    } else {
      if (dates.truncated) {
        const steps = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;
        const message = `The rule stopped after ${steps} steps.`;
        issues.push(draft("iteration-limit", series, seriesId, message));
      }
      for (const date of dates.dates) starts.set(recurrenceKey(date), date);
    }
    for (const date of plan.extraDates) {
      if (compareDates(date, from) >= 0 && compareDates(date, before) < 0) {
        starts.set(recurrenceKey(date), date);
      }
    }

    const pool = new Map<string, Occurrence<TEvent, TEventId>>();
    for (const [key, start] of starts) {
      if (replaced.has(key) || excluded(plan, start, key)) continue;
      const end = endOf(plan, start);
      const overlaps =
        compareDates(start, range.end) < 0 &&
        (compareDates(end, range.start) > 0 || compareDates(start, range.start) >= 0);
      if (!overlaps) continue;

      const interval = intervalOf(start, end, plan.first);
      const previous = master.pool.get(key);
      const occurrence =
        previous !== undefined && sameInterval(previous.interval, interval)
          ? previous
          : Object.freeze({
              event: series,
              id: occurrenceId(seriesId, start),
              interval,
              recurrence: Object.freeze({ recurrenceId: start, series, seriesId }),
            });
      pool.set(key, occurrence);
      occurrences.push(occurrence);
    }
    master.pool = pool;
    occurrences.sort((left, right) => compareDates(left.interval.start, right.interval.start));
    return { issues, occurrences, overrides: results };
  }

  /** A series that can't expand: its overrides still show. */
  function failed(master: Master, overrides: readonly Override[], failure: Draft): Result {
    const { results } = resolveOverrides(master, overrides, (date) =>
      kindOf(date) === master.interval.kind ? date : undefined,
    );
    return { issues: [failure], occurrences: [], overrides: results };
  }

  function seriesResult(
    master: Master,
    overrides: readonly Override[],
    range: OccurrenceRange,
  ): Result {
    master.plan ??= (() => {
      try {
        return plan(master);
      } catch (error) {
        return draft("invalid-rule", master.event, master.id, errorMessage(error));
      }
    })();
    const seriesPlan = master.plan;
    if (!("start" in seriesPlan)) return failed(master, overrides, seriesPlan);

    const { kind } = seriesPlan.first;
    if (kind === "timed" && !isTimeZone(range.timeZone)) {
      const message = `${range.timeZone} isn't a time zone.`;
      return failed(
        master,
        overrides,
        draft("invalid-time-zone", master.event, master.id, message),
      );
    }
    const bounds = rangeBounds(range.range, kind, range.timeZone);
    const key = `${String(bounds.start)}/${String(bounds.end)}`;
    const cached = master.ranges.get(key);
    if (cached !== undefined && sameItems(cached.overrides, overrides)) {
      remember(master.ranges, key, cached, rangesPerSeries);
      return cached.result;
    }

    let result: Result;
    try {
      result = expandSeries(master, seriesPlan, overrides, bounds);
    } catch (error) {
      const failure = draft("invalid-rule", master.event, master.id, errorMessage(error));
      return failed(master, overrides, failure);
    }
    remember(master.ranges, key, { overrides, result }, rangesPerSeries);
    return result;
  }

  return {
    expand(events, range) {
      const key = `${String(range.range.start)}/${String(range.range.end)}/${range.timeZone}`;
      if (last !== undefined && last.key === key && sameItems(last.events, events)) {
        return last.result;
      }

      const eventRecords = events.map(recordOf);
      const masters = new Map<TEventId, Master>();
      const overridesBySeries = new Map<TEventId, Override[]>();
      for (const record of eventRecords) {
        if (record.role === "master") {
          if (!masters.has(record.id)) masters.set(record.id, record);
        } else if (record.role === "override") {
          const { seriesId } = record.override;
          const overrides = overridesBySeries.get(seriesId);
          if (overrides === undefined) overridesBySeries.set(seriesId, [record]);
          else overrides.push(record);
        }
      }

      const results = new Map<Master, Result>();
      const resultFor = (master: Master): Result => {
        let result = results.get(master);
        if (result === undefined) {
          // A second master with the same ID expands on its own; the snapshot reports the IDs.
          const overrides =
            masters.get(master.id) === master
              ? (overridesBySeries.get(master.id) ?? noOverrides)
              : noOverrides;
          result = seriesResult(master, overrides, range);
          results.set(master, result);
        }
        return result;
      };

      const occurrences: Occurrence<TEvent, TEventId>[] = [];
      const issues: Issue<TEvent, TEventId>[] = [];
      const report = (drafts: readonly Draft[], index: number) => {
        for (const issue of drafts) issues.push(Object.freeze({ ...issue, index }));
      };
      eventRecords.forEach((record, index) => {
        switch (record.role) {
          case "skipped":
            report([record.issue], index);
            break;
          case "one-off":
            occurrences.push(record.occurrence);
            break;
          case "master": {
            const result = resultFor(record);
            report(result.issues, index);
            occurrences.push(...result.occurrences);
            break;
          }
          case "override": {
            report(record.issues, index);
            const { cancelled, recurrenceId, seriesId } = record.override;
            const master = masters.get(seriesId);
            if (master === undefined) {
              const message = `No series has the ID ${String(seriesId)}.`;
              report([draft("missing-series", record.event, record.id, message)], index);
              if (cancelled !== true) {
                occurrences.push(overrideOccurrence(record, undefined, seriesId, recurrenceId));
              }
              break;
            }
            const result = resultFor(master).overrides.get(record);
            if (result !== undefined) {
              report(result.issues, index);
              if (result.occurrence !== undefined) occurrences.push(result.occurrence);
            }
            break;
          }
        }
      });

      const result = Object.freeze({
        issues: Object.freeze(issues),
        occurrences: Object.freeze(occurrences),
      });
      last = { events, key, result };
      return result;
    },
  };
}
