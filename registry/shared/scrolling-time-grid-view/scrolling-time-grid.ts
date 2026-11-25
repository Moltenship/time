import {
  eventDateRanges,
  plainDateIntervalContains,
  type CalendarFocus,
  type PlainDateInterval,
  type TimeGridProjection,
} from "@moltenship/calendar";

/**
 * The scrolling week and day's layout and focus rules, for every framework's view: the days'
 * sizes on the canvas, where a swipe comes to rest, and where focus on an all-day bar goes as its
 * day scrolls away.
 */

/** One day's width: the viewport past the hour gutter, shared by the visible days. */
export const DAY = "var(--calendar-day-width)";
/** Pages with snap points either way of the range, past any a swipe reaches before it renders. */
const SNAP_PAGES = 6;

/** `--calendar-day-width` for `visibleDays` days sharing the viewport past the hour gutter. */
export function dayWidth(visibleDays: number): string {
  return `calc((100cqw - var(--calendar-gutter-width)) / ${visibleDays})`;
}

/**
 * Where a scroll comes to rest: whole pages from the range's `first` day, so a week stays a
 * calendar week and three days move three.
 */
export function pageSnap(first: number, visibleDays: number): (day: number) => number {
  return (day) => first + Math.round((day - first) / visibleDays) * visibleDays;
}

/** The days pages start at, a few pages either way of `first`, for `ScrollSnapPoints`. */
export function pageSnapPoints(first: number, visibleDays: number): number[] {
  return Array.from(
    { length: 2 * SNAP_PAGES + 1 },
    (_, index) => first + (index - SNAP_PAGES) * visibleDays,
  );
}

/** A length of `days` days on the canvas, as CSS. */
export function daysLength(days: number): string {
  return `calc(${days} * ${DAY})`;
}

/**
 * The days' background: hour lines, and day lines past the rendered days during a long swipe.
 * Day lines start at the first rendered day, `start` days into the canvas: each tile's length is
 * rounded to layout units, an error that tiling from the canvas's start would grow into lines
 * pixels off the days.
 */
export function daysBackground(
  rtl: boolean,
  start: number,
): { readonly image: string; readonly position: string; readonly size: string } {
  return {
    image: `linear-gradient(to bottom, var(--calendar-grid) 1px, transparent 1px), linear-gradient(to ${rtl ? "left" : "right"}, var(--calendar-grid) 1px, transparent 1px)`,
    position: `0 0, ${rtl ? "right" : "left"} ${daysLength(start)} top 0`,
    size: `100% var(--calendar-hour-height), ${DAY} 100%`,
  };
}

/**
 * Focus on an all-day bar from a day outside the visible ones, moved to the visible day nearest
 * it that the bar covers; `null` when there's nothing to move. The bar renders from the visible
 * days once its focused day scrolls away, either way, so focus on it has to follow.
 */
export function barFocusInView(
  focus: CalendarFocus | null,
  row: TimeGridProjection<unknown>["allDay"],
  visible: PlainDateInterval,
  timeZone: string,
): CalendarFocus | null {
  if (focus?.kind !== "event" || plainDateIntervalContains(visible, focus.date)) return null;
  const before = Temporal.PlainDate.compare(focus.date, visible.start) < 0;
  const lastVisible = visible.end.subtract({ days: 1 });
  for (const { column, event, span } of row.segments) {
    if (event.id !== focus.eventId) continue;
    const first = row.range.start.add({ days: column });
    const last = first.add({ days: span - 1 });
    const target = before
      ? Temporal.PlainDate.compare(first, visible.start) > 0
        ? first
        : visible.start
      : Temporal.PlainDate.compare(last, lastVisible) < 0
        ? last
        : lastVisible;
    if (!plainDateIntervalContains(visible, target)) continue;
    // Segments are clipped to the loaded days, so the event's own dates decide what it covered:
    // one run of local dates through both days, which a fold at midnight can start a day early.
    const [from, to] = before ? [focus.date, target] : [target, focus.date];
    const continuous = eventDateRanges(event, timeZone).some(
      ({ first: runFirst, last: runLast }) =>
        Temporal.PlainDate.compare(runFirst, from) <= 0 &&
        Temporal.PlainDate.compare(to, runLast) <= 0,
    );
    if (continuous) return { ...focus, date: target };
  }
  return null;
}
