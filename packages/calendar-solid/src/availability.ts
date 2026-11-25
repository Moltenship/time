import {
  closedDates,
  projectTimeGridAvailability,
  projectTimelineAvailability,
  type AvailabilityBand,
  type AvailabilityExtent,
  type AvailabilitySnapshot,
  type ClosedDate,
  type ResourceId,
  type TimeGridColumn,
} from "@moltenship/calendar-core";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import { createMemo, type Accessor } from "solid-js";

import { access, useShared, type MaybeAccessor } from "./shared";

/** The root's working hours, as an accessor: the calendar's, and each resource's on its zone. */
export function useCalendarAvailability(): Accessor<AvailabilitySnapshot> {
  return useShared().availability;
}

/**
 * The closed time of each time-grid column, as bands on its 24-hour axis with their reasons: the
 * calendar's, or with `resourceId` that resource's, on its own time zone. See
 * `projectTimeGridAvailability`.
 */
export function useTimeGridAvailability(
  columns: MaybeAccessor<readonly TimeGridColumn[]>,
  resourceId?: MaybeAccessor<ResourceId | null | undefined>,
): Accessor<readonly (readonly AvailabilityBand[])[]> {
  const { availability } = useShared();
  return createMemo(() =>
    projectTimeGridAvailability(
      access(columns),
      availability().forResource(access(resourceId) ?? null),
    ),
  );
}

/**
 * The closed time along a timeline of `columns`: the calendar's, or with `resourceId` that
 * resource's. See `projectTimelineAvailability`.
 */
export function useTimelineAvailability(
  columns: MaybeAccessor<readonly TimeGridColumn[]>,
  resourceId?: MaybeAccessor<ResourceId | null | undefined>,
): Accessor<readonly AvailabilityExtent[]> {
  const { availability } = useShared();
  return createMemo(() =>
    projectTimelineAvailability(
      access(columns),
      availability().forResource(access(resourceId) ?? null),
    ),
  );
}

/**
 * The dates of `range` with no open time on their day in the display time zone: the calendar's,
 * or with `resourceId` that resource's. See `closedDates`.
 */
export function useClosedDates(
  range: MaybeAccessor<PlainDateInterval>,
  resourceId?: MaybeAccessor<ResourceId | null | undefined>,
): Accessor<ReadonlyMap<string, ClosedDate>> {
  const { availability } = useShared();
  return createMemo(() => {
    const current = availability();
    return closedDates(
      access(range),
      current.forResource(access(resourceId) ?? null),
      current.timeZone,
    );
  });
}
