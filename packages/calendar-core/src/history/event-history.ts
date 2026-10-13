import type { CalendarEventInterval } from "../events";
import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot } from "../snapshots/types";
import { eventPlacement } from "../transactions/placement";
import type {
  CalendarEventChange,
  CalendarEventCreateChange,
  CalendarEventPlacement,
  CalendarEventProposal,
  CalendarProposalDetail,
} from "../transactions/types";
import type {
  EventHistory,
  EventHistoryActivity,
  EventHistoryContext,
  EventHistoryDirection,
  EventHistoryOptions,
  EventHistoryOutcome,
  EventHistorySnapshot,
  EventHistoryStep,
} from "./types";

const DEFAULT_LIMIT = 100;

interface Entry<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>;
  /** A recorded create, until an undo finds the event it became. */
  readonly created?: CalendarEventCreateChange<TResourceId, TEvent>;
  /** The events a turn couldn't find the step's event in; newer events without it mean it's gone. */
  readonly unnamedIn?: EventSnapshot<TEvent, TEventId, TResourceId>;
}

function sameInterval(left: CalendarEventInterval, right: CalendarEventInterval): boolean {
  switch (left.kind) {
    case "timed":
      return right.kind === "timed" && left.start.equals(right.start) && left.end.equals(right.end);
    case "all-day":
      return (
        right.kind === "all-day" && left.start.equals(right.start) && left.end.equals(right.end)
      );
    case "floating":
      return (
        right.kind === "floating" && left.start.equals(right.start) && left.end.equals(right.end)
      );
  }
}

/**
 * Whether an event is where a step expects it, `null` being "no event": the same interval and
 * resources. A source time zone doesn't count, since the application may keep the event's own
 * when a change leaves it out.
 */
function samePlacement(
  left: CalendarEventPlacement | null,
  right: CalendarEventPlacement | null,
): boolean {
  if (left === null || right === null) return left === right;
  return (
    sameInterval(left, right) &&
    left.resourceIds.length === right.resourceIds.length &&
    left.resourceIds.every((resourceId) => right.resourceIds.includes(resourceId))
  );
}

/**
 * Records committed event changes as steps, and undoes and redoes them by proposing their
 * inverses through a calendar's pipeline, so policies run and `onEventChange` saves them. A step
 * whose event changed elsewhere since is dropped rather than applied over that change.
 *
 * ```ts
 * const history = createEventHistory<Meeting, string, string>({ limit: 50 });
 * <Calendar.Root onEventChangeResult={history.record} … />
 * ```
 */
export function createEventHistory<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  options: EventHistoryOptions<TEvent, TEventId, TResourceId> = {},
): EventHistory<TEvent, TEventId, TResourceId> {
  type Activity = EventHistoryActivity<TEvent, TEventId, TResourceId>;
  type Change = CalendarEventChange<TEvent, TEventId, TResourceId>;
  type HistoryEntry = Entry<TEvent, TEventId, TResourceId>;
  type Outcome = EventHistoryOutcome<TEvent, TEventId, TResourceId>;
  type Placement = CalendarEventPlacement<TResourceId>;
  type Snapshot = EventHistorySnapshot<TEvent, TEventId, TResourceId>;
  type Step = EventHistoryStep<TEvent, TEventId, TResourceId>;
  type Events = EventSnapshot<TEvent, TEventId, TResourceId>;

  let past: readonly HistoryEntry[] = [];
  let future: readonly HistoryEntry[] = [];
  let pending: { readonly direction: EventHistoryDirection; readonly entry: HistoryEntry } | null =
    null;
  let latest: Activity | null = null;
  let snapshot: Snapshot = Object.freeze({ future: [], latest, past: [], pending: null });
  /** Counts recorded steps: an undo that ends after one doesn't fill redo, which it cleared. */
  let records = 0;
  /** Counts clears: an undo or redo that ends after one puts its step nowhere. */
  let clears = 0;
  let sequence = 0;
  let queue: Promise<unknown> = Promise.resolve();
  /**
   * Placements the history's own inverses saved, by event, with the events the user saw then.
   * Until those events change, they may not show the save yet, so the next step checks against it.
   */
  const applied = new Map<
    TEventId,
    { readonly events: Events; readonly placement: Placement | null }
  >();
  /**
   * The creates that restored events, by the ID each event had. The application may have given
   * the event a new one, which `createdEventId` tells when a step for it is next taken.
   */
  const restores = new Map<TEventId, CalendarEventCreateChange<TResourceId, TEvent>>();
  const listeners = new Set<() => void>();

  function publish(activity?: Activity | null): void {
    if (activity !== undefined) latest = activity;
    snapshot = Object.freeze({
      future: Object.freeze(future.map(({ step }) => step)),
      latest,
      past: Object.freeze(past.map(({ step }) => step)),
      pending:
        pending === null
          ? null
          : Object.freeze({ direction: pending.direction, step: pending.entry.step }),
    });
    for (const listener of listeners) listener();
  }

  function newStep(change: Change, detail: CalendarProposalDetail): HistoryEntry {
    sequence += 1;
    const base = { changes: Object.freeze([change]), id: `step-${sequence}`, input: detail.input };
    if (change.cause === "create") {
      const step = { ...base, after: change.proposed, before: null, cause: "create" as const };
      return {
        created: change,
        step: Object.freeze({ ...step, event: change.event, eventId: null }),
      };
    }
    return {
      step: Object.freeze({
        ...base,
        after: change.proposed,
        before: change.original,
        cause: change.cause,
        event: change.event,
        eventId: change.eventId,
      }),
    };
  }

  /** The top step with `change` folded in: its first `before`, the change's `after`. */
  function merged(step: Step, change: Exclude<Change, { readonly cause: "create" }>): Step {
    const cause =
      change.cause === "delete" ? "delete" : change.cause === step.cause ? step.cause : "update";
    return Object.freeze({
      ...step,
      after: change.proposed,
      cause,
      changes: Object.freeze([...step.changes, change]),
      event: change.event,
    });
  }

  function record(
    result: Parameters<EventHistory<TEvent, TEventId, TResourceId>["record"]>[0],
    detail: CalendarProposalDetail,
  ): void {
    if (result.status !== "committed" || detail.history !== undefined) return;
    const { change } = result;
    const { coalesce, createdEventId, filter, inputs, limit = DEFAULT_LIMIT } = options;
    if (limit < 1 || (inputs !== undefined && !inputs.includes(detail.input))) return;
    // The calendar can't undo a create without knowing which event it became.
    if (change.cause === "create" && createdEventId === undefined) return;
    if (filter !== undefined && !filter(change, detail)) return;
    // Asked before anything changes, so a coalesce that throws leaves the history as it was.
    const top = past.at(-1);
    const merge =
      top !== undefined &&
      top !== pending?.entry &&
      change.cause !== "create" &&
      top.step.before !== null &&
      top.step.after !== null &&
      top.step.eventId === change.eventId &&
      coalesce?.(change, top.step, detail) === true;

    records += 1;
    future = [];
    // The events have a newer change than any inverse saved for this event.
    if (change.eventId !== null) applied.delete(change.eventId);
    let step: Step;
    if (merge) {
      step = merged(top.step, change as Exclude<Change, { readonly cause: "create" }>);
      past = [...past.slice(0, -1), { step }];
    } else {
      const entry = newStep(change, detail);
      step = entry.step;
      past = [...past, entry].slice(-limit);
    }
    publish({ step, type: "record" });
  }

  /**
   * The step's event's ID now, or `null` while the events don't show it under an ID the history
   * can name. A recorded create's comes from `createdEventId`, and so may a restored event's new
   * one, which every step that named the old ID then follows.
   */
  function resolve(entry: HistoryEntry, events: Events): TEventId | null {
    const { createdEventId } = options;
    const { step } = entry;
    if (step.eventId === null) {
      const found = entry.created && createdEventId?.(entry.created, events);
      if (found === undefined) return null;
      rename(step.id, null, found);
      return found;
    }
    const restore = restores.get(step.eventId);
    if (restore === undefined) return step.eventId;
    const found = createdEventId?.(restore, events);
    // Not named yet: the restore may still be under its old ID, perhaps in a save not shown yet.
    if (found === undefined)
      return placementOf(step.eventId, events) === null ? null : step.eventId;
    restores.delete(step.eventId);
    if (found !== step.eventId) rename(step.id, step.eventId, found);
    return found;
  }

  function placementOf(eventId: TEventId | null, events: Events): Placement | null {
    if (eventId === null) return null;
    const saved = applied.get(eventId);
    if (saved !== undefined) {
      if (saved.events === events) return saved.placement;
      applied.delete(eventId);
    }
    const event = events.get(eventId);
    return event === undefined ? null : eventPlacement(event);
  }

  /**
   * Points the step `id`, and every other step that names `from`, at `to`: the event a create
   * became, or a restored event's new ID.
   */
  function rename(id: string, from: TEventId | null, to: TEventId): void {
    const follow = (entry: HistoryEntry): HistoryEntry =>
      entry.step.id === id || (from !== null && entry.step.eventId === from)
        ? { ...entry, step: Object.freeze({ ...entry.step, eventId: to }) }
        : entry;
    past = past.map(follow);
    future = future.map(follow);
    const saved = from === null ? undefined : applied.get(from);
    if (saved !== undefined) {
      applied.delete(from!);
      applied.set(to, saved);
    }
  }

  function replace(entry: HistoryEntry, next: HistoryEntry): void {
    past = past.map((each) => (each === entry ? next : each));
    future = future.map((each) => (each === entry ? next : each));
  }

  /** The entry for step `id` in either stack, which a rename may have replaced. */
  function find(id: string): HistoryEntry | undefined {
    return (
      past.find((entry) => entry.step.id === id) ?? future.find((entry) => entry.step.id === id)
    );
  }

  function settle(direction: EventHistoryDirection, outcome: Outcome): Outcome {
    publish({ outcome, type: direction });
    return outcome;
  }

  async function take(
    direction: EventHistoryDirection,
    context: EventHistoryContext<TEvent, TEventId, TResourceId>,
  ): Promise<Outcome> {
    // A change still saving is recorded first, so undo takes it rather than the step before it.
    const settling = context.whenSettled?.();
    if (settling !== undefined) await settling;
    let entry = (direction === "undo" ? past : future).at(-1);
    if (entry === undefined) return settle(direction, { direction, status: "empty" });

    const events = context.getEvents();
    // Saves the events didn't show yet stand in for them only until the events change.
    for (const [eventId, saved] of applied) if (saved.events !== events) applied.delete(eventId);
    // Where the event must be now, and where the inverse takes it; `null` is "no event".
    const needsEvent = (direction === "undo" ? entry.step.after : entry.step.before) !== null;
    const eventId = needsEvent ? resolve(entry, events) : entry.step.eventId;
    // A rename replaces the entry.
    entry = find(entry.step.id)!;
    const { step } = entry;
    const from = direction === "undo" ? step.after : step.before;
    const to = direction === "undo" ? step.before : step.after;
    if (needsEvent && eventId === null) {
      // The events don't show it yet, as just after a create: the step waits for newer events. If
      // newer events don't show it either, it's gone, deleted where the history didn't see, and
      // the check below drops the step.
      if (entry.unnamedIn === undefined || entry.unnamedIn === events) {
        replace(entry, { ...entry, unnamedIn: events });
        const result = { reason: "unknown-event", status: "rejected" } as const;
        return settle(direction, { direction, result, status: "rejected", step });
      }
    } else if (entry.unnamedIn !== undefined) {
      const { unnamedIn: _found, ...named } = entry;
      replace(entry, named);
      entry = named;
    }
    if (!samePlacement(placementOf(eventId, events), from)) {
      past = past.filter((each) => each !== entry);
      future = future.filter((each) => each !== entry);
      return settle(direction, { direction, status: "stale", step });
    }

    let proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>;
    let record = step.event;
    if (from === null) {
      // Restores the event with the record it had, at the step's placement.
      proposal =
        record === null
          ? { cause: "create", proposed: to! }
          : { cause: "create", event: record, proposed: to! };
    } else if (to === null) {
      record = events.get(eventId!)?.event ?? record;
      proposal = { cause: "delete", eventId: eventId! };
    } else {
      const cause = step.cause === "create" || step.cause === "delete" ? "update" : step.cause;
      proposal = { cause, eventId: eventId!, proposed: to };
    }

    const recordsAtStart = records;
    const clearsAtStart = clears;
    pending = { direction, entry };
    publish();
    let result;
    try {
      const detail = Object.freeze({ history: direction, input: context.input ?? "api" });
      result = await context.propose(proposal, detail);
    } catch (error) {
      pending = null;
      publish();
      throw error;
    }
    pending = null;
    // Looked up again: a clear or the limit may have dropped it, and so may a step recorded
    // meanwhile, which empties redo.
    const current = find(step.id);
    if (result.status === "rejected") {
      return settle(direction, {
        direction,
        result,
        status: "rejected",
        step: current?.step ?? step,
      });
    }

    const { change } = result;
    const saved = change.proposed;
    const next: HistoryEntry = {
      step: Object.freeze({
        ...(current?.step ?? step),
        ...(direction === "undo" ? { before: saved } : { after: saved }),
        event: record,
      }),
    };
    // A clear forgets the step, and what its inverse saved.
    if (clears === clearsAtStart) {
      const { eventId: savedId } = next.step;
      if (savedId !== null) {
        if (change.cause === "create" && options.createdEventId !== undefined) {
          restores.set(savedId, change);
        }
        applied.set(savedId, { events: context.getEvents(), placement: saved });
      }
      past = past.filter((each) => each !== current);
      future = future.filter((each) => each !== current);
      if (direction === "redo") {
        // Redone, the change is on screen again, so undo can take it, whatever was recorded since.
        past = [...past, next].slice(-Math.max(options.limit ?? DEFAULT_LIMIT, 1));
      } else if (records === recordsAtStart && current !== undefined) {
        future = [...future, next];
      }
    }
    return settle(direction, { direction, result, status: "committed", step: next.step });
  }

  function enqueue(
    direction: EventHistoryDirection,
    context: EventHistoryContext<TEvent, TEventId, TResourceId>,
  ): Promise<Outcome> {
    const turn = queue.then(() => take(direction, context));
    queue = turn.catch(() => undefined);
    return turn;
  }

  return Object.freeze({
    clear() {
      past = [];
      future = [];
      clears += 1;
      applied.clear();
      restores.clear();
      publish(null);
    },
    getSnapshot: () => snapshot,
    record,
    redo: (context: EventHistoryContext<TEvent, TEventId, TResourceId>) => enqueue("redo", context),
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    undo: (context: EventHistoryContext<TEvent, TEventId, TResourceId>) => enqueue("undo", context),
  });
}
