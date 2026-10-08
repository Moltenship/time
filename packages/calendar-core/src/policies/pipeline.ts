import type { EventId, ResourceId } from "../ids";
import { isPromiseLike } from "../internal/promise-like";
import type { CalendarEventChange } from "../transactions/types";
import type {
  CalendarPolicy,
  CalendarPolicyContext,
  CalendarPolicyDecision,
  CalendarPolicyResult,
} from "./types";

function applyDecision<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: CalendarEventChange<TEvent, TEventId, TResourceId>,
  decision: CalendarPolicyDecision<TResourceId>,
):
  | CalendarEventChange<TEvent, TEventId, TResourceId>
  | CalendarPolicyResult<TEvent, TEventId, TResourceId> {
  if (decision.type === "accept") return change;
  if (decision.type === "reject") {
    return { change, reason: decision.reason, status: "rejected" };
  }
  if (change.proposed === null) throw new TypeError("delete-changes-cannot-be-adjusted");
  return { ...change, proposed: decision.proposed };
}

/**
 * Runs policies in order. The result is synchronous unless a policy returns a promise, so
 * interaction previews can validate synchronous pipelines on every frame.
 */
export function runEventPolicies<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  change: CalendarEventChange<TEvent, TEventId, TResourceId>,
  policies: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[],
  context: CalendarPolicyContext<TEvent, TEventId, TResourceId>,
):
  | CalendarPolicyResult<TEvent, TEventId, TResourceId>
  | Promise<CalendarPolicyResult<TEvent, TEventId, TResourceId>> {
  function runFrom(
    current: CalendarEventChange<TEvent, TEventId, TResourceId>,
    index: number,
  ):
    | CalendarPolicyResult<TEvent, TEventId, TResourceId>
    | Promise<CalendarPolicyResult<TEvent, TEventId, TResourceId>> {
    for (let position = index; position < policies.length; position += 1) {
      const decision = policies[position](current, context);
      if (isPromiseLike<CalendarPolicyDecision<TResourceId>>(decision)) {
        return Promise.resolve(decision).then((resolved) => {
          const next = applyDecision(current, resolved);
          return "status" in next ? next : runFrom(next, position + 1);
        });
      }

      const next = applyDecision(current, decision);
      if ("status" in next) return next;
      current = next;
    }
    return { change: current, status: "accepted" };
  }

  return runFrom(change, 0);
}
