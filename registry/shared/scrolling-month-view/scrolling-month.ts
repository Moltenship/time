import {
  scrollingMonthAnchor,
  scrollingMonthOf,
  scrollingMonthStrategy,
  type CalendarEnvironmentBase,
  type PlainDateInterval,
} from "@moltenship/calendar";

import { epochDay } from "@registry/shared/calendar/scrolling-axis-controller";
import { laneHeightOf, lanesIn } from "@registry/shared/month-view/month-layout";

/** One week's height: the viewport shared by the visible weeks. */
export const WEEK = "var(--calendar-week-height)";
/** Months with snap points either way of the range, past any a swipe reaches before it renders. */
const SNAP_MONTHS = 6;

/** A week's number from the week of 1970-01-01; weeks that start on the same weekday count by one. */
export function weekNumber(date: Temporal.PlainDate): number {
  return Math.floor(epochDay(date) / 7);
}

/**
 * The scrolling month's weeks, numbered on its axis, for a `range` of `weeks` weeks: where a
 * month's page starts, the anchor a week stands for, and where a scroll comes to rest.
 */
export function scrollingMonthWeeks(
  range: PlainDateInterval,
  weeks: number,
  environment: CalendarEnvironmentBase,
) {
  const strategy = scrollingMonthStrategy(weeks);
  const first = weekNumber(range.start);
  /** The week a month's page starts at: the one that holds its first day. */
  const monthStart = (date: Temporal.PlainDate) =>
    weekNumber(strategy.getRange(date, environment, undefined).start);
  /** The anchor date of the page that starts at `week`. */
  const anchorOf = (week: number) =>
    scrollingMonthAnchor(range.start.add({ weeks: Math.round(week) - first }));
  return {
    anchorOf,
    first,
    /** The weeks the months a few either way of the range's start at, for snap points. */
    snapPoints: () => {
      const month = scrollingMonthOf(range);
      return Array.from({ length: 2 * SNAP_MONTHS + 1 }, (_, index) =>
        monthStart(month.add({ months: index - SNAP_MONTHS })),
      );
    },
    /** The nearest of the months around `week`: their first weeks are four or five apart. */
    snapTo: (week: number) => {
      const near = anchorOf(week);
      return [-1, 0, 1]
        .map((months) => monthStart(near.add({ months })))
        .reduce((best, start) => (Math.abs(start - week) < Math.abs(best - week) ? start : best));
    },
  };
}

/**
 * Measures how many event lanes fit in a week row of `track`, which holds `count` of them, and
 * calls `onChange` with the count, now and whenever the track or the lane height a `probe`
 * measures changes. Attach it again when `count` changes. Returns the cleanup.
 */
export function attachWeekLanes(
  track: HTMLElement,
  options: {
    readonly count: number;
    readonly onChange: (lanes: number) => void;
    readonly probe: HTMLElement | null | undefined;
  },
): () => void {
  const { count, onChange, probe } = options;
  const measure = () => {
    const height = track.getBoundingClientRect().height / count;
    if (height > 0) onChange(lanesIn(height, laneHeightOf(probe)));
  };
  measure();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(measure);
  observer.observe(track);
  if (probe != null) observer.observe(probe);
  return () => observer.disconnect();
}
