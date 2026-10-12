import type { IcsWeekday } from "@moltenship/ics";

import { coerceRecurrenceDate } from "../dates";
import type {
  RecurrenceDate,
  RecurrenceRule,
  RecurrenceRuleExpansion,
  RecurrenceRuleStart,
  RecurrenceRuleWindow,
} from "../types";

// Baseline: DAILY, and WEEKLY with or without BYDAY, with INTERVAL, COUNT, UNTIL and WKST. The
// full RFC 5545 engine (#48) replaces this file and keeps `expandRecurrenceRule`'s contract.

export const DEFAULT_MAX_ITERATIONS = 100_000;

type WallTime = Temporal.PlainDate | Temporal.PlainDateTime;

const weekdayNumbers: Readonly<Record<IcsWeekday, number>> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

function compareDates(left: RecurrenceDate, right: RecurrenceDate): number {
  if (left instanceof Temporal.Instant && right instanceof Temporal.Instant) {
    return Temporal.Instant.compare(left, right);
  }
  if (left instanceof Temporal.PlainDate && right instanceof Temporal.PlainDate) {
    return Temporal.PlainDate.compare(left, right);
  }
  if (left instanceof Temporal.PlainDateTime && right instanceof Temporal.PlainDateTime) {
    return Temporal.PlainDateTime.compare(left, right);
  }
  throw new RangeError("Recurrence dates must match the kind of the series' first occurrence.");
}

const isPositiveInteger = (value: number) => Number.isInteger(value) && value >= 1;

/** Why the rule can't be expanded, for rules built in code rather than parsed. */
function invalid(rule: RecurrenceRule): string | undefined {
  if (rule.interval !== undefined && !isPositiveInteger(rule.interval)) {
    return "INTERVAL must be a positive integer.";
  }
  if (rule.count !== undefined && !isPositiveInteger(rule.count)) {
    return "COUNT must be a positive integer.";
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    return "COUNT and UNTIL can't both be set.";
  }
  const lists = [
    rule.byDay,
    rule.byHour,
    rule.byMinute,
    rule.byMonth,
    rule.byMonthDay,
    rule.bySecond,
    rule.bySetPosition,
    rule.byWeekNumber,
    rule.byYearDay,
  ];
  if (lists.some((list) => list?.length === 0)) return "BY parts must not be empty.";
  return undefined;
}

function unsupported(rule: RecurrenceRule): string | undefined {
  if (rule.frequency !== "DAILY" && rule.frequency !== "WEEKLY") return `FREQ=${rule.frequency}`;
  const parts = [
    ["BYSECOND", rule.bySecond],
    ["BYMINUTE", rule.byMinute],
    ["BYHOUR", rule.byHour],
    ["BYMONTHDAY", rule.byMonthDay],
    ["BYYEARDAY", rule.byYearDay],
    ["BYWEEKNO", rule.byWeekNumber],
    ["BYMONTH", rule.byMonth],
    ["BYSETPOS", rule.bySetPosition],
  ] as const;
  const part = parts.find(([, values]) => values !== undefined);
  if (part !== undefined) return part[0];
  if (rule.byDay !== undefined && rule.frequency === "DAILY") return "BYDAY with FREQ=DAILY";
  if (rule.byDay?.some((day) => day.ordinal !== undefined)) return "BYDAY ordinals";
  return undefined;
}

/** Candidate wall-time starts, in order, from the first occurrence on. */
function* candidates(rule: RecurrenceRule, start: WallTime): Generator<WallTime> {
  const interval = rule.interval ?? 1;
  const date = start instanceof Temporal.PlainDateTime ? start.toPlainDate() : start;
  const at = (day: Temporal.PlainDate): WallTime =>
    start instanceof Temporal.PlainDateTime ? day.toPlainDateTime(start.toPlainTime()) : day;

  if (rule.frequency === "DAILY" || rule.byDay === undefined) {
    const step = rule.frequency === "DAILY" ? { days: interval } : { weeks: interval };
    for (let day = date; ; day = day.add(step)) yield at(day);
  }

  yield start;
  const weekStart = weekdayNumbers[rule.weekStart ?? "MO"];
  const offsets = [
    ...new Set(rule.byDay.map(({ weekday }) => (weekdayNumbers[weekday] - weekStart + 7) % 7)),
  ].sort((left, right) => left - right);
  const firstWeek = date.subtract({ days: (date.dayOfWeek - weekStart + 7) % 7 });
  for (let week = firstWeek; ; week = week.add({ weeks: interval })) {
    for (const offset of offsets) {
      const day = week.add({ days: offset });
      if (Temporal.PlainDate.compare(day, date) > 0) yield at(day);
    }
  }
}

/**
 * The starts of a rule's occurrences inside `window`, beginning with the first occurrence, which
 * is always one, even before UNTIL. Timed series repeat on the wall clock of
 * `first.sourceTimeZone`, or UTC, from `first.wallStart` when the first start was written in a DST
 * gap; a later start in a gap moves forward and counts, a repeated time takes its first instant.
 * Throws a `RangeError` for a rule it can't expand, or an UNTIL that can't take the series' kind.
 */
export function expandRecurrenceRule(
  rule: RecurrenceRule,
  first: RecurrenceRuleStart,
  window: RecurrenceRuleWindow = {},
): RecurrenceRuleExpansion {
  const problem = invalid(rule) ?? unsupported(rule);
  if (problem !== undefined) {
    throw new RangeError(problem.endsWith(".") ? problem : `${problem} isn't supported yet.`);
  }
  const until =
    rule.until === undefined ? undefined : coerceRecurrenceDate(rule.until, first, "until");
  if (rule.until !== undefined && until === undefined) {
    throw new RangeError("UNTIL can't take the kind of the series' first occurrence.");
  }

  const timeZone = first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC";
  const wallStart: WallTime =
    first.kind === "timed"
      ? (first.wallStart ?? first.start.toZonedDateTimeISO(timeZone).toPlainDateTime())
      : first.start;
  // The first occurrence keeps its exact start, which a repeated wall time can't round-trip to.
  const toDate = (wall: WallTime, index: number): RecurrenceDate =>
    first.kind !== "timed"
      ? wall
      : index === 0
        ? first.start
        : (wall as Temporal.PlainDateTime)
            .toZonedDateTime(timeZone, { disambiguation: "compatible" })
            .toInstant();

  const maxIterations = window.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const dates: RecurrenceDate[] = [];
  let previous: RecurrenceDate | undefined;
  let produced = 0;
  let steps = 0;
  for (const wall of candidates(rule, wallStart)) {
    const date = toDate(wall, steps);
    if (steps > 0 && until !== undefined && compareDates(date, until) > 0) break;
    if (window.before !== undefined && compareDates(date, window.before) >= 0) break;
    if (steps >= maxIterations) return { dates, truncated: true };
    steps += 1;
    if (previous !== undefined && compareDates(date, previous) <= 0) continue;
    previous = date;
    produced += 1;
    if (window.from === undefined || compareDates(date, window.from) >= 0) dates.push(date);
    if (rule.count !== undefined && produced >= rule.count) break;
  }
  return { dates, truncated: false };
}
