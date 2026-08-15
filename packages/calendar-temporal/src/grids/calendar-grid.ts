import {
  comparePlainDates,
  plainDateInterval,
  type PlainDateInterval,
} from "../intervals/half-open";

export type WeekStartsOn = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WeekRangeOptions {
  /** ISO day number: Monday is 1 and Sunday is 7. */
  readonly weekStartsOn: WeekStartsOn;
}

export interface MonthGridOptions extends WeekRangeOptions {
  /** Pads the grid to six weeks instead of returning its natural four-to-six-week range. */
  readonly fixedWeeks?: boolean;
}

export interface MonthGrid {
  /** First day of the anchored month. */
  readonly month: Temporal.PlainDate;
  /** Complete visible half-open range, including leading and trailing dates. */
  readonly range: PlainDateInterval;
  /** Consecutive seven-day half-open rows covering `range`. */
  readonly weeks: readonly PlainDateInterval[];
}

function assertWeekStartsOn(value: number): asserts value is WeekStartsOn {
  if (!Number.isInteger(value) || value < 1 || value > 7) {
    throw new RangeError("invalid-week-start");
  }
}

function startOfWeek(date: Temporal.PlainDate, weekStartsOn: WeekStartsOn): Temporal.PlainDate {
  const daysSinceWeekStart = (date.dayOfWeek - weekStartsOn + 7) % 7;
  return date.subtract({ days: daysSinceWeekStart });
}

/** Returns the seven-day half-open week containing `date`. */
export function weekRange(date: Temporal.PlainDate, options: WeekRangeOptions): PlainDateInterval {
  assertWeekStartsOn(options.weekStartsOn);
  const start = startOfWeek(date, options.weekStartsOn);
  return plainDateInterval(start, start.add({ days: 7 }));
}

/** Builds a bounded month grid without locale, timezone, or current-time globals. */
export function monthGrid(date: Temporal.PlainDate, options: MonthGridOptions): MonthGrid {
  assertWeekStartsOn(options.weekStartsOn);

  const month = date.with({ day: 1 });
  const start = startOfWeek(month, options.weekStartsOn);
  const nextMonth = month.add({ months: 1 });
  const nextMonthWeekStart = startOfWeek(nextMonth, options.weekStartsOn);
  const naturalEnd =
    comparePlainDates(nextMonthWeekStart, nextMonth) === 0
      ? nextMonth
      : nextMonthWeekStart.add({ days: 7 });
  const end = options.fixedWeeks ? start.add({ days: 42 }) : naturalEnd;

  if (comparePlainDates(naturalEnd, end) > 0) {
    throw new RangeError("month-grid-exceeds-six-weeks");
  }

  const weeks: PlainDateInterval[] = [];
  for (let weekStart = start; comparePlainDates(weekStart, end) < 0;) {
    const weekEnd = weekStart.add({ days: 7 });
    weeks.push(plainDateInterval(weekStart, weekEnd));
    weekStart = weekEnd;
  }

  return Object.freeze({
    month,
    range: plainDateInterval(start, end),
    weeks: Object.freeze(weeks),
  });
}
