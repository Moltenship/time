import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot } from "../snapshots/types";
import type {
  CalendarChangeCause,
  CalendarEventChange,
  CalendarEventCreateChange,
  CalendarEventPlacement,
  CalendarEventProposal,
  CalendarInputMethod,
  CalendarProposalDetail,
  CalendarTransactionResult,
} from "../transactions/types";

/** Which way a history step is taken: back with `undo`, forward again with `redo`. */
export type EventHistoryDirection = "undo" | "redo";

/**
 * One undoable step: an event's placement before and after it, `null` where the event doesn't
 * exist. A step changes one event; coalesced changes extend it.
 */
export interface EventHistoryStep<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The placement the step left, as saved; `null` after a delete. */
  readonly after: CalendarEventPlacement<TResourceId> | null;
  /** The placement before the step; `null` before a create. */
  readonly before: CalendarEventPlacement<TResourceId> | null;
  /**
   * What the step did: a move, a resize, an update, a create or a delete. Coalesced changes of
   * different kinds make an `update`, or a `delete` when the last one deletes.
   */
  readonly cause: CalendarChangeCause;
  /** The committed changes the step was recorded from, oldest first. */
  readonly changes: readonly CalendarEventChange<TEvent, TEventId, TResourceId>[];
  /**
   * The application's record: the latest change's, or the record an undone create had, so a
   * redo restores it. `null` for a create the history hasn't undone yet.
   */
  readonly event: TEvent | null;
  /**
   * The event's ID; `null` for a create until an undo finds the event it became through
   * `createdEventId`.
   */
  readonly eventId: TEventId | null;
  /** Names the step within its history, such as `step-3`. */
  readonly id: string;
  /** The input that made the step's first change. */
  readonly input: CalendarInputMethod;
}

/**
 * How an undo or redo ended: nothing to take (`empty`), a step dropped because its event changed
 * elsewhere (`stale`), or the inverse's transaction result.
 */
export type EventHistoryOutcome<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | { readonly direction: EventHistoryDirection; readonly status: "empty" }
  | {
      readonly direction: EventHistoryDirection;
      readonly status: "stale";
      readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>;
    }
  | {
      readonly direction: EventHistoryDirection;
      readonly result: Extract<
        CalendarTransactionResult<TEvent, TEventId, TResourceId>,
        { readonly status: "committed" }
      >;
      readonly status: "committed";
      /** The step as it is now, with the placement the inverse saved. */
      readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>;
    }
  | {
      readonly direction: EventHistoryDirection;
      readonly result: Extract<
        CalendarTransactionResult<TEvent, TEventId, TResourceId>,
        { readonly status: "rejected" }
      >;
      readonly status: "rejected";
      /** The step, still where it was, so the user can try again. */
      readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>;
    };

/** The latest thing a history did: recorded a step, or took one back or forward. */
export type EventHistoryActivity<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | { readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>; readonly type: "record" }
  | {
      readonly outcome: EventHistoryOutcome<TEvent, TEventId, TResourceId>;
      readonly type: EventHistoryDirection;
    };

export interface EventHistorySnapshot<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The steps `redo` takes forward again, oldest first; it takes the last. */
  readonly future: readonly EventHistoryStep<TEvent, TEventId, TResourceId>[];
  /** The latest activity, for a toast; `null` before any, and after `clear`. */
  readonly latest: EventHistoryActivity<TEvent, TEventId, TResourceId> | null;
  /** The steps `undo` takes back, oldest first; it takes the last. */
  readonly past: readonly EventHistoryStep<TEvent, TEventId, TResourceId>[];
  /** The step an undo or redo is proposing the inverse of, while it waits for the result. */
  readonly pending: {
    readonly direction: EventHistoryDirection;
    readonly step: EventHistoryStep<TEvent, TEventId, TResourceId>;
  } | null;
}

export interface EventHistoryOptions<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /**
   * Whether a committed change joins the step on top of the undo stack instead of starting one.
   * Asked only when both change the same existing event and that step isn't being undone. Nothing
   * coalesces by default.
   */
  readonly coalesce?: (
    change: CalendarEventChange<TEvent, TEventId, TResourceId>,
    previous: EventHistoryStep<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => boolean;
  /**
   * The event a committed create became, or `undefined` while the events don't show it, which
   * leaves the step for another try (`unknown-event`). Asked when the step is undone or redone,
   * for a create the history recorded or one it proposed to restore a deleted event. Without it,
   * creates aren't recorded, and a restored event is looked for under the ID it had.
   */
  readonly createdEventId?: (
    change: CalendarEventCreateChange<TResourceId, TEvent>,
    events: EventSnapshot<TEvent, TEventId, TResourceId>,
  ) => TEventId | undefined;
  /**
   * Records a committed change only when this returns `true`. Leave out what can't be undone as
   * one placement change, such as changes to occurrences of a recurring event.
   */
  readonly filter?: (
    change: CalendarEventChange<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => boolean;
  /** The inputs whose changes are recorded; all three by default. */
  readonly inputs?: readonly CalendarInputMethod[];
  /** The most steps the undo stack keeps; the oldest drops. 100 by default. */
  readonly limit?: number;
}

/** What `undo` and `redo` work against: usually a calendar root's. */
export interface EventHistoryContext<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /**
   * The events as the user sees them, pending changes included. Read when the step's turn comes,
   * to check that its event is still where the step left it. Return the same snapshot until the
   * events change: the history tells events that haven't caught up with its own saves, or with a
   * create, by their identity.
   */
  readonly getEvents: () => EventSnapshot<TEvent, TEventId, TResourceId>;
  /** The input the undo or redo came from, passed on in the proposal's detail; `"api"` by default. */
  readonly input?: CalendarInputMethod;
  /** Proposes the inverse through the calendar's pipeline, as `actions.proposeEventChange` does. */
  readonly propose: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail: CalendarProposalDetail,
  ) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
  /**
   * While changes in the calendar are still validating or saving, a promise for when they've all
   * ended and been recorded; `undefined` when none are. Each undo and redo waits for it, so a
   * change still saving is undone itself rather than the step before it dropped as stale.
   */
  readonly whenSettled?: () => Promise<void> | undefined;
}

/** Members are plain functions, so they can be passed on, as `record` to `onEventChangeResult`. */
export interface EventHistory<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** Empties both stacks. An undo or redo already running still finishes. */
  readonly clear: () => void;
  /** The stacks and the latest activity. The identity changes only on updates. */
  readonly getSnapshot: () => EventHistorySnapshot<TEvent, TEventId, TResourceId>;
  /**
   * Records a proposal's result: pass it as `Root`'s `onEventChangeResult`, or call it from yours.
   * Only committed changes record, and never the history's own inverses.
   */
  readonly record: (
    result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => void;
  /**
   * Takes the last undone step forward again. Calls queue, so each runs after the one before it
   * settles. Resolves with the outcome; rejects only when a function it calls throws:
   * the context's or `createdEventId`.
   */
  readonly redo: (
    context: EventHistoryContext<TEvent, TEventId, TResourceId>,
  ) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Takes the last step back by proposing its inverse. Calls queue, so each runs after the one
   * before it settles. Resolves with the outcome; rejects only when a function it calls throws:
   * the context's or `createdEventId`.
   */
  readonly undo: (
    context: EventHistoryContext<TEvent, TEventId, TResourceId>,
  ) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
}
