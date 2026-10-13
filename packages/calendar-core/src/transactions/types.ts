import type { AvailabilitySnapshot } from "../availability/types";
import type { CalendarEventInterval } from "../events";
import type { EventId, ResourceId } from "../ids";
import type { EventSnapshot } from "../snapshots/types";
import type { CalendarPolicy } from "../policies/types";

export type CalendarEventPlacement<TResourceId extends ResourceId = ResourceId> =
  CalendarEventInterval & {
    readonly resourceIds: readonly TResourceId[];
  };

/** A proposed interval. Omitted resource IDs keep the event's current resources. */
export type CalendarEventPlacementInput<TResourceId extends ResourceId = ResourceId> =
  CalendarEventInterval & {
    readonly resourceIds?: readonly TResourceId[];
  };

export type CalendarChangeCause =
  | "create"
  | "move"
  | "resize-start"
  | "resize-end"
  | "update"
  | "delete";

/**
 * A change being drafted, by pointer or keyboard, before it is proposed: the event it changes
 * (`null` when creating) and where it would land.
 */
export interface CalendarDraft<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventId: TEventId | null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
}

/**
 * A change to propose. A create may carry an application record, such as a deleted event the
 * history restores; the handler gets it as the change's `event`.
 */
export type CalendarEventProposal<
  TEventId extends EventId,
  TResourceId extends ResourceId,
  TEvent = never,
> =
  | {
      readonly cause: "create";
      /** The record the new event restores or copies; omitted for a new event. */
      readonly event?: TEvent;
      readonly proposed: CalendarEventPlacementInput<TResourceId>;
    }
  | {
      readonly cause: "move" | "resize-start" | "resize-end" | "update";
      readonly eventId: TEventId;
      readonly proposed: CalendarEventPlacementInput<TResourceId>;
    }
  | {
      readonly cause: "delete";
      readonly eventId: TEventId;
    };

export interface CalendarEventCreateChange<TResourceId extends ResourceId, TEvent = never> {
  readonly cause: "create";
  /**
   * The record the proposal carried, such as a deleted event the history restores; `null` for a
   * new event, as from a range made in a view. The new event has no ID yet either way.
   */
  readonly event: TEvent | null;
  readonly eventId: null;
  readonly id: string;
  readonly original: null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
  /** Reasons policies flagged the change with while letting it through; see `"warn"`. */
  readonly warnings?: readonly string[];
}

export interface CalendarEventUpdateChange<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly cause: "move" | "resize-start" | "resize-end" | "update";
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly id: string;
  /** The placement the user saw, including any change still pending for this event. */
  readonly original: CalendarEventPlacement<TResourceId>;
  readonly proposed: CalendarEventPlacement<TResourceId>;
  /** Reasons policies flagged the change with while letting it through; see `"warn"`. */
  readonly warnings?: readonly string[];
}

export interface CalendarEventDeleteChange<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly cause: "delete";
  readonly event: TEvent;
  readonly eventId: TEventId;
  readonly id: string;
  readonly original: CalendarEventPlacement<TResourceId>;
  readonly proposed: null;
  /** Reasons policies flagged the change with while letting it through; see `"warn"`. */
  readonly warnings?: readonly string[];
}

export type CalendarEventChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | CalendarEventCreateChange<TResourceId, TEvent>
  | CalendarEventUpdateChange<TEvent, TEventId, TResourceId>
  | CalendarEventDeleteChange<TEvent, TEventId, TResourceId>;

/**
 * Persists an accepted change. Returning a promise keeps the change visible as pending until it
 * settles; throwing or rejecting rolls it back.
 */
export type CalendarEventChangeHandler<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = (change: CalendarEventChange<TEvent, TEventId, TResourceId>) => void | Promise<void>;

/** Which input made a proposal: a pointer or keyboard gesture, or the application's own code. */
export type CalendarInputMethod = "pointer" | "keyboard" | "api";

/** What a proposal says beside the change itself; `onEventChangeResult` gets it back. */
export interface CalendarProposalDetail {
  /** Set on the inverse an event history proposes to undo or redo a step. */
  readonly history?: "undo" | "redo";
  readonly input: CalendarInputMethod;
}

export type CalendarTransactionResult<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> =
  | {
      readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
      readonly status: "committed";
    }
  | {
      /** Absent only when the proposal names an event that is not in the snapshot. */
      readonly change?: CalendarEventChange<TEvent, TEventId, TResourceId>;
      readonly error?: unknown;
      readonly reason: string;
      readonly status: "rejected";
    };

export interface CalendarTransactionContext<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The root's working hours, handed to policies. */
  readonly availability?: AvailabilitySnapshot;
  readonly onEventChange: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  /** The application's events, without pending changes applied. */
  readonly snapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly timeZone: string;
}

/** Proposed placements by event ID; `null` marks a pending deletion. */
export type CalendarPendingPlacements<
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = ReadonlyMap<TEventId, CalendarEventPlacement<TResourceId> | null>;

/**
 * Where a pending proposal is: its async policies deciding (`validating`), the handler's promise
 * running (`saving`), or saved but not yet in the application's events (`awaiting-events`).
 */
export type CalendarPendingChangePhase = "validating" | "saving" | "awaiting-events";

export interface CalendarPendingChange<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** The change as proposed while `validating`, and as the handler got it after that. */
  readonly change: CalendarEventChange<TEvent, TEventId, TResourceId>;
  readonly phase: CalendarPendingChangePhase;
}

/** Pending proposals by change ID, in the order they were proposed. */
export type CalendarPendingChanges<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> = ReadonlyMap<string, CalendarPendingChange<TEvent, TEventId, TResourceId>>;
