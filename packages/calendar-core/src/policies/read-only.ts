import type { EventId, ResourceId } from "../ids";
import type { CalendarPolicy } from "./types";

/** Rejects changes to events the adapter marks read-only. */
export function readOnlyPolicy<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(): CalendarPolicy<TEvent, TEventId, TResourceId> {
  return (change, { events }) =>
    change.eventId !== null && events.get(change.eventId)?.isReadOnly === true
      ? { reason: "read-only", type: "reject" }
      : { type: "accept" };
}
