"use client";

import {
  useTimeGridAvailability,
  type AvailabilityBand,
  type CalendarResource,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar";
import { useMemo } from "react";

import { UnavailableTime, type UnavailableTimeRender } from "@registry/calendar/unavailable-time";

import { timeGridUnavailableClass } from "@registry/shared/time-grid-view/time-grid.styles";

import { percent } from "./time-grid-event";

const noBands: readonly AvailabilityBand[] = Object.freeze([]);

/**
 * A column's closed time from the root's working hours: the calendar's, or with `resourceId` that
 * resource's, on its own time zone.
 */
export function useColumnAvailability(
  column: TimeGridColumn,
  resourceId?: ResourceId | null,
): readonly AvailabilityBand[] {
  const columns = useMemo(() => [column], [column]);
  return useTimeGridAvailability(columns, resourceId)[0] ?? noBands;
}

export { isUnavailableIn } from "@registry/shared/time-grid-view/time-grid-geometry";

/**
 * Shading over a column's closed time, behind its events; `render` replaces it. Screen readers
 * hear it in the focused slot's name instead, so the shading is hidden from them.
 */
export function TimeGridAvailability({
  bands,
  date,
  render,
  resource,
}: {
  readonly bands: readonly AvailabilityBand[];
  readonly date: Temporal.PlainDate;
  readonly render?: UnavailableTimeRender;
  /** The resource whose hours these are; `null` for the calendar's own. */
  readonly resource: CalendarResource<unknown, ResourceId> | null;
}) {
  return bands.map((band) => (
    <UnavailableTime
      key={band.top}
      band={band}
      className={timeGridUnavailableClass}
      date={date}
      end={band.top + band.height}
      render={render}
      resource={resource}
      slot="time-grid-unavailable"
      start={band.top}
      style={{ height: percent(band.height), top: percent(band.top) }}
    />
  ));
}
