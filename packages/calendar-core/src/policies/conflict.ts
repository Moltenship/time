import { busyResources, isBusyEvent } from "../availability/busy";
import type { EventId, ResourceId } from "../ids";
import { sameTime } from "./availability";
import type { CalendarPolicy } from "./types";

/**
 * What double-booking a resource does: `"block"` rejects the change, `"warn"` lets it through,
 * flagged in its `warnings`, and `"allow"` lets it through as it is.
 */
export type ConflictMode = "allow" | "block" | "warn";

export interface ConflictPolicyOptions<TResourceId extends ResourceId = ResourceId> {
  /**
   * A resource's own mode, such as `"block"` for rooms and `"warn"` for people; `undefined` keeps
   * `mode`. It's called once for each resource a busy change alters, so keep it cheap, such as a
   * lookup.
   */
  readonly getResourceMode?: (resourceId: TResourceId) => ConflictMode | undefined;
  /**
   * The mode for every resource `getResourceMode` leaves out: `"block"` (the default) rejects a
   * change that double-books one, `"warn"` lets it through, flagged in its `warnings`, and
   * `"allow"` lets it through as it is. Rejected or flagged, the reason is `"resource-conflict"`.
   */
  readonly mode?: ConflictMode;
}

const reason = "resource-conflict";

/**
 * Checks changes against double-booking: a busy event may not overlap another busy event of a
 * resource it books; see `busyResources`. Events that only touch don't
 * overlap. An event that isn't busy, such as an all-day one by default, books nothing. Only what
 * a change alters is checked: its time, or the resources it adds when the time stays, so events
 * already double-booked can still be edited. Deletes always pass.
 *
 * Each resource follows its own mode from `getResourceMode`, or else `mode`. When a change
 * double-books several resources, the strictest of their modes decides: any `"block"` rejects it,
 * and otherwise any `"warn"` flags it. Resources in `"allow"` mode aren't checked at all.
 */
export function conflictPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({
  getResourceMode,
  mode = "block",
}: ConflictPolicyOptions<TResourceId> = {}): CalendarPolicy<TEvent, TEventId, TResourceId> {
  return ({ eventId, original, proposed }, { events, timeZone }) => {
    if (proposed === null) return { type: "accept" };
    const current = eventId === null ? undefined : events.get(eventId);
    // The event's own `isBusy`, at the placement it would have.
    if (!isBusyEvent({ isBusy: current?.isBusy, kind: proposed.kind })) {
      return { type: "accept" };
    }
    const changed =
      original !== null && sameTime(original, proposed)
        ? proposed.resourceIds.filter((resourceId) => !original.resourceIds.includes(resourceId))
        : proposed.resourceIds;
    const modes = new Map<TResourceId, ConflictMode>();
    const asked = new Set<TResourceId>();
    for (const resourceId of changed) {
      if (asked.has(resourceId)) continue;
      asked.add(resourceId);
      const own = getResourceMode?.(resourceId) ?? mode;
      if (own !== "allow") modes.set(resourceId, own);
    }
    if (modes.size === 0) return { type: "accept" };
    const busy = busyResources(events, proposed, {
      ...(eventId === null ? {} : { exclude: eventId }),
      resourceIds: [...modes.keys()],
      timeZone,
    });
    if (busy.size === 0) return { type: "accept" };
    // Anything but "warn" blocks, as an unknown mode always has.
    const warnOnly = [...busy.keys()].every((resourceId) => modes.get(resourceId) === "warn");
    return warnOnly ? { reason, type: "warn" } : { reason, type: "reject" };
  };
}
