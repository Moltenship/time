import {
  monthGrid,
  plainDateIntervalContains,
  type IsoDayOfWeek,
  type PlainDateInterval,
} from "@moltenship/calendar";

/*
 * The mini month's dates, for every framework's mini month: its weeks, its keys, its tab stop and
 * what each day shows.
 */

/** How far each key moves focus through the month, left to right. */
const miniMonthKeySteps: Readonly<Partial<Record<string, Temporal.DurationLike>>> = {
  ArrowDown: { days: 7 },
  ArrowLeft: { days: -1 },
  ArrowRight: { days: 1 },
  ArrowUp: { days: -7 },
  PageDown: { months: 1 },
  PageUp: { months: -1 },
};

/**
 * How far `key` moves focus through the month, or `undefined` for a key it ignores. Right to left,
 * the next day is on the left, so the arrows swap, as they do in the calendar's views.
 */
export function miniMonthKeyStep(
  key: string,
  direction: string,
): Temporal.DurationLike | undefined {
  const swapped =
    direction === "rtl" && key === "ArrowLeft"
      ? "ArrowRight"
      : direction === "rtl" && key === "ArrowRight"
        ? "ArrowLeft"
        : key;
  return miniMonthKeySteps[swapped];
}

export function startOfMonth(date: Temporal.PlainDate): Temporal.PlainDate {
  return date.with({ day: 1 });
}

export function isSameMonth(date: Temporal.PlainDate, month: Temporal.PlainDate): boolean {
  return date.year === month.year && date.month === month.month;
}

export interface MiniMonthFormats {
  /** A day's accessible name: "Thursday, October 8, 2026". */
  readonly day: Intl.DateTimeFormat;
  /** The heading: "October 2026". */
  readonly month: Intl.DateTimeFormat;
  /** A column's letter, and its full name for screen readers. */
  readonly weekday: Intl.DateTimeFormat;
  readonly weekdayName: Intl.DateTimeFormat;
}

export function miniMonthFormats(locale: Intl.LocalesArgument): MiniMonthFormats {
  return {
    day: new Intl.DateTimeFormat(locale, { dateStyle: "full" }),
    month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: "narrow" }),
    weekdayName: new Intl.DateTimeFormat(locale, { weekday: "long" }),
  };
}

/** Six weeks of seven dates around `month`, so the grid keeps its height from month to month. */
export function miniMonthWeeks(
  month: Temporal.PlainDate,
  weekStartsOn: IsoDayOfWeek,
): Temporal.PlainDate[][] {
  return monthGrid(month, { fixedWeeks: true, weekStartsOn }).weeks.map((week) =>
    Array.from({ length: 7 }, (_, index) => week.start.add({ days: index })),
  );
}

/** The day the grid's one tab stop is on: the focused date, or the month's first in another month. */
export function miniMonthTabStop(
  focused: Temporal.PlainDate,
  month: Temporal.PlainDate,
): Temporal.PlainDate {
  return isSameMonth(focused, month) ? focused : month;
}

export interface MiniMonthDay {
  readonly date: Temporal.PlainDate;
  readonly inMonth: boolean;
  readonly isSelected: boolean;
  readonly isToday: boolean;
  /** Whether the main view shows the date, so the day is part of the band. */
  readonly isVisible: boolean;
  /** Whether the band starts or ends on the day, at the range's ends or the week's. */
  readonly rangeEnd: boolean;
  readonly rangeStart: boolean;
}

/** What the day in `column` shows. */
export function miniMonthDay(
  date: Temporal.PlainDate,
  column: number,
  where: {
    readonly month: Temporal.PlainDate;
    readonly selectedDate: Temporal.PlainDate;
    readonly today: Temporal.PlainDate;
    readonly visibleRange: PlainDateInterval | undefined;
  },
): MiniMonthDay {
  const { visibleRange } = where;
  const isVisible = visibleRange !== undefined && plainDateIntervalContains(visibleRange, date);
  const last = visibleRange?.end.subtract({ days: 1 });
  return {
    date,
    inMonth: isSameMonth(date, where.month),
    isSelected: date.equals(where.selectedDate),
    isToday: date.equals(where.today),
    isVisible,
    rangeEnd: isVisible && (column === 6 || last?.equals(date) === true),
    rangeStart: isVisible && (column === 0 || visibleRange.start.equals(date)),
  };
}
