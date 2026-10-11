import {
  useTimeGridAvailability,
  type ResourceId,
  type TimeGridBand,
  type TimeGridColumn,
} from "@moltenship/calendar";
import { useMemo } from "react";

import { percent } from "./time-grid-event";

const noBands: readonly TimeGridBand[] = Object.freeze([]);

/**
 * A column's closed time from the root's working hours: the calendar's, or with `resourceId` that
 * resource's, on its own time zone.
 */
export function useColumnAvailability(
  column: TimeGridColumn,
  resourceId?: ResourceId | null,
): readonly TimeGridBand[] {
  const columns = useMemo(() => [column], [column]);
  return useTimeGridAvailability(columns, resourceId)[0] ?? noBands;
}

/** Well under a millisecond of the axis, so bands that only touch never count as overlapping. */
const EPSILON = 1e-9;

/** Whether any of `band` is closed, such as a focused slot, so its name can say so. */
export function isUnavailableIn(bands: readonly TimeGridBand[], band: TimeGridBand): boolean {
  return bands.some(
    ({ height, top }) =>
      top < band.top + band.height - EPSILON && top + height > band.top + EPSILON,
  );
}

/**
 * Shading over a column's closed time, behind its events. Screen readers hear it in the focused
 * slot's name instead, so the shading is hidden from them.
 */
export function TimeGridAvailability({ bands }: { readonly bands: readonly TimeGridBand[] }) {
  return bands.map(({ height, top }) => (
    <div
      key={top}
      aria-hidden
      data-slot="time-grid-unavailable"
      className="pointer-events-none absolute inset-x-0 bg-calendar-unavailable"
      style={{ height: percent(height), top: percent(top) }}
    />
  ));
}
