import type {
  CalendarEventPlacement,
  CalendarTransactionResult,
  EventId,
  ResourceId,
} from "@moltenship/calendar-core";

/** How a proposal ended, as an announcement tells it. */
export type ProposalOutcome =
  | {
      readonly phase: "commit";
      readonly proposed: CalendarEventPlacement;
      readonly warnings?: readonly string[];
    }
  | { readonly error?: unknown; readonly phase: "reject"; readonly reason: string };

/**
 * Announces what became of a proposal from what `onPropose` returned: the transaction's result, or
 * from a handler that returns none, a commit of what was proposed. Resolves with the result, or
 * `null` without one.
 */
export function settleProposal<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  returned: void | PromiseLike<CalendarTransactionResult<TEvent, TEventId, TResourceId>>,
  proposed: CalendarEventPlacement,
  announce: (outcome: ProposalOutcome) => void,
): Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId> | null> {
  if (returned === undefined) {
    announce({ phase: "commit", proposed });
    return Promise.resolve(null);
  }
  return Promise.resolve(returned).then((result) => {
    announce(
      result.status === "committed"
        ? { phase: "commit", proposed: result.change.proposed!, warnings: result.change.warnings }
        : {
            phase: "reject",
            reason: result.reason,
            ...(result.error === undefined ? {} : { error: result.error }),
          },
    );
    return result;
  });
}
