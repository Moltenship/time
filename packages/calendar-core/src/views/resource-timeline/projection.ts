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
import { resourceTimelineSpatialNavigation } from "../../navigation/resource-timeline";
import { compareEventIds, splitEventsByDay } from "../../projection/day-fragments";
import { queryVisibleEvents } from "../../projection/visible-events";
import {
  groupByResource,
  visibleResources,
  type ResourceVisibilityOptions,
  type VisibleResource,
} from "../../resources/visible";
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

export interface ResourceTimelineOptions extends ResourceVisibilityOptions {
  /** What a slot spans: an hour, or a whole day. Hours for one day and days for longer ranges by default. */
  readonly slotUnit?: "day" | "hour";
}

/** An event along an hour timeline's row, clipped to the range and placed in a lane. */
export interface ResourceTimelineBar<TEvent> extends TimelineExtent {
  /** The event continues after the range. */
  readonly endsAfter: boolean;
  readonly event: NormalizedCalendarEvent<TEvent, EventId, ResourceId>;
  /** Zero-based; bars in one lane never overlap. */
  readonly lane: number;
  /** The event began before the range. */
  readonly startsBefore: boolean;
}

/** A visible resource of a day timeline: its events laid out like a month row. */
export interface ResourceTimelineDayRow<TEvent> {
  readonly laneCount: number;
  readonly resource: VisibleResource;
  readonly segments: readonly DayGridSegment<TEvent, EventId, ResourceId>[];
}

/** A visible resource of an hour timeline: its events as bars along the wall clock. */
export interface ResourceTimelineHourRow<TEvent> {
  /** Bars in placement order: earlier start, longer, then event ID. */
  readonly bars: readonly ResourceTimelineBar<TEvent>[];
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

type UnplacedBar<TEvent> = Omit<ResourceTimelineBar<TEvent>, "lane">;

/**
 * Packs one row's bars into lanes, greedily in a fixed order (earlier start, longer, event ID), so
 * lanes do not depend on input order or on other rows.
 */
function packLanes<TEvent>(
  bars: readonly UnplacedBar<TEvent>[],
  minimumWidth: number,
): { readonly bars: readonly ResourceTimelineBar<TEvent>[]; readonly laneCount: number } {
  const laneEnds: number[] = [];
  const placed = bars
    .toSorted(
      (left, right) =>
        left.start - right.start ||
        right.end - left.end ||
        compareEventIds(left.event.id, right.event.id),
    )
    .map((bar) => {
      const free = laneEnds.findIndex((end) => end <= bar.start);
      const lane = free === -1 ? laneEnds.length : free;
      laneEnds[lane] = Math.max(bar.end, bar.start + minimumWidth);
      return Object.freeze({ ...bar, lane });
    });
  return { bars: Object.freeze(placed), laneCount: laneEnds.length };
}

/**
 * A row per visible resource, an event showing in each of its resources' rows. With day slots a
 * row lays its events out like a month row, a segment per run of days; with hour slots each event
 * is one bar along the nominal wall clock, clipped to the range and not split by day, and bars are
 * packed into lanes per row.
 */
export function projectResourceTimeline<TEvent>({
  environment,
  expandedResourceIds,
  instantRange,
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
  const rows = visible.map((resource, index) =>
    Object.freeze({ ...packLanes(byResource[index]!, minimumWidth), resource }),
  );
  return Object.freeze({ columns, rows: Object.freeze(rows), today, unit: "hour" });
}

/**
 * Range, navigation, keyboard navigation, title, and projection for a resource timeline over
 * days, a week, or a calendar month. `options.slotUnit` picks day or hour slots and
 * `options.unassigned` where events without resources go.
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
        slotUnit: input.options.slotUnit,
        unassigned: input.options.unassigned,
      }),
  };
  return Object.freeze(strategy);
}
