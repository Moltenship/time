import type {
  CalendarEventChange,
  CalendarEventPlacement,
  CalendarPolicyDecision,
} from "@moltenship/calendar";

import type { DemoEvent, DemoOccurrence } from "./calendar";
import type { DemoResourceId } from "./resources";

/** A change from the calendar, which shows occurrences: one-off events keep their own IDs. */
export type DemoEventChange = CalendarEventChange<DemoOccurrence, string, DemoResourceId>;

/** A calendar policy: demo events are timed or all-day. */
export function demoEventPolicy(change: DemoEventChange): CalendarPolicyDecision<DemoResourceId> {
  if (change.proposed?.kind === "floating") {
    return { reason: "Demo events are timed or all-day.", type: "reject" };
  }
  return { type: "accept" };
}

/**
 * The event at `placement`: its interval and resources, and everything else it had. A timed
 * event keeps the zone it repeats in unless the placement names another.
 */
export function withPlacement(
  event: DemoEvent,
  placement: CalendarEventPlacement<DemoResourceId>,
): DemoEvent {
  const { end: _end, kind: _kind, resourceIds: _resourceIds, start: _start, ...rest } = event;
  const { sourceTimeZone: _zone, ...details } = rest as typeof rest & { sourceTimeZone?: string };
  const { resourceIds } = placement;
  const base = { ...details, ...(resourceIds.length === 0 ? {} : { resourceIds }) };
  if (placement.kind === "timed") {
    const zone =
      placement.sourceTimeZone ?? (event.kind === "timed" ? event.sourceTimeZone : undefined);
    return {
      ...base,
      end: placement.end,
      kind: "timed",
      ...(zone === undefined ? {} : { sourceTimeZone: zone }),
      start: placement.start,
    };
  }
  if (placement.kind === "all-day") {
    return { ...base, end: placement.end, kind: "all-day", start: placement.start };
  }
  return event;
}

/**
 * The events after a move, resize or delete of a one-off event that passed `demoEventPolicy`.
 * Changes to occurrences of a series go through `applySeriesEdit` instead.
 */
export function applyEventChange(
  events: readonly DemoEvent[],
  change: DemoEventChange,
): readonly DemoEvent[] {
  if (change.cause === "delete") return events.filter(({ id }) => id !== change.eventId);
  // A dragged-out range opens the event dialog instead, which saves the named event.
  if (change.cause === "create") return events;
  return events.map((event) =>
    event.id === change.eventId ? withPlacement(event, change.proposed) : event,
  );
}
