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

export type CalendarEventProposal<TEventId extends EventId, TResourceId extends ResourceId> =
  | {
      readonly cause: "create";
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

export interface CalendarEventCreateChange<TResourceId extends ResourceId> {
  readonly cause: "create";
  readonly event: null;
  readonly eventId: null;
  readonly id: string;
  readonly original: null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
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
}

export type CalendarEventChange<TEvent, TEventId extends EventId, TResourceId extends ResourceId> =
  | CalendarEventCreateChange<TResourceId>
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
