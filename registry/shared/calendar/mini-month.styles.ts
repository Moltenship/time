import { cn } from "cn";

import type { MiniMonthDay } from "./mini-month-dates";

/**
 * The mini month's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the mini month here.
 */

export const miniMonthClass = "w-full select-none";
export const miniMonthHeaderClass = "flex items-center justify-between pb-1 ps-2";
export const miniMonthTitleClass = "text-sm font-medium";
export const miniMonthStepsClass = "flex";
export const miniMonthStepClass = "rounded-full";
/** The month arrows point to the inline start and end, so they turn in right-to-left text. */
export const miniMonthStepIconClass = "rtl:rotate-180";
export const miniMonthGridClass = "w-full border-collapse";
/** A header cell inherits an ancestor's explicit text-align, so it centers itself. */
export const miniMonthWeekdayClass =
  "pb-1 text-center text-[0.6875rem] font-medium text-muted-foreground";

/** A day's cell, which draws the band of the dates the main view shows. */
export function miniMonthCellClass(day: MiniMonthDay): string {
  return cn(
    "p-0 py-px",
    day.isVisible && "bg-calendar-selection",
    day.rangeStart && "rounded-s-full",
    day.rangeEnd && "rounded-e-full",
  );
}

export function miniMonthDayClass(day: MiniMonthDay): string {
  return cn(
    "mx-auto flex size-7 items-center justify-center rounded-full text-xs tabular-nums outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
    // Muted text is under 4.5:1 on the range band and the hover fill.
    !day.inMonth &&
      !day.isVisible &&
      !day.isToday &&
      "text-muted-foreground hover:text-accent-foreground",
    day.isSelected && "font-semibold text-calendar-today",
    day.isToday &&
      "bg-calendar-today font-semibold text-calendar-today-foreground hover:bg-calendar-today/90",
  );
}
