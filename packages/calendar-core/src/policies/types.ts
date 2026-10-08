import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot } from "../snapshots/types";
import type { CalendarEventChange, CalendarEventPlacement } from "../transactions/types";

export interface CalendarPolicyContext<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** Current events with pending changes applied, as the user sees them. */
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly timeZone: string;
}

export type CalendarPolicyDecision<TResourceId extends ResourceId> =
  | { readonly type: "accept" }
  | { readonly proposed: CalendarEventPlacement<TResourceId>; readonly type: "adjust" }
  | { readonly reason: string; readonly type: "reject" };

/**
 * Accepts, adjusts, or rejects a change. Policies run in order and each one sees the change as
 * adjusted by the policies before it.
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
