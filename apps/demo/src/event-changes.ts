import type {
  CalendarEventChange,
  CalendarEventPlacement,
  CalendarPolicyDecision,
} from "@moltenship/calendar";

import type { DemoEvent } from "./calendar";
import type { DemoResourceId } from "./resources";

export type DemoEventChange = CalendarEventChange<DemoEvent, string, DemoResourceId>;

/** A calendar policy: demo events are timed or all-day. */
export function demoEventPolicy(change: DemoEventChange): CalendarPolicyDecision<DemoResourceId> {
  if (change.proposed?.kind === "floating") {
    return { reason: "Demo events are timed or all-day.", type: "reject" };
  }
  return { type: "accept" };
}

function withPlacement(
  event: DemoEvent,
  placement: CalendarEventPlacement<DemoResourceId>,
): DemoEvent {
  const { resourceIds } = placement;
  const base = {
    calendarId: event.calendarId,
    id: event.id,
    title: event.title,
    ...(event.description === undefined ? {} : { description: event.description }),
    ...(resourceIds.length === 0 ? {} : { resourceIds }),
  };
  if (placement.kind === "timed") {
    return { ...base, end: placement.end, kind: "timed", start: placement.start };
  }
  if (placement.kind === "all-day") {
    return { ...base, end: placement.end, kind: "all-day", start: placement.start };
  }
  return event;
}

/** The events after a move, resize or delete that passed `demoEventPolicy`. */
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
