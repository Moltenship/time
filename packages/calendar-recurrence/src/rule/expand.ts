import type { CalendarEventInterval } from "@moltenship/calendar-core";
import type { IcsWeekday } from "@moltenship/ics";

import type { RecurrenceDate, RecurrenceRule } from "../types";

// Baseline: DAILY, and WEEKLY with or without BYDAY, with INTERVAL, COUNT, UNTIL and WKST. The
// full RFC 5545 engine (#48) replaces this file and keeps `expandRecurrenceRule`'s contract.

export interface RecurrenceRuleWindow {
  /** Stops before occurrences starting at or after this. */
  readonly before?: RecurrenceDate;
  /** Leaves out occurrences starting before this. COUNT still counts them. */
  readonly from?: RecurrenceDate;
  /** Most candidate starts to look at. Defaults to `DEFAULT_MAX_ITERATIONS`. */
  readonly maxIterations?: number;
}

export interface RecurrenceRuleExpansion {
  /** Occurrence starts in order, in the kind of the first occurrence. */
  readonly dates: readonly RecurrenceDate[];
  /** `maxIterations` ran out before the rule or the window ended. */
  readonly truncated: boolean;
}

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
 * RFC 5545 always counts. Timed series repeat on the wall clock of `first.sourceTimeZone`, or UTC,
 * and a start in a DST gap moves forward as RFC 5545 §3.3.10 says. Throws a `RangeError` for a
 * rule it can't expand, or dates whose kind doesn't match `first`.
 */
export function expandRecurrenceRule(
  rule: RecurrenceRule,
  first: CalendarEventInterval,
  window: RecurrenceRuleWindow = {},
): RecurrenceRuleExpansion {
  const part = unsupported(rule);
  if (part !== undefined) throw new RangeError(`${part} isn't supported yet.`);

  const timeZone = first.kind === "timed" ? (first.sourceTimeZone ?? "UTC") : "UTC";
  const wallStart: WallTime =
    first.kind === "timed"
      ? first.start.toZonedDateTimeISO(timeZone).toPlainDateTime()
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
  let produced = 0;
  let iterations = 0;
  for (const wall of candidates(rule, wallStart)) {
    if (iterations >= maxIterations) return { dates, truncated: true };
    const date = toDate(wall, iterations);
    iterations += 1;
    if (rule.until !== undefined && compareDates(date, rule.until) > 0) break;
    if (window.before !== undefined && compareDates(date, window.before) >= 0) break;
    produced += 1;
    if (window.from === undefined || compareDates(date, window.from) >= 0) dates.push(date);
    if (rule.count !== undefined && produced >= rule.count) break;
  }
  return { dates, truncated: false };
}
