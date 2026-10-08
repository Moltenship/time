import type { EventId, ResourceId } from "../ids";
import type { CalendarPolicy } from "./types";

function toInstant(
  point: Temporal.Instant | Temporal.PlainDate | Temporal.PlainDateTime,
  timeZone: string,
): Temporal.Instant {
  if (point instanceof Temporal.Instant) return point;
  // Dates resolve to the start of their day; date-times use compatible disambiguation.
  if (point instanceof Temporal.PlainDate) return point.toZonedDateTime(timeZone).toInstant();
  return point.toZonedDateTime(timeZone).toInstant();
}

/**
 * Rejects changes that would place an event outside `[start, end)`. All-day and floating events
 * are compared on the display time zone's wall clock.
 */
export function boundsPolicy<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(bounds: {
  readonly end?: Temporal.Instant;
  readonly start?: Temporal.Instant;
}): CalendarPolicy<TEvent, TEventId, TResourceId> {
  return ({ proposed }, { timeZone }) => {
    if (proposed === null) return { type: "accept" };
    const outside =
      (bounds.start !== undefined &&
        Temporal.Instant.compare(toInstant(proposed.start, timeZone), bounds.start) < 0) ||
      (bounds.end !== undefined &&
        Temporal.Instant.compare(toInstant(proposed.end, timeZone), bounds.end) > 0);
    return outside ? { reason: "out-of-bounds", type: "reject" } : { type: "accept" };
  };
}
