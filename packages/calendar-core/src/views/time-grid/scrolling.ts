import { plainDateInterval, plainDateIntervalContains } from "@moltenship/calendar-temporal";

import { timeGridSpatialNavigation } from "../../navigation/time-grid";
import type { CalendarViewStrategy } from "../../views";
import { overlapLayoutOf, projectTimeGrid, type TimeGridProjection } from "./projection";
import {
  navigateTimeGrid,
  timeGridDayCount,
  timeGridRange,
  timeGridTitle,
  type TimeGridSpan,
} from "./range";

/**
 * A time grid that scrolls through days instead of paging: the anchor's week, or `count` days
 * starting at the anchor, as `timeGridStrategy` shows them. A view swipes a page at a time, so
 * each swipe keeps the span's alignment: a week stays a calendar week, and a 3-day view moves
 * three days. A page of days on each side is projected too (`getLoadRange`), so a swipe shows
 * their events at once; Previous and Next move a whole page. Keyboard navigation moves through
 * the visible days and pages past their ends, and overlapping events follow the view's options, as
 * in `timeGridStrategy`.
 */
export function scrollingTimeGridStrategy<TOptions = undefined, TEvent = unknown>(
  span: TimeGridSpan,
): CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> {
  const days = timeGridDayCount(span);

  const strategy: CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> = {
    getLoadRange: (anchor, environment) => {
      const range = timeGridRange(anchor, span, environment.weekRules);
      return plainDateInterval(range.start.subtract({ days }), range.end.add({ days }));
    },
    getRange: (anchor, environment) => timeGridRange(anchor, span, environment.weekRules),
    getSpatialNavigation: (input) => {
      const { projection, range } = input;
      // Only the visible days take part, so keys leave them where the view pages.
      const visible = projection.days.filter(({ column }) =>
        plainDateIntervalContains(range, column.date),
      );
      return timeGridSpatialNavigation({ ...input, projection: { ...projection, days: visible } });
    },
    getTitle: (range, environment) => timeGridTitle(range, environment.locale),
    navigate: (anchor, delta) => navigateTimeGrid(anchor, delta, span),
    project: (input) =>
      projectTimeGrid({
        ...input,
        ...overlapLayoutOf(input.options),
        range: input.loadRange ?? input.range,
      }),
  };
  return Object.freeze(strategy);
}
