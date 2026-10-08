import type { EventId } from "@moltenship/calendar-core";

/**
 * Attributes that identify an event element, for spreading onto it. `data-event-id` holds the ID
 * as text; numeric IDs add `data-event-id-type="number"`, so `1` and `"1"` stay distinct.
 */
export function eventIdAttributes(id: EventId): {
  readonly "data-event-id": string;
  readonly "data-event-id-type"?: "number";
} {
  return typeof id === "number"
    ? { "data-event-id": String(id), "data-event-id-type": "number" }
    : { "data-event-id": id };
}

/** The event ID an element carries through `eventIdAttributes`, or `null` without one. */
export function eventIdOf(element: Element): EventId | null {
  const id = element.getAttribute("data-event-id");
  if (id === null) return null;
  return element.getAttribute("data-event-id-type") === "number" ? Number(id) : id;
}
