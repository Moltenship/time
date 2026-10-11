import {
  closedDates,
  projectTimeGridAvailability,
  projectTimelineAvailability,
  type AvailabilitySnapshot,
  type ClosedDate,
  type ResourceId,
  type TimeGridBand,
  type TimeGridColumn,
  type TimelineExtent,
} from "@moltenship/calendar-core";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import { createContext, useContext, useMemo, type Context } from "react";

/** The nearest root's working hours, shared by every factory so the hooks work in any view. */
export const CalendarAvailabilityContext: Context<AvailabilitySnapshot | null> =
  createContext<AvailabilitySnapshot | null>(null);

/** The root's working hours: the calendar's, and each resource's on its time zone. */
export function useCalendarAvailability(): AvailabilitySnapshot {
  const availability = useContext(CalendarAvailabilityContext);
  if (availability === null) throw new Error("calendar-hook-outside-root");
  return availability;
}

/**
 * The closed time of each time-grid column, as bands on its 24-hour axis: the calendar's, or with
 * `resourceId` that resource's, on its own time zone. See `projectTimeGridAvailability`.
 */
export function useTimeGridAvailability(
  columns: readonly TimeGridColumn[],
  resourceId?: ResourceId | null,
): readonly (readonly TimeGridBand[])[] {
  const schedule = useCalendarAvailability().forResource(resourceId ?? null);
  return useMemo(() => projectTimeGridAvailability(columns, schedule), [columns, schedule]);
}

/**
 * The closed time along a timeline of `columns`: the calendar's, or with `resourceId` that
 * resource's. See `projectTimelineAvailability`.
 */
export function useTimelineAvailability(
  columns: readonly TimeGridColumn[],
  resourceId?: ResourceId | null,
): readonly TimelineExtent[] {
  const schedule = useCalendarAvailability().forResource(resourceId ?? null);
  return useMemo(() => projectTimelineAvailability(columns, schedule), [columns, schedule]);
}

/**
 * The dates of `range` with no open time on their day in the display time zone: the calendar's,
 * or with `resourceId` that resource's. See `closedDates`.
 */
export function useClosedDates(
  range: PlainDateInterval,
  resourceId?: ResourceId | null,
): ReadonlyMap<string, ClosedDate> {
  const availability = useCalendarAvailability();
  const schedule = availability.forResource(resourceId ?? null);
  const { timeZone } = availability;
  return useMemo(() => closedDates(range, schedule, timeZone), [range, schedule, timeZone]);
}
