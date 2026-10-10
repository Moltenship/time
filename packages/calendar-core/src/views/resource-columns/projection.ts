import { resourceColumnsSpatialNavigation } from "../../navigation/resource-columns";
import { splitEventsByDay } from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import {
  groupByResource,
  visibleResources,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "../../resources/visible";
import type { CalendarViewProjectionInput, CalendarViewStrategy } from "../../views";
import { timeGridColumns, type TimeGridColumn } from "../time-grid/columns";
import { timeGridOf, type TimeGridProjection } from "../time-grid/projection";
import {
  navigateTimeGrid,
  timeGridRange,
  timeGridTitle,
  type TimeGridSpan,
} from "../time-grid/range";

/** One visible resource's time grid: its all-day row and its events in each day column. */
export interface ResourceColumn<TEvent> extends TimeGridProjection<TEvent> {
  readonly resource: VisibleResource;
}

export interface ResourceColumnsProjection<TEvent> {
  /**
   * The visible dates' day columns, shared by every resource: each resource's `days[i].column` is
   * `columns[i]`. Pass them to the pointer layer.
   */
  readonly columns: readonly TimeGridColumn[];
  /** The visible resources in display order, each with its own time grid. */
  readonly resources: readonly ResourceColumn<TEvent>[];
}

export type ResourceColumnsProjectionInput<TEvent> = Pick<
  CalendarViewProjectionInput<unknown, TEvent>,
  "environment" | "expandedResourceIds" | "range" | "resources" | "snapshot" | "today"
> &
  ResourceVisibilityOptions;

/**
 * A time grid per visible resource, laid out like `projectTimeGrid`: fragments, overlap lanes,
 * and the all-day row, over one or more days. An event with several resources shows in each of
 * their columns. The events are queried and split by day once, and the day columns, with their
 * DST bands, are shared.
 */
export function projectResourceColumns<TEvent>({
  environment,
  expandedResourceIds,
  range,
  resources,
  snapshot,
  today,
  unassigned,
}: ResourceColumnsProjectionInput<TEvent>): ResourceColumnsProjection<TEvent> {
  const { timeZone } = environment;
  const visible = visibleResources(resources, expandedResourceIds, { unassigned });
  const fragments = splitEventsByDay(
    queryVisibleEvents(snapshot, range, timeZone),
    range,
    timeZone,
  );
  const columns = timeGridColumns(range, timeZone);
  const byResource = groupByResource(fragments, visible);

  return Object.freeze({
    columns,
    resources: Object.freeze(
      visible.map((resource, index) =>
        Object.freeze({
          ...timeGridOf(byResource[index]!, columns, range, today),
          resource,
        }),
      ),
    ),
  });
}

/**
 * Range, navigation, keyboard navigation, title, and projection for resource columns over a day,
 * a week, or N days.
 * `options.unassigned` decides where events without resources go.
 */
export function resourceColumnsStrategy<
  TOptions extends ResourceVisibilityOptions = ResourceVisibilityOptions,
  TEvent = unknown,
>(span: TimeGridSpan): CalendarViewStrategy<ResourceColumnsProjection<TEvent>, TOptions, TEvent> {
  const strategy: CalendarViewStrategy<ResourceColumnsProjection<TEvent>, TOptions, TEvent> = {
    getRange: (anchor, environment) => timeGridRange(anchor, span, environment.weekRules),
    getSpatialNavigation: resourceColumnsSpatialNavigation,
    getTitle: (range, environment) => timeGridTitle(range, environment.locale),
    navigate: (anchor, delta) => navigateTimeGrid(anchor, delta, span),
    project: (input) => projectResourceColumns({ ...input, unassigned: input.options.unassigned }),
  };
  return Object.freeze(strategy);
}
