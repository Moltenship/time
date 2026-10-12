import type { IcsWeekday, IcsWeekdayNumber } from "@moltenship/ics";

import type { RecurrenceRule } from "../types";

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

export type ShiftedRule = { readonly rule: RecurrenceRule } | { readonly problem: string };

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

function shiftDays(rule: MutableRule, shift: RuleShift): string | undefined {
  const { days } = shift;
  if (days === 0) return undefined;
  if (rule.bySetPosition !== undefined) return "A BYSETPOS rule can't move to another day.";
  if (rule.byWeekNumber !== undefined) return "A BYWEEKNO rule can't move to another day.";

  const periodic = rule.frequency === "MONTHLY" || rule.frequency === "YEARLY";
  const limit = rule.frequency === "MONTHLY" || rule.byMonth !== undefined ? 5 : 53;
  let problem: string | undefined;
  if (rule.byDay !== undefined) {
    rule.byDay = rule.byDay.map(({ ordinal, weekday }): IcsWeekdayNumber => {
      const moved = shiftWeekday(weekday, days);
      if (ordinal === undefined) return { weekday: moved };
      if (!periodic) return { ordinal, weekday: moved };
      // "The 2nd Tuesday" a day later is the 2nd Wednesday; a week later, the 3rd Tuesday.
      const next = ordinal + Math.round(days / 7);
      if (next === 0 || Math.sign(next) !== Math.sign(ordinal) || Math.abs(next) > limit) {
        problem = `${ordinal}${weekday} moved by ${days} days leaves the period.`;
      }
      return { ordinal: next, weekday: moved };
    });
  }
  if (rule.byMonthDay !== undefined) {
    rule.byMonthDay = rule.byMonthDay.map((day) => {
      const next = day + days;
      if (day > 0 ? next < 1 || next > 31 : next > -1 || next < -31) {
        problem = `BYMONTHDAY=${day} moved by ${days} days leaves the month.`;
      }
      return next;
    });
  }
  if (rule.byYearDay !== undefined) {
    rule.byYearDay = rule.byYearDay.map((day) => {
      const next = day + days;
      if (day > 0 ? next < 1 || next > 366 : next > -1 || next < -366) {
        problem = `BYYEARDAY=${day} moved by ${days} days leaves the year.`;
      }
      return next;
    });
  }
  // In a monthly or yearly rule BYMONTH places the occurrences, so it follows the first one into
  // another month, unless ordinal weekdays count within the month. In a daily or weekly rule it
  // filters, as "every day in December" does, so it stays.
  const months =
    shift.firstAfter.year * 12 +
    shift.firstAfter.month -
    (shift.firstBefore.year * 12 + shift.firstBefore.month);
  if (
    periodic &&
    rule.byMonth !== undefined &&
    months !== 0 &&
    !rule.byDay?.some(({ ordinal }) => ordinal !== undefined)
  ) {
    rule.byMonth = rule.byMonth.map((month) => ((((month - 1 + months) % 12) + 12) % 12) + 1);
  }
  // A week of a multi-week rule must keep its days together, so its start moves with them.
  if (rule.frequency === "WEEKLY" && (rule.interval ?? 1) > 1 && (rule.byDay?.length ?? 0) > 1) {
    rule.weekStart = shiftWeekday(rule.weekStart ?? "MO", days);
  }
  return problem;
}

/**
 * Moves a rule with its occurrences, so it produces them `shift.days` days and `shift.time` later.
 * Weekdays in BYDAY and month and year days move by the day delta; an ordinal weekday keeps its
 * ordinal for moves of up to three days and moves it by whole weeks beyond (the 2nd Tuesday a day
 * later is the 2nd Wednesday, a week later the 3rd Tuesday). In monthly and yearly rules BYMONTH
 * follows the first occurrence into another month unless BYDAY has ordinals, which count within
 * the month; in daily and weekly ones it filters and stays. BYHOUR, BYMINUTE and
 * BYSECOND move by the time delta, and go when the series becomes all-day. WKST moves with BYDAY
 * when INTERVAL groups several weekdays into weeks. A problem names what can't move: BYSETPOS or
 * BYWEEKNO with a day change, a month day past the month's end, times that cross midnight.
 */
export function shiftRule(rule: RecurrenceRule, shift: RuleShift): ShiftedRule {
  const next: MutableRule = { ...rule };
  const problem = shiftTimes(next, shift) ?? shiftDays(next, shift);
  return problem === undefined ? { rule: next } : { problem };
}
