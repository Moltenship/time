import { cn } from "cn";

/**
 * The scrolling month's classes, beside the month grid's in `month.styles.ts`, one place for every
 * framework's markup: each name is the element it styles.
 */

/** The element that scrolls the weeks, a container whose height the weeks share. */
export const scrollingMonthViewportClass =
  "relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain [container-type:size] in-data-interaction:snap-none";
/** Every week of the canvas, as a flex column, so the rows' offset never collapses through it. */
export const scrollingMonthTrackClass = "relative flex flex-col";
/** The weeks that render, offset to their place on the canvas. */
export const scrollingMonthWeeksClass = "grid shrink-0";

/** A week; one showing every lane grows over the next ones instead of moving them. */
export function scrollingMonthWeekClass(expanded: boolean): string {
  return cn("grid", expanded && "relative z-10 bg-calendar-surface shadow-md");
}
