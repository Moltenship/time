// #region rows
import {
  iteratePlainDates,
  monthGrid,
  weekRange,
  type WeekStartsOn,
} from "@moltenship/calendar-temporal";

export interface GridDay {
  readonly date: Temporal.PlainDate;
  /** False for the days of the months before and after, which fill the first and last rows. */
  readonly inMonth: boolean;
}

/** The rows of a month grid: one array of seven days for each week. */
export function monthRows(date: Temporal.PlainDate, weekStartsOn: WeekStartsOn): GridDay[][] {
  const grid = monthGrid(date, { weekStartsOn });
  return grid.weeks.map((week) =>
    Array.from(iteratePlainDates(week), (day) => ({
      date: day,
      inMonth: day.year === grid.month.year && day.month === grid.month.month,
    })),
  );
}
// #endregion rows

// #region header
/** The names above the columns, starting on the grid's first weekday. */
export function weekdayNames(weekStartsOn: WeekStartsOn, locale: string): string[] {
  // Any week has the seven weekdays in the grid's order.
  const week = weekRange(Temporal.PlainDate.from("2026-01-01"), { weekStartsOn });
  return Array.from(iteratePlainDates(week), (day) =>
    day.toLocaleString(locale, { weekday: "short" }),
  );
}
// #endregion header

// #region text
/** The grid as text, with the days of other months left blank. */
export function monthText(date: Temporal.PlainDate, weekStartsOn: WeekStartsOn): string {
  const cell = (text: string) => text.slice(0, 2).padStart(2);
  const rows = monthRows(date, weekStartsOn).map((row) =>
    row.map((day) => cell(day.inMonth ? `${day.date.day}` : "")).join(" "),
  );
  return [weekdayNames(weekStartsOn, "en-US").map(cell).join(" "), ...rows].join("\n");
}
// #endregion text

// #region fixed
/** Six rows for every month, so a grid keeps its height as the reader moves through the year. */
export function sixWeeks(date: Temporal.PlainDate, weekStartsOn: WeekStartsOn) {
  return monthGrid(date, { weekStartsOn, fixedWeeks: true });
}
// #endregion fixed
