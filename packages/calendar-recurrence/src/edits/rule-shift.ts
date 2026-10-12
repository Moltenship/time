import type { IcsWeekday, IcsWeekdayNumber } from "@moltenship/ics";

import type { RecurrenceRule } from "../types";
import type { RecurrenceOrdinalShift } from "./ordinals";

/** How an `"all"` or `"following"` edit moves the series' occurrences, in the series' own time. */
export interface RuleShift {
  /** Calendar days the edited occurrence's date moves. */
  readonly days: number;
  /** The first occurrence's wall time before the edit, which BY parts the rule leaves out take. */
  readonly firstBefore: Temporal.PlainDateTime;
  /** The new first occurrence's wall time, which those parts must then match. */
  readonly firstAfter: Temporal.PlainDateTime;
  /** How far the edited occurrence's time of day moves, without the days. */
  readonly time: Temporal.Duration;
  /** The series becomes all-day. */
  readonly toAllDay: boolean;
}

export type ShiftedRule =
  | { readonly ordinals?: RecurrenceOrdinalShift; readonly rule: RecurrenceRule }
  | { readonly problem: string };

type MutableRule = { -readonly [Key in keyof RecurrenceRule]: RecurrenceRule[Key] };

const weekdays: readonly IcsWeekday[] = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const secondsPerDay = 86_400;

function shiftWeekday(weekday: IcsWeekday, days: number): IcsWeekday {
  return weekdays[(((weekdays.indexOf(weekday) + days) % 7) + 7) % 7]!;
}

const unique = (values: readonly number[]) =>
  [...new Set(values)].sort((left, right) => left - right);

function shiftTimes(rule: MutableRule, shift: RuleShift): string | undefined {
  if (rule.byHour === undefined && rule.byMinute === undefined && rule.bySecond === undefined) {
    return undefined;
  }
  const { firstBefore } = shift;
  const times: number[] = [];
  for (const hour of rule.byHour ?? [firstBefore.hour]) {
    for (const minute of rule.byMinute ?? [firstBefore.minute]) {
      for (const second of rule.bySecond ?? [firstBefore.second]) {
        times.push(hour * 3600 + minute * 60 + second);
      }
    }
  }

  if (shift.toAllDay) {
    if (unique(times).length > 1) {
      return "A rule with several times a day can't become all-day.";
    }
    delete rule.byHour;
    delete rule.byMinute;
    delete rule.bySecond;
    return undefined;
  }

  const nanoseconds = shift.time.total("nanoseconds");
  if (nanoseconds === 0) return undefined;
  if (nanoseconds % 1e9 !== 0) return "BYHOUR, BYMINUTE and BYSECOND move by whole seconds only.";
  const shifted = times.map((time) => time + nanoseconds / 1e9);
  if (shifted.some((time) => time < 0 || time >= secondsPerDay)) {
    return "The rule's times of day would cross midnight.";
  }

  const hours = unique(shifted.map((time) => Math.floor(time / 3600)));
  const minutes = unique(shifted.map((time) => Math.floor((time % 3600) / 60)));
  const seconds = unique(shifted.map((time) => time % 60));
  if (hours.length * minutes.length * seconds.length !== unique(shifted).length) {
    return "The moved times of day don't combine into BYHOUR, BYMINUTE and BYSECOND.";
  }
  // A part the rule leaves out comes from the first occurrence, so it must land there too.
  const { firstAfter } = shift;
  const follows = (explicit: boolean, values: readonly number[], actual: number) =>
    explicit || (values.length === 1 && values[0] === actual);
  if (
    !follows(rule.byHour !== undefined, hours, firstAfter.hour) ||
    !follows(rule.byMinute !== undefined, minutes, firstAfter.minute) ||
    !follows(rule.bySecond !== undefined, seconds, firstAfter.second)
  ) {
    return "The rule's times of day don't move with its first occurrence.";
  }
  if (rule.byHour !== undefined) rule.byHour = hours;
  if (rule.byMinute !== undefined) rule.byMinute = minutes;
  if (rule.bySecond !== undefined) rule.bySecond = seconds;
  return undefined;
}

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * The largest month day every period of the rule has, so moving one stays a fixed number of days:
 * 28 for monthly rules, the shortest BYMONTH month's length for yearly ones.
 */
function monthDayLimit(rule: RecurrenceRule): number {
  if (rule.frequency !== "YEARLY" || rule.byMonth === undefined) return 28;
  return Math.min(...rule.byMonth.map((month) => monthLengths[month - 1] ?? 28));
}

function shiftDays(rule: MutableRule, shift: RuleShift): ShiftedRule | string {
  const { days, firstAfter, firstBefore } = shift;
  if (days === 0) return { rule };
  if (rule.bySetPosition !== undefined) return "A BYSETPOS rule can't move to another day.";
  if (rule.byWeekNumber !== undefined) return "A BYWEEKNO rule can't move to another day.";

  const periodic = rule.frequency === "MONTHLY" || rule.frequency === "YEARLY";
  const period = rule.frequency === "MONTHLY" || rule.byMonth !== undefined ? "month" : "year";
  // Every month has four of each weekday and every year 52, so only those move day for day.
  const most = period === "month" ? 4 : 52;
  let problem: string | undefined;
  const ordinals: { from: IcsWeekdayNumber; to: IcsWeekdayNumber }[] = [];
  if (rule.byDay !== undefined) {
    rule.byDay = rule.byDay.map((entry): IcsWeekdayNumber => {
      const { ordinal, weekday } = entry;
      const moved = shiftWeekday(weekday, days);
      if (ordinal === undefined) return { weekday: moved };
      if (!periodic) return { ordinal, weekday: moved };
      // "The 2nd Tuesday" a day later is the 2nd Wednesday; a week later, the 3rd Tuesday.
      const next = ordinal + Math.round(days / 7);
      if (
        next === 0 ||
        Math.sign(next) !== Math.sign(ordinal) ||
        Math.abs(ordinal) > most ||
        Math.abs(next) > most
      ) {
        problem = `${ordinal}${weekday} can't move by ${days} days: not every ${period} has it.`;
      }
      const to = { ordinal: next, weekday: moved };
      ordinals.push({ from: entry, to });
      return to;
    });
  }

  // A month day moves by a fixed number of days only while every month has both days.
  const limit = monthDayLimit(rule);
  const fits = (day: number, most: number) => day !== 0 && Math.abs(day) <= most;
  if (rule.byMonthDay !== undefined) {
    rule.byMonthDay = rule.byMonthDay.map((day) => {
      const next = day + days;
      if (!fits(day, limit) || !fits(next, limit) || Math.sign(next) !== Math.sign(day)) {
        problem = `BYMONTHDAY=${day} can't move by ${days} days: not every month has both days.`;
      }
      return next;
    });
  }
  if (rule.byYearDay !== undefined) {
    rule.byYearDay = rule.byYearDay.map((day) => {
      const next = day + days;
      if (!fits(day, 365) || !fits(next, 365) || Math.sign(next) !== Math.sign(day)) {
        problem = `BYYEARDAY=${day} can't move by ${days} days: not every year has both days.`;
      }
      return next;
    });
  }
  // Without BY parts that place it, a monthly rule repeats on the first occurrence's day, and a
  // yearly one on its date, which must exist every month or year too.
  const implied =
    rule.byDay === undefined && rule.byMonthDay === undefined && rule.byYearDay === undefined;
  if (implied && rule.frequency === "MONTHLY") {
    const sameMonth =
      firstAfter.year === firstBefore.year && firstAfter.month === firstBefore.month;
    if (!sameMonth || firstBefore.day > 28 || firstAfter.day > 28) {
      problem = "A monthly rule can move only to a day of the same month that every month has.";
    }
  }
  // A yearly date moves by the same number of days in every year only if no leap day lies between.
  if (rule.frequency === "YEARLY" && rule.byDay === undefined && rule.byYearDay === undefined) {
    const moved = (year: number) => {
      try {
        const date = Temporal.PlainDate.from(
          { day: firstBefore.day, month: firstBefore.month, year },
          { overflow: "reject" },
        ).add({ days });
        return `${date.month}-${date.day}`;
      } catch {
        return undefined;
      }
    };
    const common = moved(2027);
    if (common === undefined || common !== moved(2028)) {
      problem = "A yearly date can't move across 29 February, which only leap years have.";
    }
  }
  // In a monthly or yearly rule BYMONTH places the occurrences, so it follows the first one into
  // another month, unless ordinal weekdays count within the month. In a daily or weekly rule it
  // filters, as "every day in December" does, so it stays.
  const months =
    firstAfter.year * 12 + firstAfter.month - (firstBefore.year * 12 + firstBefore.month);
  if (periodic && rule.byMonth !== undefined && months !== 0 && ordinals.length === 0) {
    rule.byMonth = rule.byMonth.map((month) => ((((month - 1 + months) % 12) + 12) % 12) + 1);
  }
  // A week of a multi-week rule must keep its days together, so its start moves with them.
  if (rule.frequency === "WEEKLY" && (rule.interval ?? 1) > 1 && (rule.byDay?.length ?? 0) > 1) {
    rule.weekStart = shiftWeekday(rule.weekStart ?? "MO", days);
  }
  if (problem !== undefined) return problem;
  return ordinals.length === 0 ? { rule } : { ordinals: { entries: ordinals, period }, rule };
}

/**
 * Moves a rule with its occurrences, so it produces them `shift.days` days and `shift.time` later.
 *
 * - BYDAY weekdays move by the day delta. An ordinal weekday keeps its ordinal for moves of up to
 *   three days and moves it by whole weeks beyond: the 2nd Tuesday a day later is the 2nd
 *   Wednesday, a week later the 3rd Tuesday. Each occurrence stays in its month, so `ordinals`
 *   says how to move dates, which aren't all the same number of days away.
 * - BYMONTHDAY and BYYEARDAY move by the day delta while every month or year has both days, so the
 *   28th can move to the 27th but not the 29th; the first occurrence's day, which places a monthly
 *   rule without them, likewise.
 * - BYMONTH follows the first occurrence into another month in monthly and yearly rules, unless
 *   ordinal weekdays count within the month; in daily and weekly rules it filters and stays.
 * - BYHOUR, BYMINUTE and BYSECOND move by the time delta, and go when the series becomes all-day.
 * - WKST moves with BYDAY when INTERVAL groups several weekdays into weeks.
 *
 * A problem names what can't move: BYSETPOS or BYWEEKNO with a day change, a month day not every
 * month has, times that cross midnight.
 */
export function shiftRule(rule: RecurrenceRule, shift: RuleShift): ShiftedRule {
  const next: MutableRule = { ...rule };
  const problem = shiftTimes(next, shift);
  if (problem !== undefined) return { problem };
  const shifted = shiftDays(next, shift);
  return typeof shifted === "string" ? { problem: shifted } : shifted;
}
