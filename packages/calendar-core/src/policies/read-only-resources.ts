import type { EventId, ResourceId } from "../ids";
import { intervalsEqual } from "../internal/interval-equality";
import type { CalendarPolicy } from "./types";

/**
 * Rejects changes to the schedule of a resource `isReadOnly` marks: creating, deleting, or moving
 * an event on it in time, and assigning an event to it or taking one away. An event that keeps a
 * read-only resource and its time may still move between its other resources.
 */
export function readOnlyResourcesPolicy<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(isReadOnly: (resourceId: TResourceId) => boolean): CalendarPolicy<TEvent, TEventId, TResourceId> {
  return ({ original, proposed }) => {
    const before = original?.resourceIds ?? [];
    const after = proposed?.resourceIds ?? [];
    const retimed = original === null || proposed === null || !intervalsEqual(original, proposed);
    const touched = [...before, ...after].some(
      (resourceId) =>
        isReadOnly(resourceId) &&
        (retimed || before.includes(resourceId) !== after.includes(resourceId)),
    );
    return touched ? { reason: "read-only-resource", type: "reject" } : { type: "accept" };
  };
}
