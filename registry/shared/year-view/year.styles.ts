import { cn } from "cn";

/**
 * The year's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the year here.
 */

/** The view, which scrolls, and the container its months' columns follow. */
export const yearViewClass = "@container h-full min-h-0 overflow-y-auto";
/** Two narrow months side by side on a phone, up to six across on a wide screen. */
export const yearMonthsClass =
  "grid grid-cols-1 content-start gap-x-4 gap-y-5 p-3 @sm:grid-cols-2 @2xl:gap-x-8 @2xl:p-6 @3xl:grid-cols-3 @5xl:grid-cols-4 @[100rem]:grid-cols-6";

export const yearMonthClass = "flex min-w-0 flex-col gap-1";
/** A month's name, which opens the month. */
export const yearMonthNameClass =
  "self-start rounded-md px-1.5 py-0.5 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring";
export const yearGridClass = "flex flex-col";
export const yearWeekdayRowClass = "grid grid-cols-7";
export const yearWeekdayClass =
  "py-1 text-center text-[0.6875rem] font-medium text-muted-foreground";
/** Room for six weeks in every month, so months side by side line up. */
export const yearWeeksClass = "grid grid-rows-[repeat(6,2.25rem)]";
export const yearWeekClass = "grid grid-cols-7";

/** A day of the year and its keyboard focus target. */
export const yearDayCellClass =
  "relative min-w-0 rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** A shaded day's band along the row, rounded where its run starts and ends; rows stay apart. */
export function yearClosedClass(shade: { readonly first: boolean; readonly last: boolean }) {
  return cn(
    "inset-y-0.5 start-0 end-0 bg-calendar-closed",
    shade.first && "start-0.5 rounded-s-md",
    shade.last && "end-0.5 rounded-e-md",
  );
}

/** The button in a day that opens its events. */
export const yearDayButtonClass =
  "relative flex size-full flex-col items-center justify-center gap-0.5 rounded-md outline-none hover:bg-accent aria-expanded:bg-accent";

/** A day's date, today's in a filled circle. */
export function yearDateClass(isToday: boolean): string {
  return cn(
    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
    isToday && "bg-calendar-today font-semibold text-calendar-today-foreground",
  );
}

export const yearDotsClass = "flex h-1 gap-0.5";
/** A dot for an event colour on a day; `data-color` picks the colour. */
export const yearDotClass = "size-1 rounded-full bg-calendar-event-border";

/** The day's popover. */
export const yearPopoverClass = "w-64 gap-0 p-2";
export const yearPopoverHeaderClass = "flex flex-col items-center gap-0.5 pb-2";
export const yearPopoverWeekdayClass =
  "text-[0.6875rem] font-medium text-muted-foreground uppercase";
/** The popover's date, which opens the day. */
export const yearPopoverDateClass =
  "flex size-10 items-center justify-center rounded-full text-xl tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
export const yearPopoverEmptyClass = "pb-2 text-center text-xs text-muted-foreground";
export const yearPopoverListClass = "-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-1";

/** An event in a day's list: bars are filled, others a coloured dot, start time, and title. */
export function yearEventClass(bar: boolean): string {
  return cn(
    "h-6 shrink-0 gap-1 rounded-sm px-1.5 py-0",
    !bar &&
      "group/event border-s-0 bg-transparent font-normal text-foreground hover:bg-accent hover:brightness-100",
  );
}

export const yearEventDotClass = "size-2 shrink-0 rounded-full bg-calendar-event-border";

export function yearEventTimeClass(bar: boolean): string {
  return cn(
    "shrink-0",
    // Muted on the hover fill falls short of 4.5:1.
    bar ? "font-normal" : "text-muted-foreground group-hover/event:text-accent-foreground",
  );
}

export const yearEventTitleClass = "min-w-0 flex-1 truncate font-medium";
