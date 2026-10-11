import { instantInterval } from "@moltenship/calendar-temporal";

import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot, NormalizedCalendarEvent } from "../snapshots/types";
import { occupancy, type BusyQuery, type BusyStatus } from "./busy";
import { availabilityClosures, type UnavailableReason } from "./closures";
import type { AvailabilitySchedule, AvailabilitySnapshot } from "./types";

/**
 * Whether an instant is within working hours, and when that changes. `closesAt` and `opensAt`
 * are `null` when it doesn't within a year.
 */
export type AvailabilityStatus =
  | { readonly available: true; readonly closesAt: Temporal.Instant | null }
  | {
      readonly available: false;
      readonly reason: UnavailableReason;
      /** The label of the exception that closes it, such as "Public holiday". */
      readonly label?: string;
      readonly opensAt: Temporal.Instant | null;
    };

/** How far ahead a status looks for the next change: a week at a time, for a year. */
const WEEK = { hours: 7 * 24 } as const;
const WEEKS = 53;

/** Where the first open (`"available"`) or closed time from `at` starts, within a year. */
function nextStart(
  schedule: AvailabilitySchedule,
  at: Temporal.Instant,
  kind: "available" | "unavailable",
): Temporal.Instant | null {
  let cursor = at;
  for (let week = 0; week < WEEKS; week++) {
    const end = cursor.add(WEEK);
    const [first] = schedule[kind](instantInterval(cursor, end));
    if (first !== undefined) return first.start;
    cursor = end;
  }
  return null;
}

/**
 * Whether `at` is within working hours: the calendar's, or with `resourceId` that resource's, on
 * its own time zone. Outside them it says why, and when they open; inside, when they close.
 */
export function availabilityAt(
  availability: AvailabilitySnapshot,
  at: Temporal.Instant,
  resourceId?: ResourceId | null,
): AvailabilityStatus {
  const schedule = availability.forResource(resourceId ?? null);
  if (schedule === null) return Object.freeze({ available: true, closesAt: null });
  const [closure] = availabilityClosures(schedule, instantInterval(at, at.add({ nanoseconds: 1 })));
  if (closure === undefined) {
    return Object.freeze({ available: true, closesAt: nextStart(schedule, at, "unavailable") });
  }
  const { label, reason } = closure;
  return Object.freeze({
    available: false,
    ...(label === undefined ? {} : { label }),
    opensAt: nextStart(schedule, at, "available"),
    reason,
  });
}

/** Working hours and events at one instant, kept apart: see `availabilityAt` and `busyAt`. */
export interface ResourceStatus<TEvent> {
  readonly availability: AvailabilityStatus;
  readonly busy: BusyStatus<TEvent>;
  /** The first instant either can change at; `null` when neither does within its horizon. */
  readonly changesAt: Temporal.Instant | null;
}

/**
 * Whether `at` is within the working hours of `query.resourceId` (or the calendar's), and
 * whether that resource's events (or any) occupy it, with when either next changes.
 */
export function resourceStatusAt<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  availability: AvailabilitySnapshot,
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
  at: Temporal.Instant,
  query: BusyQuery<TResourceId>,
): ResourceStatus<NormalizedCalendarEvent<TEvent, TEventId, TResourceId>> {
  const hours = availabilityAt(availability, at, query.resourceId);
  const occupied = occupancy(events, at, query);
  const changes = [hours.available ? hours.closesAt : hours.opensAt, occupied.changesAt].filter(
    (instant) => instant !== null,
  );
  return Object.freeze({
    availability: hours,
    busy: occupied.status,
    changesAt: changes.sort((left, right) => Temporal.Instant.compare(left, right))[0] ?? null,
  });
}
