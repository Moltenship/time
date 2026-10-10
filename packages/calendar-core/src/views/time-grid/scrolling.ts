import { plainDateInterval, plainDateIntervalContains } from "@moltenship/calendar-temporal";

import { timeGridSpatialNavigation } from "../../navigation/time-grid";
import type { CalendarViewStrategy } from "../../views";
import { projectTimeGrid, type TimeGridProjection } from "./projection";
import {
  navigateTimeGrid,
  timeGridDayCount,
  timeGridRange,
  timeGridTitle,
  type TimeGridSpan,
} from "./range";

/**
 * A time grid that scrolls through days instead of paging: `days` columns starting at the anchor,
 * which is the first visible day, so any day can lead the view. A page of days on each side is
 * projected too (`getLoadRange`), so a swipe shows their events at once; Previous and Next move a
 * whole page. Keyboard navigation moves through the visible days and pages past their ends, as in
 * `timeGridStrategy`.
 */
export function scrollingTimeGridStrategy<TOptions = undefined, TEvent = unknown>(
  days: number,
): CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> {
  const span: TimeGridSpan = { count: days, kind: "days" };
  timeGridDayCount(span);

  const strategy: CalendarViewStrategy<TimeGridProjection<TEvent>, TOptions, TEvent> = {
    getLoadRange: (anchor) =>
      plainDateInterval(anchor.subtract({ days }), anchor.add({ days: 2 * days })),
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
    project: (input) => projectTimeGrid({ ...input, range: input.loadRange ?? input.range }),
  };
  return Object.freeze(strategy);
}
