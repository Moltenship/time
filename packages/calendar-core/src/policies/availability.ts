import {
  instantInterval,
  iteratePlainDates,
  plainDateInterval,
} from "@moltenship/calendar-temporal";

import { isClosedOn } from "../availability/closures";
import { wallBoundary } from "../availability/schedule";
import type { AvailabilitySchedule } from "../availability/types";
import type { EventId, ResourceId } from "../ids";
import type { CalendarEventPlacement } from "../transactions/types";
import type { CalendarPolicy } from "./types";

export interface AvailabilityPolicyOptions {
  /**
   * `"block"` (the default) rejects a change outside the hours it must fit; `"warn"` lets it
   * through, flagged in its `warnings`. Either way the reason is `"outside-availability"`.
   */
  readonly mode?: "block" | "warn";
}

const reason = "outside-availability";

/** Whether two placements cover the same time; a timed one's source time zone doesn't count. */
function sameTime(left: CalendarEventPlacement, right: CalendarEventPlacement): boolean {
  return (
    left.kind === right.kind &&
    left.start.toString() === right.start.toString() &&
    left.end.toString() === right.end.toString()
  );
}

/** Whether a placement fits a schedule: its time is open, or every date of an all-day one is. */
function fits(
  placement: CalendarEventPlacement<ResourceId>,
  schedule: AvailabilitySchedule | null,
  timeZone: string,
): boolean {
  if (schedule === null) return true;
  switch (placement.kind) {
    case "timed":
      return schedule.isAvailable(instantInterval(placement.start, placement.end));
    case "floating": {
      // Floating times read on the display time zone's wall clock, as the views show them. Times
      // in a skipped hour take the jump past it, so one wholly inside it takes no time at all.
      const start = wallBoundary(placement.start, timeZone, "start");
      const end = wallBoundary(placement.end, timeZone, "end");
      return (
        start >= end ||
        schedule.isAvailable(
          instantInterval(
            Temporal.Instant.fromEpochNanoseconds(start),
            Temporal.Instant.fromEpochNanoseconds(end),
          ),
        )
      );
    }
    case "all-day":
      return Array.from(iteratePlainDates(plainDateInterval(placement.start, placement.end))).every(
        (date) => !isClosedOn(schedule, date, schedule.timeZone),
      );
  }
}

/**
 * Checks changes against the root's `availability`: the calendar's hours for an event without
 * resources, and each resource's own, on its time zone, for one with resources. A timed event
 * must fall in open time, and an all-day one on dates with open time. Only what a change alters
 * is checked: its time, or the resources it adds when the time stays, so events already outside
 * the hours can still be edited. Deletes always pass.
 */
export function availabilityPolicy<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>({ mode = "block" }: AvailabilityPolicyOptions = {}): CalendarPolicy<
  TEvent,
  TEventId,
  TResourceId
> {
  return ({ original, proposed }, { availability, timeZone }) => {
    if (proposed === null || availability === undefined) return { type: "accept" };
    // The unassigned bucket (`null`) follows the calendar's hours.
    const booked = (resourceIds: readonly TResourceId[]): readonly (TResourceId | null)[] =>
      resourceIds.length === 0 ? [null] : resourceIds;
    const after = booked(proposed.resourceIds);
    const checked =
      original !== null && sameTime(original, proposed)
        ? after.filter((resourceId) => !booked(original.resourceIds).includes(resourceId))
        : after;
    const outside = checked.some(
      (resourceId) => !fits(proposed, availability.forResource(resourceId), timeZone),
    );
    if (!outside) return { type: "accept" };
    return mode === "warn" ? { reason, type: "warn" } : { reason, type: "reject" };
  };
}
