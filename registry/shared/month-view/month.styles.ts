import { cn } from "cn";

/**
 * The month grid's classes, one place for every framework's markup: each name is the element it
 * styles. Restyle the month here.
 */

/** The grid, which holds the keyboard and the pointer, and sets the lane's height. */
export function monthViewClass(isReadOnly: boolean | undefined): string {
  return cn(
    "flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] [--calendar-month-lane:22px] pointer-coarse:[--calendar-month-lane:26px] data-interaction:select-none data-[interaction=move]:cursor-grabbing",
    // A long-press on a touch screen picks events up: it selects no text and opens no callout.
    !isReadOnly && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
  );
}

/** An invisible element one lane tall, which measures `--calendar-month-lane`. */
export const laneProbeClass =
  "pointer-events-none invisible absolute h-(--calendar-month-lane) w-0";

export const monthHeaderRowClass = "grid shrink-0 grid-cols-7 border-b border-calendar-grid";
export const monthColumnHeaderClass =
  "py-2 text-center text-[0.6875rem] font-medium text-muted-foreground uppercase";
/** The weeks, which scroll when an expanded week needs the room. */
export const monthBodyClass = "grid min-h-0 flex-1 overflow-y-auto";
export const monthWeekClass =
  "grid min-h-0 grid-cols-7 border-b border-calendar-grid last:border-b-0";

/** A day of the grid and its keyboard focus target. */
export const monthDayCellClass =
  "relative min-w-0 border-e border-calendar-grid last:border-e-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";
/** A closed day's shading. */
export const monthClosedClass = "inset-0 bg-calendar-closed";

/** The layer under a day's events that holds its date, `data-date` and a keyboard create's draft. */
export function monthDateLayerClass(inMonth: boolean, closed: boolean, draftCheck: string): string {
  return cn(
    "absolute inset-0 flex justify-center data-draft:bg-calendar-selection",
    draftCheck,
    !inMonth && !closed && "bg-muted/50",
  );
}

/** A date number that opens its day. */
export function monthDateButtonClass(
  day: { readonly inMonth: boolean; readonly isToday: boolean },
  className?: string,
): string {
  return cn(
    "flex items-center justify-center rounded-full font-medium tabular-nums hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
    // Muted on the hover fill falls short of 4.5:1. Today keeps its own colours.
    !day.inMonth && !day.isToday && "text-muted-foreground hover:text-accent-foreground",
    day.isToday && "bg-calendar-today text-calendar-today-foreground hover:bg-calendar-today/90",
    className,
  );
}

/** A date in its cell. */
export const monthCellDateClass = "mt-1 h-6 min-w-6 px-1.5 text-xs";
/** The date at the top of the "+N more" list. */
export const monthListDateClass = "size-10 text-xl font-normal";

export const moreEventsTriggerClass =
  "absolute start-0 z-1 mx-0.5 truncate rounded-sm px-1.5 text-start text-xs font-medium max-sm:px-1 max-sm:text-[0.625rem] text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring";
export const moreEventsLongClass = "max-sm:hidden";
export const moreEventsShortClass = "sm:hidden";
export const moreEventsContentClass = "w-64 gap-0 p-2";
export const moreEventsHeaderClass = "flex flex-col items-center gap-0.5 pb-2";
export const moreEventsWeekdayClass =
  "text-[0.6875rem] font-medium text-muted-foreground uppercase";
export const moreEventsListClass = "-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 py-1";
/** An event in the "+N more" list. */
export const moreEventsItemClass = "h-6 shrink-0";

/** An event in the grid, placed in its lane; a continued end meets the cell's edge. */
export function monthSegmentClass(startsBefore: boolean, endsAfter: boolean): string {
  return cn("absolute start-0 z-1 mx-0.5", startsBefore && "ms-0", endsAfter && "me-0");
}

/**
 * One event in a month cell. Bars are filled and their clipped ends show where the event
 * continues; other events are a coloured dot, start time, and title.
 */
export function monthEventClass(
  bar: boolean,
  startsBefore: boolean,
  endsAfter: boolean,
  className?: string,
): string {
  return cn(
    "gap-1 rounded-sm px-1.5 py-0 max-sm:px-1 max-sm:text-[0.625rem]",
    bar
      ? [startsBefore && "rounded-s-none border-s-0 ps-0.5", endsAfter && "rounded-e-none"]
      : // Small screens show compact tinted blocks instead of dot, time, and title. A dragged
        // copy is tinted too, so the grid doesn't show through it.
        "group/event border-s-0 bg-transparent font-normal text-foreground hover:bg-accent hover:brightness-100 data-calendar-ghost:bg-calendar-event max-sm:bg-calendar-event max-sm:text-calendar-event-foreground",
    className,
  );
}

/** The chevron at a bar's continued end. */
export const monthEventChevronClass = "size-3 shrink-0 opacity-70 rtl:rotate-180";
export const monthEventDotClass =
  "size-2 shrink-0 rounded-full bg-calendar-event-border max-sm:hidden";

export function monthEventTimeClass(bar: boolean): string {
  return cn(
    "shrink-0 max-sm:hidden",
    // Muted on the hover fill falls short of 4.5:1.
    bar ? "font-normal" : "text-muted-foreground group-hover/event:text-accent-foreground",
  );
}

export function monthEventTitleClass(bar: boolean): string {
  return cn("min-w-0 flex-1 truncate max-sm:text-clip", !bar && "font-medium");
}

export const monthEventIconClass = "max-sm:size-2.5 max-sm:[&_svg]:size-2.5";
