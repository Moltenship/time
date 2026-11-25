import { cn } from "cn";

import { timeGridGutterClassName } from "@registry/shared/time-grid-view/time-grid.styles";

/**
 * The scrolling week and day's classes, beside the time grid's in `time-grid.styles.ts`, one
 * place for every framework's markup: each name is the element it styles.
 */

/** The grid: the rows, a column of them, with the drag cursors and the gutter's width. */
export function scrollingTimeGridClass(isReadOnly: boolean | undefined): string {
  return cn(
    "flex h-full min-h-0 flex-col [--calendar-ghost-background:var(--calendar-selection)] data-interaction:select-none data-[interaction=move]:cursor-grabbing data-[interaction=resize]:cursor-ns-resize",
    timeGridGutterClassName,
    // A long-press on a touch screen picks events up: it selects no text and opens no callout.
    !isReadOnly && "pointer-coarse:select-none pointer-coarse:[-webkit-touch-callout:none]",
  );
}

/** The element that scrolls the hours, a container whose width the days share. */
export const scrollingTimeGridViewportClass =
  "relative min-h-0 flex-1 scroll-pt-(--calendar-header-height) overflow-x-hidden overflow-y-auto overscroll-x-contain [container-type:inline-size] [scrollbar-gutter:stable]";
/** The day headers and the all-day row, over the hours. */
export const scrollingTimeGridHeaderClass =
  "sticky top-0 z-30 border-b border-calendar-grid bg-calendar-surface";
/** A row: its gutter cell, then its days. */
export const scrollingTimeGridRowClass = "flex";
/** A row's cell in the hour gutter. */
export const scrollingTimeGridGutterClass =
  "shrink-0 w-(--calendar-gutter-width) bg-calendar-surface";
/** The header's gutter cell, with the zones' names and the display zone's offset. */
export const scrollingTimeGridCornerClass = `${scrollingTimeGridGutterClass} flex items-end pb-1 text-[0.625rem] text-calendar-axis`;
/** A header row's days, which follow the scroll below by transform: nothing scrolls them here. */
export const scrollingTimeGridFollowerClass = "flex min-w-0 flex-1 overflow-clip";
/** The 24-hour row. */
export const scrollingTimeGridBodyClass = "flex h-[calc(var(--calendar-hour-height)*24)]";
/** The days, which scroll sideways only, a page at a time, with no scrollbar to drag. */
export const scrollingTimeGridDaysClass =
  "min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] in-data-interaction:snap-none [&::-webkit-scrollbar]:hidden";
/** A row's days across the canvas. */
export const scrollingTimeGridTrackClass = "relative h-full flex-none";
/** The days a row renders, at their place on the canvas. */
export const scrollingTimeGridStripClass = "flex h-full";
/** The timed columns. */
export const scrollingTimeGridColumnsClass = "grid flex-1";
/** A dragged bar's copy keeps its title at its start, not where the bar's pin had moved it. */
export const scrollingTimeGridGhostClass = "[&_[data-slot=calendar-event-title]]:transform-none!";
