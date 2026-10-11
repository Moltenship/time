import { busyResources, isBusyEvent } from "../availability/busy";
import type { EventId, ResourceId } from "../ids";
import { sameTime } from "./availability";
import type { CalendarPolicy } from "./types";

export interface ConflictPolicyOptions {
  /**
   * `"block"` (the default) rejects a change that double-books a resource; `"warn"` lets it
   * through, flagged in its `warnings`. Either way the reason is `"resource-conflict"`.
   */
  readonly mode?: "block" | "warn";
}

const reason = "resource-conflict";

/**
 * Checks changes against double-booking: a busy event may not overlap another busy event of a
 * resource it books; see `busyResources`. Events that only touch don't
 * overlap. An event that isn't busy, such as an all-day one by default, books nothing. Only what
 * a change alters is checked: its time, or the resources it adds when the time stays, so events
 * already double-booked can still be edited. Deletes always pass.
 */
export function conflictPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  mode = "block",
}: ConflictPolicyOptions = {}): CalendarPolicy<TEvent, TEventId, TResourceId> {
  return ({ eventId, original, proposed }, { events, timeZone }) => {
    if (proposed === null) return { type: "accept" };
    const current = eventId === null ? undefined : events.get(eventId);
    // The event's own `isBusy`, at the placement it would have.
    if (!isBusyEvent({ isBusy: current?.isBusy, kind: proposed.kind })) {
      return { type: "accept" };
    }
    const checked =
      original !== null && sameTime(original, proposed)
        ? proposed.resourceIds.filter((resourceId) => !original.resourceIds.includes(resourceId))
        : proposed.resourceIds;
    if (checked.length === 0) return { type: "accept" };
    const busy = busyResources(events, proposed, {
      ...(eventId === null ? {} : { exclude: eventId }),
      resourceIds: checked,
      timeZone,
    });
    if (busy.size === 0) return { type: "accept" };
    return mode === "warn" ? { reason, type: "warn" } : { reason, type: "reject" };
  };
}
