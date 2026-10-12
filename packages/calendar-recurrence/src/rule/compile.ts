import type { IcsFrequency, IcsWeekday } from "@moltenship/ics";

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

function checkList(
  name: string,
  values: readonly number[] | undefined,
  min: number,
  max: number,
): readonly number[] | undefined {
  if (values === undefined) return undefined;
  if (values.length === 0) throw new RangeError(`${name} must not be empty.`);
  for (const value of values) {
    if (!Number.isInteger(value) || value < min || value > max || (min < 0 && value === 0)) {
      const range = min < 0 ? `${min} to ${max}, other than 0` : `${min} to ${max}`;
      throw new RangeError(`${name} takes integers from ${range}; got ${value}.`);
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
  const number = WEEKDAYS[value as IcsWeekday];
  if (number === undefined) {
    throw new RangeError(`${name} takes weekdays MO to SU; got ${JSON.stringify(value)}.`);
  }
  return number;
}

/** Sorted, without repeats. */
function ascending(values: Iterable<number>): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

/**
 * Checks a rule, which may come from code rather than from parsed text, and fills in what it leaves
 * out from the start, as RFC 5545 §3.3.10 says: "FREQ=YEARLY;BYMONTH=1" repeats on the start's day
 * of the month at the start's time. Throws a `RangeError` naming the part it can't expand.
 */
export function compileRule(rule: RecurrenceRule, start: RuleStart): CompiledRule {
  const frequency = FREQUENCIES[rule.frequency];
  if (frequency === undefined) {
    throw new RangeError(`FREQ must be SECONDLY to YEARLY; got ${JSON.stringify(rule.frequency)}.`);
  }
  if (rule.interval !== undefined && !isPositiveInteger(rule.interval)) {
    throw new RangeError(`INTERVAL must be a positive integer; got ${rule.interval}.`);
  }
  if (rule.count !== undefined && !isPositiveInteger(rule.count)) {
    throw new RangeError(`COUNT must be a positive integer; got ${rule.count}.`);
  }
  if (rule.count !== undefined && rule.until !== undefined) {
    throw new RangeError("COUNT and UNTIL can't both be set (RFC 5545 §3.3.10).");
  }
  if (start.allDay && frequency > Frequency.Daily) {
    throw new RangeError(
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
  if (rule.byDay?.length === 0) throw new RangeError("BYDAY must not be empty.");
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
      throw new RangeError(
        `BYDAY ordinals take integers from -53 to 53, other than 0; got ${ordinal}.`,
      );
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
  const dayParts =
    byWeekNumber !== undefined ||
    byYearDay !== undefined ||
    byMonthDay !== undefined ||
    rule.byDay !== undefined;
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
