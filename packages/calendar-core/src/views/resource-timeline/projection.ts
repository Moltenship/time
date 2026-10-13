import {
  compareInstants,
  comparePlainDates,
  comparePlainDateTimes,
  type InstantInterval,
  type PlainDateInterval,
} from "@moltenship/calendar-temporal";

import type { CalendarEventInterval } from "../../events";
import type { EventId, ResourceId } from "../../ids";
import { layoutDayGridRow, type DayGridSegment } from "../../layout/day-grid";
import type { OverlapLayout, ResourceOverlapLayoutOptions } from "../../layout/timed-overlap";
import { resourceTimelineSpatialNavigation } from "../../navigation/resource-timeline";
import { compareEventIds, splitEventsByDay } from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import {
  groupByResource,
  visibleResources,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "../../resources/visible";
import type { CalendarResource } from "../../resources";
import type { NormalizedCalendarEvent } from "../../snapshots/types";
import type { CalendarViewProjectionInput, CalendarViewStrategy } from "../../views";
import { timeGridColumns, type TimeGridColumn } from "../time-grid/columns";
import { timelineExtent, type TimelineExtent } from "./geometry";
import {
  navigateResourceTimeline,
  resourceTimelineRange,
  resourceTimelineTitle,
  type ResourceTimelineSpan,
} from "./range";

/** Shorter events still reserve a quarter hour of the row when lanes are packed. */
const MINIMUM_EVENT_MINUTES = 15;
/** How far each level of a stack sits below the one it covers, in lanes. */
const STACK_STEP = 1 / 3;
/** The furthest a stack offsets its deepest bar, in lanes, so a stacked row is two lanes at most. */
const MAX_STACK_OFFSET = 1;

export interface ResourceTimelineOptions extends ResourceVisibilityOptions {
  /** What a slot spans: an hour, or a whole day. Hours for one day and days for longer ranges by default. */
  readonly slotUnit?: "day" | "hour";
}

/**
 * How an hour timeline's rows share out overlapping events, as the resource's
 * `getResourceOverlapLayout`, or else `overlapLayout`, chooses: `"columns"` and `"equal"` give
 * each level of overlap a lane of its own, the row growing to fit, and `"stack"` cascades them
 * within about a lane, each bar a third of a lane below the one it covers. Each event's own
 * `getEventOverlapLayout` refines it as in the time grid: a group of overlapping events that all
 * agree takes it. A day timeline lays each row out like a month row, whatever the layout.
 */
export type ResourceTimelineLayoutOptions<
  TEvent = unknown,
  TResource = CalendarResource<unknown, ResourceId>,
> = Omit<ResourceOverlapLayoutOptions<TEvent, TResource>, "stackIndent">;

/** An event along an hour timeline's row, clipped to the range and placed in a lane. */
export interface ResourceTimelineBar<TEvent> extends TimelineExtent {
  /** The event continues after the range. */
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  /** Zero-based, its level in a stack; bars in one lane never overlap. */
  readonly lane: number;
  /** The event began before the range. */
  readonly startsBefore: boolean;
  /**
   * How far below the row's first lane the bar sits, in lanes: its `lane`, or in a stack a
   * fraction of it, so the bar covers part of the ones before it.
   */
  readonly top: number;
}

/** A visible resource of a day timeline: its events laid out like a month row. */
export interface ResourceTimelineDayRow<TEvent> {
  readonly laneCount: number;
  readonly resource: VisibleResource;
  readonly segments: readonly DayGridSegment<TEvent, EventId, ResourceId>[];
}

/** A visible resource of an hour timeline: its events as bars along the wall clock. */
export interface ResourceTimelineHourRow<TEvent> {
  /**
   * Bars in placement order: earlier start, longer, then event ID. It's also the order they cover
   * each other in a stack: render them in order.
   */
  readonly bars: readonly ResourceTimelineBar<TEvent>[];
  /** How many lanes tall the row's bars reach: `laneCount`, or less where they stack. */
  readonly height: number;
  readonly laneCount: number;
  readonly resource: VisibleResource;
}

export type ResourceTimelineProjection<TEvent> = {
  /**
   * The time axis: a nominal 24-hour day per visible date, with its DST bands. Pass them to the
   * pointer layer, and to `timelineExtent` and `timelinePosition`.
   */
  readonly columns: readonly TimeGridColumn[];
  /** The current date in the display time zone, or `null` until a clock is available. */
  readonly today: Temporal.PlainDate | null;
} & (
  | { readonly rows: readonly ResourceTimelineDayRow<TEvent>[]; readonly unit: "day" }
  | { readonly rows: readonly ResourceTimelineHourRow<TEvent>[]; readonly unit: "hour" }
);

export type ResourceTimelineProjectionInput<TEvent> = Pick<
  CalendarViewProjectionInput<unknown, TEvent>,
  | "environment"
  | "expandedResourceIds"
  | "instantRange"
  | "range"
  | "resources"
  | "snapshot"
  | "today"
> &
  ResourceTimelineLayoutOptions<TEvent> &
  ResourceTimelineOptions;

/** Whether an event starts before or ends after the range, each kind on its own clock. */
function beyond(
  event: CalendarEventInterval,
  range: PlainDateInterval,
  instants: InstantInterval,
): { readonly endsAfter: boolean; readonly startsBefore: boolean } {
  switch (event.kind) {
    case "timed":
      return {
        endsAfter: compareInstants(event.end, instants.end) > 0,
        startsBefore: compareInstants(event.start, instants.start) < 0,
      };
    case "floating":
      return {
        endsAfter: comparePlainDateTimes(event.end, range.end.toPlainDateTime()) > 0,
        startsBefore: comparePlainDateTimes(event.start, range.start.toPlainDateTime()) < 0,
      };
    case "all-day":
      return {
        endsAfter: comparePlainDates(event.end, range.end) > 0,
        startsBefore: comparePlainDates(event.start, range.start) < 0,
      };
  }
}

type UnplacedBar<TEvent> = Omit<ResourceTimelineBar<TEvent>, "lane" | "top">;

interface RowLayout<TEvent> {
  /** The row's layout, which a group of bars that disagree takes. */
  readonly fallback: OverlapLayout;
  readonly own?: (event: TEvent) => OverlapLayout | undefined;
}

/**
 * Lays one row's bars out, in a fixed order (earlier start, longer, event ID), so lanes depend on
 * neither input order nor other rows. Bars that overlap, transitively, form a group laid out on
 * its own: the layout its bars agree on, or else the row's. In lanes, each bar takes the lowest
 * lane free at its start; in a stack, each sits one level deeper than the deepest earlier bar it
 * overlaps, a third of a lane lower, and less in a deep stack.
 */
function layoutRow<TEvent>(
  bars: readonly UnplacedBar<TEvent>[],
  minimumWidth: number,
  { fallback, own }: RowLayout<TEvent>,
): Pick<ResourceTimelineHourRow<TEvent>, "bars" | "height" | "laneCount"> {
  const sorted = bars.toSorted(
    (left, right) =>
      left.start - right.start ||
      right.end - left.end ||
      compareEventIds(left.event.id, right.event.id),
  );
  const placed: ResourceTimelineBar<TEvent>[] = [];
  let laneCount = 0;
  let height = 0;
  const placeGroup = (group: readonly UnplacedBar<TEvent>[]) => {
    let layout: OverlapLayout | undefined;
    for (const { event } of group) {
      const mine = own?.(event.event) ?? fallback;
      layout = layout === undefined || layout === mine ? mine : fallback;
    }
    // Where each lane, or each level of the stack, is free from: its last bar's reserved end.
    const ends: number[] = [];
    const lanes = group.map((bar) => {
      const end = Math.max(bar.end, bar.start + minimumWidth);
      const lane =
        layout === "stack"
          ? ends.reduce((deepest, open, level) => (open > bar.start ? level + 1 : deepest), 0)
          : ends.findIndex((open) => open <= bar.start);
      const at = lane === -1 ? ends.length : lane;
      ends[at] = end;
      return at;
    });
    const deepest = Math.max(0, ...lanes);
    const step =
      layout === "stack" && deepest > 0 ? Math.min(STACK_STEP, MAX_STACK_OFFSET / deepest) : 1;
    group.forEach((bar, index) => {
      placed.push(Object.freeze({ ...bar, lane: lanes[index]!, top: lanes[index]! * step }));
    });
    laneCount = Math.max(laneCount, deepest + 1);
    height = Math.max(height, deepest * step + 1);
  };

  let group: UnplacedBar<TEvent>[] = [];
  let groupEnd = -Infinity;
  for (const bar of sorted) {
    if (groupEnd <= bar.start) {
      if (group.length > 0) placeGroup(group);
      group = [];
    }
    group.push(bar);
    groupEnd = Math.max(groupEnd, bar.end, bar.start + minimumWidth);
  }
  if (group.length > 0) placeGroup(group);
  return { bars: Object.freeze(placed), height, laneCount };
}

/**
 * A row per visible resource, an event showing in each of its resources' rows. With day slots a
 * row lays its events out like a month row, a segment per run of days; with hour slots each event
 * is one bar along the nominal wall clock, clipped to the range and not split by day, and bars are
 * laid out per row: in lanes, or stacked where the row's layout or a group's own says so; see
 * `ResourceTimelineOptions`.
 */
export function projectResourceTimeline<TEvent>({
  environment,
  expandedResourceIds,
  getEventOverlapLayout,
  getResourceOverlapLayout,
  instantRange,
  overlapLayout = "columns",
  range,
  resources,
  snapshot,
  slotUnit = range.start.until(range.end).days === 1 ? "hour" : "day",
  today,
  unassigned,
}: ResourceTimelineProjectionInput<TEvent>): ResourceTimelineProjection<TEvent> {
  const { timeZone } = environment;
  const visible = visibleResources(resources, expandedResourceIds, { unassigned });
  const columns = timeGridColumns(range, timeZone);
  const events = queryVisibleEvents(snapshot, range, timeZone);

  if (slotUnit === "day") {
    const byResource = groupByResource(splitEventsByDay(events, range, timeZone), visible);
    const rows = visible.map((resource, index) => {
      const { laneCount, segments } = layoutDayGridRow(range, byResource[index]!);
      return Object.freeze({ laneCount, resource, segments });
    });
    return Object.freeze({ columns, rows: Object.freeze(rows), today, unit: "day" });
  }

  const bars = events.flatMap((event) => {
    const extent = timelineExtent(columns, event);
    return extent === null ? [] : [{ ...extent, ...beyond(event, range, instantRange), event }];
  });
  const byResource = groupByResource(bars, visible);
  const minimumWidth = MINIMUM_EVENT_MINUTES / (columns.length * 24 * 60);
  const rows = visible.map((resource, index) => {
    // The unassigned bucket isn't a resource, so it keeps the view's layout.
    const fallback =
      (resource.resource === null ? undefined : getResourceOverlapLayout?.(resource.resource)) ??
      overlapLayout;
    const layout = { fallback, own: getEventOverlapLayout };
    return Object.freeze({ ...layoutRow(byResource[index]!, minimumWidth, layout), resource });
  });
  return Object.freeze({ columns, rows: Object.freeze(rows), today, unit: "hour" });
}

/**
 * The overlap layout a view's options choose. Views type their events and resources, so these are
 * read apart from the strategy's options type.
 */
function layoutOptionsOf<TEvent>(options: object): ResourceTimelineLayoutOptions<TEvent> {
  const { getEventOverlapLayout, getResourceOverlapLayout, overlapLayout } =
    options as ResourceTimelineLayoutOptions<TEvent>;
  return { getEventOverlapLayout, getResourceOverlapLayout, overlapLayout };
}

/**
 * Range, navigation, keyboard navigation, title, and projection for a resource timeline over
 * days, a week, or a calendar month. `options.slotUnit` picks day or hour slots,
 * `options.unassigned` where events without resources go, and the `overlapLayout`,
 * `getResourceOverlapLayout` and `getEventOverlapLayout` options how an hour row's overlapping
 * events share it.
 */
export function resourceTimelineStrategy<
  TOptions extends ResourceTimelineOptions = ResourceTimelineOptions,
  TEvent = unknown,
>(
  span: ResourceTimelineSpan,
): CalendarViewStrategy<ResourceTimelineProjection<TEvent>, TOptions, TEvent> {
  const strategy: CalendarViewStrategy<ResourceTimelineProjection<TEvent>, TOptions, TEvent> = {
    getRange: (anchor, environment) => resourceTimelineRange(anchor, span, environment.weekRules),
    getSpatialNavigation: resourceTimelineSpatialNavigation,
    getTitle: (range, environment) => resourceTimelineTitle(range, span, environment.locale),
    navigate: (anchor, delta) => navigateResourceTimeline(anchor, delta, span),
    project: (input) =>
      projectResourceTimeline({
        ...input,
        ...layoutOptionsOf<TEvent>(input.options),
        slotUnit: input.options.slotUnit,
        unassigned: input.options.unassigned,
      }),
  };
  return Object.freeze(strategy);
}
