import type {
  CalendarEventChange,
  CalendarEventPlacement,
  CalendarPolicyDecision,
} from "@moltenship/calendar";

import type { DemoEvent } from "./calendar";

export type DemoEventChange = CalendarEventChange<DemoEvent, string, never>;

/** A calendar policy: demo events are timed or all-day, and new ones are named in the dialog. */
export function demoEventPolicy(change: DemoEventChange): CalendarPolicyDecision<never> {
  if (change.cause === "create") {
    return { reason: "Create events from the event dialog.", type: "reject" };
  }
  if (change.proposed?.kind === "floating") {
    return { reason: "Demo events are timed or all-day.", type: "reject" };
  }
  return { type: "accept" };
}

function withPlacement(event: DemoEvent, placement: CalendarEventPlacement<never>): DemoEvent {
  const base = {
    calendarId: event.calendarId,
    id: event.id,
    title: event.title,
    ...(event.description === undefined ? {} : { description: event.description }),
  };
  if (placement.kind === "timed") {
    return { ...base, end: placement.end, kind: "timed", start: placement.start };
  }
  if (placement.kind === "all-day") {
    return { ...base, end: placement.end, kind: "all-day", start: placement.start };
  }
  return event;
}

/** The events after a change that passed `demoEventPolicy`. */
export function applyEventChange(
  events: readonly DemoEvent[],
  change: DemoEventChange,
): readonly DemoEvent[] {
  if (change.cause === "delete") return events.filter(({ id }) => id !== change.eventId);
  if (change.cause === "create") return events;
  return events.map((event) =>
    event.id === change.eventId ? withPlacement(event, change.proposed) : event,
  );
}
