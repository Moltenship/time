import {
  groupByResource,
  layoutDayGridRow,
  queryVisibleEvents,
  splitEventsByDay,
  timeGridColumns,
  visibleResources,
  type CalendarViewProjectionInput,
  type DayGridSegment,
  type EventId,
  type ResourceId,
  type ResourceVisibilityOptions,
  type TimeGridColumn,
  type VisibleResource,
} from "@moltenship/calendar";

/** A visible resource and its events, packed into lanes across whole days as in a month row. */
export interface ResourceTimelineRow<TEvent> {
  readonly laneCount: number;
  readonly resource: VisibleResource;
  readonly segments: readonly DayGridSegment<TEvent, EventId, ResourceId>[];
}

// The day-slot half of the timeline projection #39 adds to core, in the same shape, until it lands.
export interface ResourceTimelineProjection<TEvent> {
  /** The visible dates on the display time zone's wall clock, for the now-line. */
  readonly columns: readonly TimeGridColumn[];
  readonly rows: readonly ResourceTimelineRow<TEvent>[];
  readonly unit: "day";
}

/**
 * The visible resources in display order, each with its events laid out like a month row. An
 * event with several resources shows in each as the same event, and collapsing a group reuses
 * the snapshot's indexes.
 */
export function projectResourceTimeline<TOptions extends ResourceVisibilityOptions, TEvent>({
  environment: { timeZone },
  expandedResourceIds,
  options,
  range,
  resources,
  snapshot,
}: CalendarViewProjectionInput<TOptions, TEvent>): ResourceTimelineProjection<TEvent> {
  const visible = visibleResources(resources, expandedResourceIds, options);
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, range, timeZone),
    range,
    timeZone,
  );
  const groups = groupByResource(fragments, visible);
  return Object.freeze({
    columns: timeGridColumns(range, timeZone),
    rows: Object.freeze(
      visible.map((resource, index) => {
        const { laneCount, segments } = layoutDayGridRow(range, groups[index]!);
        return Object.freeze({ laneCount, resource, segments });
      }),
    ),
    unit: "day",
  });
}
