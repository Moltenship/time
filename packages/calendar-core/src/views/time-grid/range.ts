import {
  plainDateInterval,
  weekRange,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarWeekRules } from "../../environment";
import type { ViewNavigationDirection } from "../../views";

/** The anchor's week, or `count` consecutive days starting at the anchor (a day view is one). */
export type TimeGridSpan =
  | { readonly kind: "week" }
  | { readonly count: number; readonly kind: "days" };

const MAXIMUM_TIME_GRID_DAYS = 7;

function dayCount(span: TimeGridSpan): number {
  if (span.kind === "week") {
    return 7;
  }
  if (!Number.isSafeInteger(span.count) || span.count < 1 || span.count > MAXIMUM_TIME_GRID_DAYS) {
    throw new RangeError("invalid-time-grid-day-count");
  }

  return span.count;
}

/** Visible dates of a time grid; a week starts on `weekRules.firstDay`. */
export function timeGridRange(
  anchor: Temporal.PlainDate,
  span: TimeGridSpan,
  weekRules: CalendarWeekRules,
): PlainDateInterval {
  return span.kind === "week"
    ? weekRange(anchor, { weekStartsOn: weekRules.firstDay })
    : plainDateInterval(anchor, anchor.add({ days: dayCount(span) }));
}

/** Moves the anchor by one whole span: a day, a week, or `count` days. */
export function navigateTimeGrid(
  anchor: Temporal.PlainDate,
  direction: ViewNavigationDirection,
  span: TimeGridSpan,
): Temporal.PlainDate {
  return anchor.add({ days: direction * dayCount(span) });
}

/** "October 8, 2026" for one day, "Oct 6 – 12, 2026" for several, in the given locale. */
export function timeGridTitle(range: PlainDateInterval, locale: Intl.Locale | string): string {
  const last = range.end.subtract({ days: 1 });

  if (last.equals(range.start)) {
    return new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(last);
  }

  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatRange(range.start, last);
}
