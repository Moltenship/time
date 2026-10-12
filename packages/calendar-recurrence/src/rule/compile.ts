import type { IcsFrequency, IcsWeekday } from "@moltenship/ics";

import { RecurrenceRuleError } from "../errors";
import type { RecurrenceRule } from "../types";

/** FREQ, from the longest period to the shortest. */
export const Frequency = {
  Yearly: 0,
  Monthly: 1,
  Weekly: 2,
  Daily: 3,
  Hourly: 4,
  Minutely: 5,
  Secondly: 6,
} as const;

export type Frequency = (typeof Frequency)[keyof typeof Frequency];

const FREQUENCIES: Readonly<Record<IcsFrequency, Frequency>> = {
  YEARLY: Frequency.Yearly,
  MONTHLY: Frequency.Monthly,
  WEEKLY: Frequency.Weekly,
  DAILY: Frequency.Daily,
  HOURLY: Frequency.Hourly,
  MINUTELY: Frequency.Minutely,
  SECONDLY: Frequency.Secondly,
};

const WEEKDAYS: Readonly<Record<IcsWeekday, number>> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

/** The first occurrence's wall-clock fields, which fill in what the rule leaves out. */
export interface RuleStart {
  readonly allDay: boolean;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly second: number;
  /** ISO weekday, Monday 1. */
  readonly weekday: number;
}

export interface OrdinalWeekday {
  readonly ordinal: number;
  readonly weekday: number;
}

/**
 * A rule checked and filled in from its start, ready for the loop. Lists that limit the dates are
 * absent when the rule doesn't limit them.
 */
export interface CompiledRule {
  readonly count?: number;
  /** The day parts meet on no date of any year, such as BYMONTH=2;BYMONTHDAY=30. */
  readonly impossible: boolean;
  readonly frequency: Frequency;
  /** Indexed by hour; limits sub-daily periods. */
  readonly hours?: readonly boolean[];
  readonly interval: number;
  /** Indexed by minute; limits MINUTELY and SECONDLY periods. */
  readonly minutes?: readonly boolean[];
  /** BYMONTHDAY, negative values counting from the month's end. */
  readonly monthDays?: ReadonlySet<number>;
  /** Indexed by month. */
  readonly months?: readonly boolean[];
  /** BYDAY entries with an ordinal, which only MONTHLY and YEARLY rules keep. */
  readonly ordinalWeekdays?: readonly OrdinalWeekday[];
  /** Indexed by second; limits SECONDLY periods. */
  readonly seconds?: readonly boolean[];
  readonly setPositions?: readonly number[];
  /** Offsets in seconds from the start of a period's day, or of a sub-daily period, ascending. */
  readonly times: readonly number[];
  /** BYWEEKNO, negative values counting from the year's last week. */
  readonly weekNumbers?: ReadonlySet<number>;
  /** WKST as an ISO weekday. */
  readonly weekStart: number;
  /** BYDAY weekdays without an ordinal, indexed by ISO weekday. */
  readonly weekdays?: readonly boolean[];
  /** BYYEARDAY, negative values counting from the year's end. */
  readonly yearDays?: ReadonlySet<number>;
}

const isPositiveInteger = (value: number) => Number.isSafeInteger(value) && value >= 1;

const invalid = (message: string) => new RecurrenceRuleError("invalid-rule", message);

function checkList(
  name: string,
  values: readonly number[] | undefined,
  min: number,
  max: number,
): readonly number[] | undefined {
  if (values === undefined) return undefined;
  if (values.length === 0) throw invalid(`${name} must not be empty.`);
  for (const value of values) {
    if (!Number.isInteger(value) || value < min || value > max || (min < 0 && value === 0)) {
      const range = min < 0 ? `${min} to ${max}, other than 0` : `${min} to ${max}`;
      throw invalid(`${name} takes integers from ${range}; got ${value}.`);
    }
  }
  return values;
}

function flags(values: readonly number[], size: number): boolean[] {
  const result = Array.from({ length: size }, () => false);
  for (const value of values) result[value] = true;
  return result;
}

function weekdayNumber(name: string, value: unknown): number {
  const number =
    typeof value === "string" && Object.hasOwn(WEEKDAYS, value)
      ? WEEKDAYS[value as IcsWeekday]
      : undefined;
  if (number === undefined) {
    throw invalid(`${name} takes weekdays MO to SU; got ${JSON.stringify(value)}.`);
  }
  return number;
}

/** Sorted, without repeats. */
function ascending(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

const LONGEST_MONTHS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Whether the day parts can't meet on any date: BYMONTHDAY days that none of the months have, or
 * only BYDAY ordinals past the fifth, which no month has, counted within months.
 */
function impossible(
  months: readonly number[] | undefined,
  monthDays: readonly number[] | undefined,
  ordinalWeekdays: readonly OrdinalWeekday[] | undefined,
  weekdays: readonly number[] | undefined,
  frequency: Frequency,
): boolean {
  const monthsListed = months ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  if (
    monthDays !== undefined &&
    !monthsListed.some((month) => monthDays.some((day) => Math.abs(day) <= LONGEST_MONTHS[month]!))
  ) {
    return true;
  }
  const withinMonths =
    frequency === Frequency.Monthly || (frequency === Frequency.Yearly && months !== undefined);
  return (
    withinMonths &&
    weekdays === undefined &&
    ordinalWeekdays !== undefined &&
    ordinalWeekdays.every(({ ordinal }) => Math.abs(ordinal) > 5)
  );
}

/**
 * Checks a rule, which may come from code rather than from parsed text, and fills in what it leaves
 * out from the start, as RFC 5545 §3.3.10 says: "FREQ=YEARLY;BYMONTH=1" repeats on the start's day
 * of the month at the start's time. Throws a `RecurrenceRuleError` naming the part at fault.
 */
export function compileRule(rule: RecurrenceRule, start: RuleStart): CompiledRule {
  const frequency = Object.hasOwn(FREQUENCIES, rule.frequency)
    ? FREQUENCIES[rule.frequency]
    : undefined;
  if (frequency === undefined) {
    throw invalid(`FREQ must be SECONDLY to YEARLY; got ${JSON.stringify(rule.frequency)}.`);
  }
  if (rule.interval !== undefined && !isPositiveInteger(rule.interval)) {
    throw invalid(`INTERVAL must be a positive integer; got ${rule.interval}.`);
  }
  if (rule.count !== undefined && !isPositiveInteger(rule.count)) {
    throw invalid(`COUNT must be a positive integer; got ${rule.count}.`);
  }
  if (start.allDay && frequency > Frequency.Daily) {
    throw new RecurrenceRuleError(
      "unsupported-rule",
      `FREQ=${rule.frequency} can't repeat an all-day series, whose occurrences are whole days.`,
    );
  }

  const bySecond = checkList("BYSECOND", rule.bySecond, 0, 60);
  const byMinute = checkList("BYMINUTE", rule.byMinute, 0, 59);
  const byHour = checkList("BYHOUR", rule.byHour, 0, 23);
  const byMonthDay = checkList("BYMONTHDAY", rule.byMonthDay, -31, 31);
  const byYearDay = checkList("BYYEARDAY", rule.byYearDay, -366, 366);
  const byWeekNumber = checkList("BYWEEKNO", rule.byWeekNumber, -53, 53);
  const byMonth = checkList("BYMONTH", rule.byMonth, 1, 12);
  const bySetPosition = checkList("BYSETPOS", rule.bySetPosition, -366, 366);
  if (rule.byDay?.length === 0) throw invalid("BYDAY must not be empty.");
  const weekStart = rule.weekStart === undefined ? 1 : weekdayNumber("WKST", rule.weekStart);

  // BYDAY ordinals count within the month or year (RFC 5545 §3.3.10); other frequencies ignore
  // them, as python-dateutil does.
  const ordinals = frequency === Frequency.Monthly || frequency === Frequency.Yearly;
  let weekdays: number[] | undefined;
  let ordinalWeekdays: OrdinalWeekday[] | undefined;
  for (const { ordinal, weekday } of rule.byDay ?? []) {
    const number = weekdayNumber("BYDAY", weekday);
    if (
      ordinal !== undefined &&
      (!Number.isInteger(ordinal) || ordinal === 0 || Math.abs(ordinal) > 53)
    ) {
      throw invalid(`BYDAY ordinals take integers from -53 to 53, other than 0; got ${ordinal}.`);
    }
    if (ordinal !== undefined && ordinals) {
      (ordinalWeekdays ??= []).push({ ordinal, weekday: number });
    } else {
      (weekdays ??= []).push(number);
    }
  }

  // RFC 5545 §3.3.10: what the rule doesn't say comes from the start.
  let months = byMonth;
  let monthDays = byMonthDay;
  // Only parts that expand or limit this FREQ name a day. Those RFC 5545's table calls N/A, such as
  // BYMONTHDAY in a WEEKLY rule, only limit the day the start gives.
  const dayParts =
    frequency === Frequency.Yearly
      ? byWeekNumber !== undefined ||
        byYearDay !== undefined ||
        byMonthDay !== undefined ||
        rule.byDay !== undefined
      : frequency === Frequency.Monthly
        ? byMonthDay !== undefined || rule.byDay !== undefined
        : rule.byDay !== undefined;
  if (!dayParts) {
    if (frequency === Frequency.Yearly) {
      months ??= [start.month];
      monthDays = [start.day];
    } else if (frequency === Frequency.Monthly) {
      monthDays = [start.day];
    } else if (frequency === Frequency.Weekly) {
      weekdays = [start.weekday];
    }
  } else if (
    frequency === Frequency.Yearly &&
    byWeekNumber !== undefined &&
    rule.byDay === undefined &&
    byMonthDay === undefined &&
    byYearDay === undefined
  ) {
    // A week number alone doesn't say which day of the week; the start's weekday does.
    weekdays = [start.weekday];
  }

  // RFC 5545 §3.3.10: BYHOUR, BYMINUTE and BYSECOND are ignored for all-day starts.
  const hours = start.allDay ? [0] : (byHour ?? [start.hour]);
  const minutes = start.allDay ? [0] : (byMinute ?? [start.minute]);
  // Second 60 is a leap second, which no Temporal clock shows.
  const seconds = (start.allDay ? [0] : (bySecond ?? [start.second])).filter(
    (second) => second < 60,
  );
  if (seconds.length === 0) {
    throw new RecurrenceRuleError(
      "unsupported-rule",
      "BYSECOND=60 is a leap second, which Temporal's clocks don't have.",
    );
  }
  const times: number[] = [];
  if (frequency <= Frequency.Daily) {
    for (const hour of hours) {
      for (const minute of minutes) {
        for (const second of seconds) times.push(hour * 3600 + minute * 60 + second);
      }
    }
  } else if (frequency === Frequency.Hourly) {
    for (const minute of minutes) for (const second of seconds) times.push(minute * 60 + second);
  } else if (frequency === Frequency.Minutely) {
    times.push(...seconds);
  } else {
    times.push(0);
  }

  return {
    count: rule.count,
    impossible: impossible(months, monthDays, ordinalWeekdays, weekdays, frequency),
    frequency,
    hours: frequency >= Frequency.Hourly && byHour !== undefined ? flags(byHour, 24) : undefined,
    interval: rule.interval ?? 1,
    minutes:
      frequency >= Frequency.Minutely && byMinute !== undefined ? flags(byMinute, 60) : undefined,
    monthDays: monthDays && new Set(monthDays),
    months: months && flags(months, 13),
    ordinalWeekdays,
    seconds:
      frequency === Frequency.Secondly && bySecond !== undefined ? flags(bySecond, 61) : undefined,
    setPositions: bySetPosition,
    times: ascending(times),
    weekNumbers: byWeekNumber && new Set(byWeekNumber),
    weekStart,
    weekdays: weekdays && flags(weekdays, 8),
    yearDays: byYearDay && new Set(byYearDay),
  };
}
