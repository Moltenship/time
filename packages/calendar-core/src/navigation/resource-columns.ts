import type { ResourceColumnsProjection } from "../views/resource-columns/projection";
import { timeGridColumnsNavigation } from "./time-grid";
import type { CalendarSpatialNavigation, CalendarSpatialNavigationInput } from "./types";

/**
 * Spatial navigation for resource columns from `projectResourceColumns`, laid out resource by
 * resource, each with its dates. Within a column it is `timeGridSpatialNavigation`'s; left and
 * right step to the neighbouring column, crossing into the next resource, and past either end
 * move a whole range in time. Home and End go to the first and last column, and Page Up and Page
 * Down by the range within the resource. Every focus names its column's resource.
 */
export function resourceColumnsSpatialNavigation(
  input: CalendarSpatialNavigationInput<ResourceColumnsProjection<unknown>, unknown>,
): CalendarSpatialNavigation | null {
  return timeGridColumnsNavigation(
    input,
    input.projection.resources.flatMap(({ allDay, days, resource }) =>
      days.map(({ column, events, isToday }) => ({
        allDay,
        date: column.date,
        events,
        isToday,
        resourceId: resource.id,
      })),
    ),
  );
}
