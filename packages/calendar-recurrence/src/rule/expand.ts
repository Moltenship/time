import type { IcsWeekday } from "@moltenship/ics";

import { coerceRecurrenceDate } from "../dates";
import { RecurrenceRuleError } from "../errors";
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

const frequencies: ReadonlySet<string> = new Set([
  "DAILY",
  "HOURLY",
  "MINUTELY",
  "MONTHLY",
  "SECONDLY",
  "WEEKLY",
  "YEARLY",
]);

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
  throw new RangeError("Window dates must match the kind of the series' first occurrence.");
}

const isPositiveInteger = (value: number) => Number.isInteger(value) && value >= 1;

/** Why the rule can't be expanded, for rules built in code rather than parsed. */
function invalid(rule: RecurrenceRule): string | undefined {
  if (!frequencies.has(rule.frequency)) return `FREQ=${String(rule.frequency)} isn't a frequency.`;
  if (rule.interval !== undefined && !isPositiveInteger(rule.interval)) {
    return "INTERVAL must be a positive integer.";
  }
  if (rule.count !== undefined && !isPositiveInteger(rule.count)) {
    return "COUNT must be a positive integer.";
  }
  if (rule.weekStart !== undefined && !(rule.weekStart in weekdayNumbers)) {
    return `WKST=${String(rule.weekStart)} isn't a weekday.`;
  }
  if (rule.byDay?.some(({ weekday }) => !(weekday in weekdayNumbers))) {
    return "BYDAY holds a value that isn't a weekday.";
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

/**
 * Candidate wall-time starts, in order: the first occurrence, then one per period. Without COUNT,
 * periods that end before `skipTo` are skipped rather than visited.
 */
function* candidates(
  rule: RecurrenceRule,
  start: WallTime,
  skipTo: Temporal.PlainDate | undefined,
): Generator<WallTime> {
  const interval = rule.interval ?? 1;
  const date = start instanceof Temporal.PlainDateTime ? start.toPlainDate() : start;
  const at = (day: Temporal.PlainDate): WallTime =>
    start instanceof Temporal.PlainDateTime ? day.toPlainDateTime(start.toPlainTime()) : day;
  const periodDays = rule.frequency === "DAILY" ? interval : interval * 7;
  const periodsBefore = (from: Temporal.PlainDate) =>
    skipTo === undefined ? 0 : Math.max(0, Math.floor(from.until(skipTo).days / periodDays) - 1);

  yield start;
  if (rule.frequency === "DAILY" || rule.byDay === undefined) {
    for (let period = Math.max(1, periodsBefore(date)); ; period += 1) {
      yield at(date.add({ days: period * periodDays }));
    }
  }

  const weekStart = weekdayNumbers[rule.weekStart ?? "MO"];
  const offsets = [
    ...new Set(rule.byDay.map(({ weekday }) => (weekdayNumbers[weekday] - weekStart + 7) % 7)),
  ].sort((left, right) => left - right);
  const firstWeek = date.subtract({ days: (date.dayOfWeek - weekStart + 7) % 7 });
  for (let period = periodsBefore(firstWeek); ; period += 1) {
    const week = firstWeek.add({ days: period * periodDays });
    for (const offset of offsets) {
      const day = week.add({ days: offset });
      if (Temporal.PlainDate.compare(day, date) > 0) yield at(day);
    }
  }
}

function validTimeZone(start: Temporal.Instant, timeZone: string): boolean {
  try {
    start.toZonedDateTimeISO(timeZone);
    return true;
  } catch {
    return false;
  }
}

/**
 * The starts of a rule's occurrences inside `window`, beginning with the first occurrence, which
 * is always one, even before UNTIL. Timed series repeat on the wall clock of
 * `first.sourceTimeZone`, or UTC, from `first.wallStart` when the first start was written in a DST
 * gap; a later start in a gap moves forward and counts, a repeated time takes its first instant.
 * Throws a `RecurrenceRuleError` for a rule it can't expand, and a `RangeError` for a window whose
 * dates don't match the series' kind or an invalid `maxIterations`.
 */
export function expandRecurrenceRule(
  rule: RecurrenceRule,
  first: RecurrenceRuleStart,
  window: RecurrenceRuleWindow = {},
): RecurrenceRuleExpansion {
  const problem = invalid(rule);
  if (problem !== undefined) throw new RecurrenceRuleError("invalid-rule", problem);
  const missing = unsupported(rule);
  if (missing !== undefined) {
    throw new RecurrenceRuleError("unsupported-rule", `${missing} isn't supported yet.`);
  }
  const maxIterations = window.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  if (!isPositiveInteger(maxIterations)) {
    throw new RangeError("maxIterations must be a positive integer.");
  }

  const timeZone = first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC";
  if (first.kind === "timed" && !validTimeZone(first.start, timeZone)) {
    throw new RecurrenceRuleError("invalid-time-zone", `${timeZone} isn't a time zone.`);
  }
  const until =
    rule.until === undefined ? undefined : coerceRecurrenceDate(rule.until, first, "until");

  let wallStart: WallTime;
  if (first.kind === "timed") {
    // A stale wall time, left after the start moved, no longer resolves to it and is ignored.
    const written = first.wallStart?.withCalendar("iso8601");
    const usable =
      written !== undefined &&
      written
        .toZonedDateTime(timeZone, { disambiguation: "compatible" })
        .toInstant()
        .equals(first.start);
    wallStart = usable ? written : first.start.toZonedDateTimeISO(timeZone).toPlainDateTime();
  } else {
    wallStart = first.start.withCalendar("iso8601");
  }
  // The first occurrence keeps its exact start, which a repeated wall time can't round-trip to.
  const toDate = (wall: WallTime, index: number): RecurrenceDate =>
    first.kind !== "timed"
      ? wall
      : index === 0
        ? first.start
        : (wall as Temporal.PlainDateTime)
            .toZonedDateTime(timeZone, { disambiguation: "compatible" })
            .toInstant();

  const from = window.from;
  const skipTo =
    rule.count !== undefined || from === undefined
      ? undefined
      : from instanceof Temporal.Instant
        ? from.toZonedDateTimeISO(timeZone).toPlainDate()
        : from instanceof Temporal.PlainDateTime
          ? from.toPlainDate()
          : from;

  const dates: RecurrenceDate[] = [];
  let previous: RecurrenceDate | undefined;
  let produced = 0;
  let steps = 0;
  for (const wall of candidates(rule, wallStart, skipTo?.withCalendar("iso8601"))) {
    const date = toDate(wall, steps);
    if (steps > 0 && until !== undefined && compareDates(date, until) > 0) break;
    if (window.before !== undefined && compareDates(date, window.before) >= 0) break;
    if (steps >= maxIterations) return { dates, truncated: true };
    steps += 1;
    if (previous !== undefined && compareDates(date, previous) <= 0) continue;
    previous = date;
    produced += 1;
    if (from === undefined || compareDates(date, from) >= 0) dates.push(date);
    if (rule.count !== undefined && produced >= rule.count) break;
  }
  return { dates, truncated: false };
}
