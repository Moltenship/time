import type { AvailabilitySnapshot } from "../availability/types";
import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot } from "../snapshots/types";
import type { CalendarEventChange, CalendarEventPlacement } from "../transactions/types";

export interface CalendarPolicyContext<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The root's working hours, for `availabilityPolicy`. */
  readonly availability?: AvailabilitySnapshot;
  /** Current events with pending changes applied, as the user sees them. */
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly timeZone: string;
}

export type CalendarPolicyDecision<TResourceId extends ResourceId> =
  | { readonly type: "accept" }
  | { readonly proposed: CalendarEventPlacement<TResourceId>; readonly type: "adjust" }
  | { readonly reason: string; readonly type: "reject" }
  /** Accepts the change, flagged with `reason` in its `warnings`. */
  | { readonly reason: string; readonly type: "warn" };

/**
 * Accepts, adjusts, rejects, or flags a change. Policies run in order and each one sees the change
 * as adjusted by the policies before it.
 */
export type CalendarPolicy<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = (
  change: CalendarEventChange<TEvent, TEventId, TResourceId>,
  context: CalendarPolicyContext<TEvent, TEventId, TResourceId>,
) => CalendarPolicyDecision<TResourceId> | Promise<CalendarPolicyDecision<TResourceId>>;

export type CalendarPolicyResult<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | {
      readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
      readonly status: "accepted";
    }
  | {
      readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
      readonly reason: string;
      readonly status: "rejected";
    };
