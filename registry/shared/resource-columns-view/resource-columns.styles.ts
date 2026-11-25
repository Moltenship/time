import { cn } from "cn";

/**
 * The resource columns' classes, one place for every framework's markup: each name is the element
 * it styles. The grid, its corner and its hour labels are the time grid's, in `time-grid.styles.ts`.
 * Restyle the resource columns here.
 */

/** The header, dates and all-day rows, above the scrolling body. */
export const resourceColumnsHeadClass = "shrink-0 border-b border-calendar-grid";

/**
 * A row's part beside the gutter, which clips the columns as they follow the body's sideways
 * scroll, and the track in it that moves.
 */
export const resourceColumnsClipClass = "relative min-w-0 flex-1 overflow-clip";
export const resourceColumnsTrackClass = "relative h-full";

// Header

export const resourceHeaderRowClass = "flex";
/** A resource's header, placed on the track. */
export const resourceHeaderColumnClass = "absolute inset-y-0";
export const resourceHeaderCellClass = "flex h-full flex-col";
/** A band over a group's columns, one per group the resource sits in. */
export const resourceGroupBandClass = "shrink-0 bg-muted";

/** The name row; an expanded group's starts its band. */
export function resourceNameRowClass(expanded: boolean): string {
  return cn(
    // A container, so header parts can fit themselves to the column's width.
    "@container flex shrink-0 items-center gap-1 border-s border-calendar-grid px-2",
    expanded && "bg-muted",
  );
}

/** The space under a resource that sits higher than the deepest one. */
export const resourceHeaderFillClass = "flex-1 border-s border-calendar-grid";

// Resource header parts

export const resourceGroupToggleClass =
  "-ms-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function resourceGroupChevronClass(expanded: boolean): string {
  return cn(
    "size-4 transition-transform rtl:-scale-x-100",
    // Down when open: RTL mirrors it to point left, so it turns the other way.
    expanded && "rotate-90 rtl:-rotate-90",
  );
}

export const resourceHeaderIconClass = "flex shrink-0 items-center";

export function resourceHeaderTitleClass(unassigned: boolean): string {
  return cn("truncate text-sm font-medium", unassigned && "text-muted-foreground");
}

export const resourceHeaderTimeClass = "truncate leading-none";

/** The default header's name, with the local time and the status under it. */
export const defaultResourceHeaderTextClass = "flex min-w-0 flex-col";
export const defaultResourceHeaderStatusRowClass = "flex min-w-0 items-center gap-1";
/**
 * The local time beside the status: the badge keeps its words and the time gives way after it,
 * out of sight in a narrow column.
 */
export const defaultResourceHeaderStatusTimeClass =
  "order-last min-w-0 shrink @max-[11rem]:sr-only";

// Dates

export const resourceDatesRowClass = "flex h-7";
export const resourceDatesCornerClass = "w-(--calendar-gutter-width) shrink-0";
/** A resource's days side by side, on the track. */
export const resourceDaysClass = "absolute inset-y-0 grid";
export const resourceDateClass =
  "flex min-w-0 items-center justify-center gap-1 border-s border-calendar-grid text-xs";

export function resourceWeekdayClass(isToday: boolean): string {
  return cn("font-medium uppercase", isToday ? "text-calendar-today" : "text-muted-foreground");
}

export function resourceDayNumberClass(isToday: boolean): string {
  return cn("tabular-nums", isToday && "font-semibold text-calendar-today");
}

// All day

export const resourceAllDayRowClass = "flex";
/** A resource's all-day cells, on the track. */
export const resourceAllDayColumnClass = "absolute inset-y-0 flex";

// Body

export const resourceBodyRowClass = "flex min-h-0 flex-1";
export const resourceBodyGutterClass = "w-(--calendar-gutter-width) shrink-0 overflow-clip";
/** The gutter's hours, which follow the body's vertical scroll. */
export const resourceBodyHoursClass = "h-[calc(var(--calendar-hour-height)*24)]";
/** The element that scrolls the columns both ways. */
export const resourceBodyClass = "relative min-w-0 flex-1 overflow-auto [scrollbar-gutter:stable]";
/** The 24 hours of every column, with a line at each hour. */
export const resourceBodyTrackClass =
  "relative h-[calc(var(--calendar-hour-height)*24)] bg-[linear-gradient(to_bottom,var(--calendar-grid)_1px,transparent_1px)] bg-size-[100%_var(--calendar-hour-height)]";
