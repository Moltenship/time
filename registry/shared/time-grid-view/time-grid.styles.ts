import { cn } from "cn";

/**
 * The time grid's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the week and day views here.
 */

/**
 * The gutter holds the display zone's hours, `--calendar-hours-width` wide (3rem, 4rem from `sm`),
 * and a column for each secondary zone, which `gutterStyle` counts. A zone's column is
 * `--calendar-zone-width` wide, 4rem by default: room for "12:30 AM+1". Set it, as a rem or px
 * length, on an element around the calendar for locales with longer times.
 */
export const timeGridGutterClassName =
  "[--calendar-hours-width:3rem] sm:[--calendar-hours-width:4rem] [--calendar-gutter-width:calc(var(--calendar-hours-width)+var(--calendar-zones,0)*var(--calendar-zone-width,4rem))]";

/** The grid, which holds the keyboard and the pointer. */
export function timeGridViewClass(isReadOnly: boolean | undefined): string {
  return cn(
    "flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize",
    timeGridGutterClassName,
    // A long-press on a touch screen picks events up: it selects no text and opens no callout.
    !isReadOnly && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
  );
}

/** The header and all-day rows, above the scrolling body. */
export const timeGridHeadClass =
  "shrink-0 overflow-hidden border-b border-calendar-grid [scrollbar-gutter:stable]";

// Header

export const timeGridHeaderRowClass = "flex";
/** The header's cell over the hour gutter. */
export const timeGridCornerClass =
  "flex w-(--calendar-gutter-width) shrink-0 items-end pb-1 text-[0.625rem] text-calendar-axis";
/** A row's cells, one per day. */
export const timeGridDaysClass = "grid flex-1";

export function dayHeaderClass(single: boolean): string {
  return cn("flex min-w-0 flex-col gap-0.5 py-2", single ? "items-start px-2" : "items-center");
}

export function dayHeaderWeekdayClass(isToday: boolean): string {
  return cn(
    "text-[0.6875rem] font-medium tracking-wide uppercase",
    isToday ? "text-calendar-today" : "text-muted-foreground",
  );
}

export function dayHeaderNumberClass(single: boolean, isToday: boolean, opensDay: boolean): string {
  return cn(
    "flex items-center justify-center rounded-full text-xl tabular-nums sm:text-2xl",
    single ? "size-11" : "size-9 sm:size-11",
    isToday
      ? "bg-calendar-today text-calendar-today-foreground"
      : opensDay && "group-hover:bg-accent",
  );
}

/** The date button that opens a day in a multi-day grid. */
export const dayHeaderButtonClass =
  "group rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export function dayHeaderNotesClass(single: boolean): string {
  return single ? "items-start" : "items-center";
}

export const srOnlyClass = "sr-only";

// Body

/** The scrolling element. */
export const timeGridBodyClass =
  "relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]";
/** The timed row: 24 hours tall. */
export const timeGridTimedRowClass = "flex h-[calc(var(--calendar-hour-height)*24)]";
/** A row's header over the gutter. */
export const timeGridRowHeaderClass = "w-(--calendar-gutter-width) shrink-0";
/** The day cells of the timed row, under the hour lines. */
export const timeGridColumnsClass =
  "grid flex-1 bg-[linear-gradient(to_bottom,var(--calendar-grid)_1px,transparent_1px)] bg-size-[100%_var(--calendar-hour-height)]";

/** The display zone's hour labels. */
export const timeGridHoursClass = "relative h-full";
export const timeGridHourLabelClass =
  "absolute end-2 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums";
/** The gutter's hours with secondary zones: a column for each, then the display zone's. */
export const timeGridZonedHoursClass = "flex h-full";
export const timeGridDisplayHoursClass = "min-w-0 flex-1";

// Columns

/** One day's 24 hours, a cell of the timed row. */
export const timeGridColumnClass = "relative min-w-0 border-s border-calendar-grid";
/** A spring-forward hour, which the clock skips. */
export const timeGridGapClass =
  "absolute inset-x-0 bg-[repeating-linear-gradient(-45deg,transparent_0_5px,var(--calendar-grid)_5px_6px)]";
/** A fall-back hour, which the clock repeats. */
export const timeGridFoldClass = "absolute inset-x-0 bg-calendar-selection";
/**
 * Where events sit. The inline-end margin keeps a strip free for creating an event beside busy
 * blocks.
 */
export const timeGridEventsClass = "absolute inset-y-0 start-0 end-2";

/** A keyboard create's draft, with the policies' answer in `draftCheck`'s classes. */
export function timeGridDraftClass(draftCheck: string): string {
  return cn("pointer-events-none absolute inset-x-0 rounded-md bg-calendar-selection", draftCheck);
}

/** The keyboard's cursor on a slot. */
export const timeGridSlotClass =
  "pointer-events-none absolute inset-x-0 z-10 rounded-sm focus-visible:bg-calendar-selection focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring";

export const timeGridNowClass = cn(
  "pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-calendar-now",
  "before:absolute before:-top-1 before:-start-1.5 before:size-2.5 before:rounded-full before:bg-calendar-now",
);

// Events

/**
 * A positioned event. Raised while hovered, and above that while focused, so a stacked event's
 * title shows over the ones covering it, wherever the pointer rests. The padding falls back to the
 * old `px-1.5 py-1` for a theme copied before its tokens.
 */
export function timeGridEventClass(
  compact: boolean,
  startsBeforeDay: boolean,
  endsAfterDay: boolean,
): string {
  return cn(
    "group absolute flex-col items-stretch gap-0 px-[var(--calendar-event-padding-x,calc(var(--spacing)*1.5))] shadow-[0_0_0_1px_var(--calendar-surface,var(--background))] hover:z-10 focus:z-20 focus-visible:z-20",
    compact
      ? "flex-row items-center gap-1 py-0 text-[0.6875rem] leading-none"
      : "py-[var(--calendar-event-padding-y,var(--spacing))]",
    startsBeforeDay && "rounded-t-none",
    endsAfterDay && "rounded-b-none",
  );
}

/** A compact event's one line. */
export const timeGridCompactLineClass = "truncate";
/** A compact event's icon: smaller, to fit the line without making it taller. */
export const timeGridCompactIconClass = "size-2.5 [&_svg]:size-2.5";
export const timeGridCompactTimeClass = "font-normal opacity-80";
export const timeGridEventTitleClass = "line-clamp-2";
export const timeGridEventTimeClass = "truncate font-normal tabular-nums opacity-80";
export const timeGridResizeStartClass = "absolute inset-x-0 top-0 h-1.5 max-h-1/3 cursor-ns-resize";
export const timeGridResizeEndClass =
  "absolute inset-x-0 bottom-0 flex h-1.5 max-h-1/3 cursor-ns-resize justify-center after:mt-auto after:mb-0.5 after:h-0.5 after:w-4 after:rounded-full after:bg-current after:opacity-0 after:transition-opacity group-hover:after:opacity-40";

// All-day row

/** An all-day cell and keyboard focus target. */
export const allDayCellClass =
  "relative min-w-0 border-s border-calendar-grid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/** The layer under a cell's events that holds `data-date` and a keyboard create's draft. */
export function allDayDropClass(draftCheck: string): string {
  return cn("absolute inset-0 data-draft:bg-calendar-selection", draftCheck);
}

export function allDayEventClass(startsBefore: boolean, endsAfter: boolean): string {
  return cn(
    "absolute start-0 z-1 mx-1 min-w-0 py-0 leading-[1.375rem]",
    startsBefore && "ms-0 rounded-s-none",
    endsAfter && "me-0 rounded-e-none",
  );
}

export const allDayEventTitleClass = "truncate";

export const allDayMoreClass =
  "absolute start-0 z-1 mx-1 truncate rounded-md px-2 text-start text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";

export const allDayRowClass = "flex";
export const allDayRowHeaderClass =
  "flex w-(--calendar-gutter-width) shrink-0 items-start justify-end pt-0.5 pe-1";
export const allDayToggleClass = "rounded-full";

export function allDayToggleIconClass(collapsed: boolean): string {
  return cn("transition-transform", !collapsed && "rotate-180");
}

// Secondary time zones

/** A secondary zone's column in the gutter; see `timeGridGutterClassName`. */
const zoneColumnClass = "w-[var(--calendar-zone-width,4rem)] shrink-0";

export function zoneHoursClass(className?: string): string {
  return cn("relative h-full", zoneColumnClass, className);
}

export const zoneHourLabelClass =
  "absolute end-1 -translate-y-1/2 text-[0.625rem] whitespace-nowrap text-calendar-axis tabular-nums";
/** "+1" or "-1", raised without `vertical-align`, so the label keeps its height and its line. */
export const zoneDayOffsetClass = "relative -top-1 ms-px text-[0.5rem] leading-none";
export const zoneLabelClass = cn("truncate pe-1 text-end", zoneColumnClass);
/** A flex container, so an offset too long for the hours overflows outward, not into the days. */
export const gutterOffsetClass = "flex min-w-0 flex-1 justify-end pe-2 whitespace-nowrap";

export function zoneNotesClass(className?: string): string {
  return cn(
    "flex max-w-full min-w-0 flex-col text-[0.5625rem] leading-tight whitespace-nowrap text-muted-foreground",
    className,
  );
}

export const zoneNoteClass = "max-w-full truncate";

// Availability

/** Shading over a column's closed time, behind its events. */
export const timeGridUnavailableClass = "inset-x-0 bg-calendar-unavailable";

// Annotations

/** The strip a column's marks sit in: beside events, or across the column for an overlay. */
export function annotationRailClass(placement: "rail" | "overlay", className?: string): string {
  return cn(
    "pointer-events-none absolute inset-y-0",
    placement === "overlay"
      ? "inset-x-0 z-0"
      : "z-[5] w-(--calendar-annotation-rail-width) data-[side=end]:end-0 data-[side=start]:start-0",
    className,
  );
}

/**
 * Geometry arrives as CSS variables: `--mark-top` and `--mark-height` as fractions of the day,
 * `--mark-offset` and `--mark-width` in px inside the rail. A variant's `--mark-min-height` keeps
 * a short mark near midnight inside the day, drawn up from its end as the layout measures it.
 */
export const annotationMarkBaseClass =
  "pointer-events-auto absolute top-[min(var(--mark-top),calc(100%_-_var(--mark-min-height,0px)))] transition-[filter,background-color] duration-100 motion-reduce:transition-none";

/** A mark's looks, by variant. */
export const annotationMarkVariantClasses = {
  /** A capsule never shorter than it is wide, so a short one is a circle. */
  capsule:
    "start-(--mark-offset) h-[max(var(--mark-min-height),calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full [--mark-min-height:var(--mark-width)] bg-calendar-event-border shadow-[inset_0_0_0_1px_rgb(0_0_0/0.14)] hover:brightness-110 data-ends-after:rounded-b-none data-ends-after:mask-[linear-gradient(to_top,transparent,black_1.5rem)] data-starts-before:rounded-t-none data-starts-before:mask-[linear-gradient(to_bottom,transparent,black_1.5rem)] data-starts-before:data-ends-after:mask-[linear-gradient(to_bottom,transparent,black_1.5rem,black_calc(100%-1.5rem),transparent)] dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.16)]",
  /** A thin bar that keeps its true length. */
  bar: "start-(--mark-offset) h-[max(var(--mark-min-height),calc(var(--mark-height)_-_1px))] w-(--mark-width) rounded-full [--mark-min-height:3px] bg-calendar-event-border hover:brightness-110 data-ends-after:rounded-b-none data-starts-before:rounded-t-none",
  /** A tint across the column behind events; for `placement: "overlay"`. */
  band: "inset-x-0 h-(--mark-height) border-s-2 border-calendar-event-border bg-calendar-event-border/12 hover:bg-calendar-event-border/24",
} as const;

export type AnnotationMarkVariant = keyof typeof annotationMarkVariantClasses;

/** A mark that opens its details on click shows a pointer. */
export const annotationMarkDetailsClass = "cursor-pointer";

export function annotationMarkIconClass(className?: string): string {
  return cn(
    "absolute inset-x-px top-px flex aspect-square items-center justify-center rounded-full bg-white/35 text-black/70 [&_svg]:size-[62%]",
    className,
  );
}

/** Never under the pointer, so it can't swallow a click on the mark. */
export const annotationTooltipClass = "pointer-events-none flex-col items-start gap-0.5";
export const annotationTooltipTitleClass = "font-medium";
export const annotationTooltipDetailClass = "opacity-70";

export const annotationPopoverClass = "w-72";
export const annotationPopoverHeaderClass = "flex items-center gap-2";
export const annotationPopoverIconClass =
  "flex size-7 shrink-0 items-center justify-center rounded-full bg-calendar-event-border text-background";
export const annotationPopoverIconGlyphClass = "size-4";
export const annotationPopoverHeadingClass = "min-w-0";
export const annotationPopoverTitleClass = "truncate leading-tight";
export const annotationPopoverRangeClass = "text-xs text-muted-foreground tabular-nums";
export const annotationPopoverCloseClass = "ms-auto self-start";
export const annotationPopoverListClass = "flex flex-col gap-1 text-xs";
export const annotationPopoverItemClass = "flex justify-between gap-3";
export const annotationPopoverItemTitleClass = "truncate";
export const annotationPopoverItemTimeClass = "shrink-0 text-muted-foreground tabular-nums";
export const annotationPopoverMoreClass = "text-muted-foreground";
export const annotationPopoverFooterClass = "border-t pt-2 text-[0.6875rem] text-muted-foreground";
