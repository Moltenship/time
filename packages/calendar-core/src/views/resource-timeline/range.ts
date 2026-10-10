import { plainDateInterval, type PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarWeekRules } from "../../environment";
import {
  navigateTimeGrid,
  timeGridRange,
  timeGridTitle,
  type TimeGridSpan,
} from "../time-grid/range";

/** A time grid's span, or the anchor's calendar month (its own dates, not padded weeks). */
export type ResourceTimelineSpan = TimeGridSpan | { readonly kind: "month" };

export function resourceTimelineRange(
  anchor: Temporal.PlainDate,
  span: ResourceTimelineSpan,
  weekRules: CalendarWeekRules,
): PlainDateInterval {
  if (span.kind !== "month") return timeGridRange(anchor, span, weekRules);
  const first = anchor.with({ day: 1 });
  return plainDateInterval(first, first.add({ months: 1 }));
}

/** Moves the anchor by a whole span: days, a week, or a month. */
export function navigateResourceTimeline(
  anchor: Temporal.PlainDate,
  delta: number,
  span: ResourceTimelineSpan,
): Temporal.PlainDate {
  return span.kind === "month"
    ? anchor.add({ months: delta })
    : navigateTimeGrid(anchor, delta, span);
}

/** "October 2026" for a month, otherwise as a time grid titles the same dates. */
export function resourceTimelineTitle(
  range: PlainDateInterval,
  span: ResourceTimelineSpan,
  locale: Intl.Locale | string,
): string {
  return span.kind === "month"
    ? new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(range.start)
    : timeGridTitle(range, locale);
}
