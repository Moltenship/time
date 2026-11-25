// The events and the save of the live examples on the shared pages: Interactions, Availability and
// Accessibility run the Month page's calendar over them.

// #region events
import type { CalendarEventChange } from "@moltenship/calendar-solid";

import type { Event } from "./month-page";

export const seed: readonly Event[] = [
  {
    data: { color: "blue" },
    end: Temporal.Instant.from("2026-10-08T09:30:00Z"),
    id: "standup",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-08T09:00:00Z"),
    title: "Standup",
  },
  {
    data: { color: "purple" },
    end: Temporal.Instant.from("2026-10-13T15:00:00Z"),
    id: "review",
    kind: "timed",
    start: Temporal.Instant.from("2026-10-13T14:00:00Z"),
    title: "Design review",
  },
  {
    data: { color: "teal" },
    end: Temporal.PlainDate.from("2026-10-22"),
    id: "conference",
    kind: "all-day",
    start: Temporal.PlainDate.from("2026-10-20"),
    title: "Conference",
  },
];

/** The events after a change: what `onEventChange` saves. */
export function applyChange(
  events: readonly Event[],
  change: CalendarEventChange<Event, string, string>,
): readonly Event[] {
  if (change.cause === "delete") return events.filter((event) => event.id !== change.eventId);
  if (change.cause === "create") {
    const event: Event = {
      data: { color: "blue" },
      id: crypto.randomUUID(),
      title: "New event",
      ...change.proposed,
    };
    return [...events, event];
  }
  return events.map((event) =>
    event.id === change.eventId ? { ...event, ...change.proposed } : event,
  );
}
// #endregion events
