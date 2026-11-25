import { cn } from "cn";

/**
 * The resource timeline's classes, one place for every framework's markup: each name is the
 * element it styles. Restyle the timeline here.
 */

/** The grid, which holds the keyboard and the pointer. */
export function timelineGridClass(isReadOnly: boolean | undefined): string {
  return cn(
    "flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ew-resize",
    // A long-press on a touch screen picks events up: it selects no text and opens no callout.
    !isReadOnly && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
  );
}

/** The element that scrolls both ways, clear of the sticky header and resource column. */
export const timelineViewportClass =
  "relative min-h-0 flex-1 scroll-ps-(--calendar-resource-column) scroll-pt-(--calendar-timeline-header) overflow-auto overscroll-contain";
/** The canvas as wide and tall as every row and slot. */
export const timelineCanvasClass = "relative";
export const timelineNowClass =
  "pointer-events-none absolute z-20 w-0.5 -translate-x-1/2 bg-calendar-now rtl:translate-x-1/2";

export const timelineHeaderClass =
  "sticky top-0 z-40 flex h-(--calendar-timeline-header) border-b border-calendar-grid bg-calendar-surface";
/** The header's corner over the resource column. */
export const timelineCornerClass =
  "sticky start-0 z-10 flex w-(--calendar-resource-column) shrink-0 items-end border-e border-calendar-grid bg-calendar-surface px-3 pb-2 text-xs font-medium text-muted-foreground";
/** The header's upper row: dates over hours, or months over days. */
export const timelineGroupsClass = "absolute inset-x-0 top-0 h-6";
export const timelineGroupClass = "absolute inset-y-0 border-s border-calendar-grid";
export const timelineGroupLabelClass =
  "sticky start-(--calendar-resource-column) inline-block px-2 pt-1 text-xs font-medium whitespace-nowrap";

/** A slot's column header. */
export function timelineSlotHeaderClass(unit: "day" | "hour"): string {
  return cn(
    "absolute bottom-0 flex h-10 overflow-hidden border-s border-calendar-grid text-xs whitespace-nowrap text-calendar-axis tabular-nums",
    unit === "day" ? "flex-col items-center justify-center" : "items-center px-2",
  );
}

export const timelineWeekdayClass = "text-[0.6875rem] leading-none font-medium uppercase";

export function timelineDayNumberClass(isToday: boolean): string {
  return cn(
    "flex size-6 items-center justify-center rounded-full text-sm text-foreground",
    isToday && "bg-calendar-today text-calendar-today-foreground",
  );
}

/** A resource's row; group rows are tinted. */
export function timelineRowClass(isGroup: boolean): string {
  return cn("absolute inset-x-0 flex border-b border-calendar-grid", isGroup && "bg-muted/50");
}

/** The sticky resource cell. */
export function timelineRowHeaderClass(isGroup: boolean): string {
  return cn(
    "sticky start-0 z-30 flex w-(--calendar-resource-column) shrink-0 items-center gap-1 border-e border-calendar-grid bg-calendar-surface pe-2 text-sm",
    isGroup && "bg-muted font-medium",
  );
}

/** Where a row without a toggle would have one, so names line up. */
export const timelineToggleSpaceClass = "size-6 shrink-0";

export function timelineToggleIconClass(expanded: boolean): string {
  return cn("transition-transform", expanded ? "rotate-90" : "rtl:rotate-180");
}

export const timelineRowTitleClass = "truncate";
/** The resource's local time beside its name. */
export const timelineRowTimeClass = "ms-auto";
/** The name over the status and local time, when the header shows a status. */
export const timelineRowStackClass = "flex min-w-0 flex-col items-start gap-0.5";
export const timelineRowStackTitleClass = "max-w-full truncate";
export const timelineRowStatusLineClass = "flex max-w-full min-w-0 items-center gap-1";
/** The badge keeps its words; the local time gives way. */
export const timelineRowStatusClass = "shrink-0";
export const timelineRowStatusTimeClass = "min-w-0 shrink truncate";

/** A slot of a row. */
export const timelineCellClass =
  "absolute inset-y-0 border-s border-calendar-grid data-weekend:bg-calendar-weekend";
/** The day the pointer is over in a day row. */
export const timelineDayLayerClass = "absolute inset-0";
/** A date's wall clock along an hour row. */
export const timelineStripClass = "absolute inset-y-0";
/** The hours a clock change skips, hatched. */
export const timelineGapClass =
  "absolute inset-y-0 bg-[repeating-linear-gradient(45deg,transparent_0_5px,var(--calendar-grid)_5px_6px)]";
/** The hours a clock change repeats, tinted. */
export const timelineFoldClass = "absolute inset-y-0 bg-calendar-selection";

/** A keyboard create's draft. `draftCheck` marks a draft the policies reject or flag. */
export function timelineDraftClass(draftCheck: string): string {
  return cn("pointer-events-none absolute inset-y-1 rounded-sm bg-calendar-selection", draftCheck);
}

/** Shading over a resource's closed time. */
export const timelineUnavailableClass = "inset-y-0 bg-calendar-unavailable";

/** The keyboard's cursor on a cell. */
export const timelineCellTargetClass =
  "pointer-events-none absolute inset-y-0 z-10 rounded-sm focus-visible:bg-calendar-selection focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

/**
 * An event's bar in its lane. A stacked bar sits part-way down a lane, over the one before it: a
 * ring sets it apart. Ends cut off by the range are squared.
 */
export function timelineEventClass(
  stacked: boolean,
  startsBefore: boolean,
  endsAfter: boolean,
): string {
  return cn(
    "group absolute z-1 gap-1 rounded-sm px-1.5 py-0 leading-6 hover:z-2 focus-visible:z-3 data-grabbed:z-4",
    stacked && "shadow-[0_0_0_1px_var(--calendar-surface,var(--background))]",
    startsBefore && "rounded-s-none border-s-0",
    endsAfter && "rounded-e-none",
  );
}

/** The title keeps the room it needs; the time takes what's left, or none. */
export const timelineEventTitleClass = "max-w-full shrink-0 truncate";
export const timelineEventTimeClass = "min-w-0 truncate font-normal opacity-80";
export const timelineResizeStartClass =
  "absolute inset-y-0 start-0 w-1.5 max-w-1/3 cursor-ew-resize";
export const timelineResizeEndClass = "absolute inset-y-0 end-0 w-1.5 max-w-1/3 cursor-ew-resize";
