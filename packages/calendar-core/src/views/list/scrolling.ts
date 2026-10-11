import { plainDateInterval, plainDateIntervalContains } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../../ids";
import { listSpatialNavigation } from "../../navigation/list";
import type { CalendarViewStrategy } from "../../views";
import {
  getListTitle,
  listWeeks,
  navigateList,
  projectList,
  type ListProjection,
  type ListViewOptions,
} from "./list";

/**
 * An agenda that scrolls through days instead of paging. Its range is `weeks` from the anchor
 * date, the day a view shows on top, since a list comes to rest on any day rather than on a week;
 * the title names it. A page of weeks either way is projected too (`getLoadRange`), so the list
 * scrolls on into them and their events can load before they come into view. Previous and Next
 * move a page. Keyboard navigation moves through the range's events and pages past its ends, as in
 * the paged agenda; a range without events is entered at its first date.
 */
export function scrollingListStrategy<
  TOptions extends ListViewOptions | undefined = ListViewOptions,
  TEvent = unknown,
>(): CalendarViewStrategy<ListProjection<TEvent, EventId, ResourceId>, TOptions, TEvent> {
  const strategy: CalendarViewStrategy<
    ListProjection<TEvent, EventId, ResourceId>,
    TOptions,
    TEvent
  > = {
    getLoadRange: (anchor, _environment, options) => {
      const weeks = listWeeks(options ?? {});
      return plainDateInterval(anchor.subtract({ weeks }), anchor.add({ weeks: 2 * weeks }));
    },
    getRange: (anchor, _environment, options) =>
      plainDateInterval(anchor, anchor.add({ weeks: listWeeks(options ?? {}) })),
    getSpatialNavigation: (input) => {
      const { focus, projection, range } = input;
      // Only the range's days take part, so keys page past its ends as in the paged agenda.
      const days = projection.days.filter(({ date }) => plainDateIntervalContains(range, date));
      // Without events in the range, focus enters at its first date, where a view says it's empty,
      // even with events loaded around it.
      if (focus === null && days.length === 0) return { focus: { date: range.start, kind: "day" } };
      return listSpatialNavigation({ ...input, projection: { ...projection, days } });
    },
    getTitle: (range, environment) => getListTitle(range, environment),
    navigate: (anchor, delta, options) => navigateList(anchor, delta, options ?? {}),
    project: (input) => projectList({ ...input, range: input.loadRange ?? input.range }),
  };
  return Object.freeze(strategy);
}
