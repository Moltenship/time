import type { EventId, ResourceId } from "../ids";
import { isPromiseLike } from "../internal/promise-like";
import { ReadonlyMapView } from "../internal/readonly-map";
import { runEventPolicies } from "../policies/pipeline";
import type { CalendarPolicyResult } from "../policies/types";
import type { EventSnapshot, NormalizedCalendarEvent } from "../snapshots/types";
import { applyEventOverlay } from "./overlay";
import { isNonEmptyInterval, placementsEqual } from "./placement";
import type {
  CalendarEventChange,
  CalendarEventDeleteChange,
  CalendarEventPlacement,
  CalendarEventProposal,
  CalendarEventUpdateChange,
  CalendarPendingPlacements,
  CalendarTransactionContext,
  CalendarTransactionResult,
} from "./types";

export interface EventTransactions<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** Pending placements for `applyEventOverlay`. The map identity changes only on updates. */
  getPending(): CalendarPendingPlacements<TEventId, TResourceId>;
  /**
   * Validates a proposal, shows it optimistically, and hands it to `onEventChange`. The promise
   * settles with the outcome and never rejects.
   */
  propose(
    proposal: CalendarEventProposal<TEventId, TResourceId>,
    context: CalendarTransactionContext<TEvent, TEventId, TResourceId>,
  ): Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  /** Reports new application events, which confirm or supersede resolved changes. */
  reconcile(snapshot: EventSnapshot<TEvent, TEventId, TResourceId>): void;
  subscribe(listener: () => void): () => void;
}

interface PendingEntry<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly change:
    | CalendarEventUpdateChange<TEvent, TEventId, TResourceId>
    | CalendarEventDeleteChange<TEvent, TEventId, TResourceId>;
  /** Revision of the application's event when the change was proposed. */
  readonly revision: string | number | undefined;
  /** Set when the handler resolved before the application's events reflected the change. */
  readonly settledAgainst?: EventSnapshot<TEvent, TEventId, TResourceId>;
  /** Shown while asynchronous policies decide; the handler has not seen it yet. */
  readonly validating?: true;
}

const noPending = new ReadonlyMapView(new Map<never, never>());

function placementOf<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>,
): CalendarEventPlacement<TResourceId> {
  const { resourceIds } = event;
  return event.kind === "timed"
    ? {
        end: event.end,
        kind: event.kind,
        resourceIds,
        sourceTimeZone: event.sourceTimeZone,
        start: event.start,
      }
    : event.kind === "all-day"
      ? { end: event.end, kind: event.kind, resourceIds, start: event.start }
      : { end: event.end, kind: event.kind, resourceIds, start: event.start };
}

function createChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(
  proposal: CalendarEventProposal<TEventId, TResourceId>,
  id: string,
  events: EventSnapshot<TEvent, TEventId, TResourceId>,
): CalendarEventChange<TEvent, TEventId, TResourceId> | undefined {
  if (proposal.cause === "create") {
    const proposed = { ...proposal.proposed, resourceIds: proposal.proposed.resourceIds ?? [] };
    return { cause: "create", event: null, eventId: null, id, original: null, proposed };
  }

  const current = events.get(proposal.eventId);
  if (current === undefined) return undefined;
  const base = { event: current.event, eventId: current.id, id, original: placementOf(current) };
  if (proposal.cause === "delete") return { ...base, cause: "delete", proposed: null };
  return {
    ...base,
    cause: proposal.cause,
    proposed: {
      ...proposal.proposed,
      resourceIds: proposal.proposed.resourceIds ?? base.original.resourceIds,
    },
  };
}

/**
 * Tracks proposed event changes from validation through persistence. Changes stay visible while
 * the handler runs; a rejection rolls them back, and the latest proposal for an event wins.
 */
export function createEventTransactions<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(): EventTransactions<TEvent, TEventId, TResourceId> {
  type Change = CalendarEventChange<TEvent, TEventId, TResourceId>;
  type Context = CalendarTransactionContext<TEvent, TEventId, TResourceId>;
  type Entry = PendingEntry<TEvent, TEventId, TResourceId>;
  type Result = CalendarTransactionResult<TEvent, TEventId, TResourceId>;
  type Snapshot = EventSnapshot<TEvent, TEventId, TResourceId>;

  const entries = new Map<TEventId, Entry>();
  /** The newest proposal per event; older proposals still being validated are superseded. */
  const latest = new Map<TEventId, string>();
  const listeners = new Set<() => void>();
  let pending: CalendarPendingPlacements<TEventId, TResourceId> = noPending;
  let base: Snapshot | undefined;
  let sequence = 0;

  function publish(): void {
    pending =
      entries.size === 0
        ? noPending
        : new ReadonlyMapView(
            new Map(Array.from(entries, ([eventId, entry]) => [eventId, entry.change.proposed])),
          );
    for (const listener of listeners) listener();
  }

  function show(change: Entry["change"], entry: Omit<Entry, "change">): void {
    entries.set(change.eventId, { ...entry, change });
    publish();
  }

  /** Removes a change unless a newer proposal for the same event has replaced it. */
  function hide(change: Change): void {
    if (change.eventId === null || entries.get(change.eventId)?.change.id !== change.id) return;
    entries.delete(change.eventId);
    publish();
  }

  function reflects(entry: Entry, snapshot: Snapshot): boolean {
    const current = snapshot.get(entry.change.eventId);
    if (current === undefined) return true;
    if (entry.change.proposed === null) return false;
    return (
      (entry.revision !== undefined && current.revision !== entry.revision) ||
      placementsEqual(current, entry.change.proposed)
    );
  }

  function settle(change: Change): void {
    if (change.eventId === null) return;
    const entry = entries.get(change.eventId);
    if (entry?.change.id !== change.id) return;
    if (base === undefined || reflects(entry, base)) {
      entries.delete(change.eventId);
      publish();
    } else {
      entries.set(change.eventId, { ...entry, settledAgainst: base });
    }
  }

  /**
   * Marks the end of validation; returns false when a newer proposal superseded this one. Older
   * proposals still being validated can no longer win, so their previews go.
   */
  function claim(change: Change): boolean {
    if (change.eventId === null) return true;
    if (latest.get(change.eventId) !== change.id) {
      hide(change);
      return false;
    }
    latest.delete(change.eventId);
    const entry = entries.get(change.eventId);
    if (entry?.validating === true && entry.change.id !== change.id) {
      entries.delete(change.eventId);
      publish();
    }
    return true;
  }

  function reconcile(snapshot: Snapshot): void {
    if (snapshot === base) return;
    base = snapshot;
    let changed = false;
    for (const [eventId, entry] of entries) {
      if (entry.settledAgainst !== undefined) {
        entries.delete(eventId);
        changed = true;
      }
    }
    if (changed) publish();
  }

  function commit(
    result: CalendarPolicyResult<TEvent, TEventId, TResourceId>,
    revision: Entry["revision"],
    context: Context,
  ): Result | Promise<Result> {
    const { change } = result;
    if (!claim(change)) return { change, reason: "superseded", status: "rejected" };
    if (result.status === "rejected") {
      hide(change);
      return { change, reason: result.reason, status: "rejected" };
    }
    if (change.proposed !== null && !isNonEmptyInterval(change.proposed)) {
      hide(change);
      return { change, reason: "invalid-placement", status: "rejected" };
    }

    let returned: void | Promise<void>;
    try {
      returned = context.onEventChange(change);
    } catch (error) {
      hide(change);
      return { change, error, reason: "handler-error", status: "rejected" };
    }

    if (change.cause === "create") {
      return isPromiseLike(returned)
        ? Promise.resolve(returned).then(
            (): Result => ({ change, status: "committed" }),
            (error: unknown): Result => ({
              change,
              error,
              reason: "handler-error",
              status: "rejected",
            }),
          )
        : { change, status: "committed" };
    }
    if (!isPromiseLike(returned)) {
      // A synchronous handler has already updated the application's events, which supersedes
      // any older change for this event.
      if (entries.delete(change.eventId)) publish();
      return { change, status: "committed" };
    }

    show(change, { revision });
    return Promise.resolve(returned).then(
      (): Result => {
        settle(change);
        return { change, status: "committed" };
      },
      (error: unknown): Result => {
        hide(change);
        return { change, error, reason: "handler-error", status: "rejected" };
      },
    );
  }

  function propose(
    proposal: CalendarEventProposal<TEventId, TResourceId>,
    context: Context,
  ): Promise<Result> {
    reconcile(context.snapshot);
    sequence += 1;
    const events = applyEventOverlay(context.snapshot, pending);
    const change = createChange(proposal, `change-${sequence}`, events);
    if (change === undefined) {
      return Promise.resolve({ reason: "unknown-event", status: "rejected" });
    }
    if (change.proposed !== null && !isNonEmptyInterval(change.proposed)) {
      return Promise.resolve({ change, reason: "invalid-placement", status: "rejected" });
    }

    const revision =
      change.eventId === null ? undefined : context.snapshot.get(change.eventId)?.revision;
    if (change.eventId !== null) latest.set(change.eventId, change.id);
    const policyError = (error: unknown): Result => {
      claim(change);
      hide(change);
      return { change, error, reason: "policy-error", status: "rejected" };
    };

    let outcome;
    try {
      outcome = runEventPolicies(change, context.policies ?? [], {
        events,
        timeZone: context.timeZone,
      });
      // Commit only throws before the handler runs, on a malformed policy adjustment.
      if (!isPromiseLike(outcome)) return Promise.resolve(commit(outcome, revision, context));
    } catch (error) {
      return Promise.resolve(policyError(error));
    }

    // Keep the proposal visible while asynchronous policies decide.
    if (change.cause !== "create") show(change, { revision, validating: true });
    return outcome.then((result) => commit(result, revision, context)).catch(policyError);
  }

  return Object.freeze({
    getPending: () => pending,
    propose,
    reconcile,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  });
}
