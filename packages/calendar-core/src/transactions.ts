import type { CalendarEventInterval } from "./events";
import type { CalendarEnvironment } from "./environment";
import type { ResourceId } from "./ids";

export type NonEmptyReadonlyArray<TValue> = readonly [TValue, ...TValue[]];

export type CalendarEventPlacement<TResourceId extends ResourceId = ResourceId> =
  CalendarEventInterval & {
    readonly resourceIds: readonly TResourceId[];
  };

export interface CalendarValidationIssue {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;
  readonly path?: readonly string[];
}

export type CalendarValidationResult<TPlacement> =
  | {
      readonly placement: TPlacement;
      readonly status: "valid";
    }
  | {
      readonly issues: NonEmptyReadonlyArray<CalendarValidationIssue>;
      readonly placement: TPlacement;
      readonly status: "invalid";
    }
  | {
      readonly issues?: readonly CalendarValidationIssue[];
      readonly original: TPlacement;
      readonly placement: TPlacement;
      readonly status: "transformed";
    };

export type CalendarChangeCause =
  | "create"
  | "move"
  | "resize-start"
  | "resize-end"
  | "resource-change"
  | "keyboard"
  | "editor";

export interface CalendarEventChangeProposal<TEvent, TResourceId extends ResourceId = ResourceId> {
  readonly cause: CalendarChangeCause;
  readonly event: TEvent | null;
  readonly original: CalendarEventPlacement<TResourceId> | null;
  readonly proposed: CalendarEventPlacement<TResourceId>;
  readonly sourceView: string;
}

export interface CalendarEventChange<
  TEvent,
  TResourceId extends ResourceId = ResourceId,
> extends CalendarEventChangeProposal<TEvent, TResourceId> {
  readonly id: string;
  readonly validation: CalendarValidationResult<CalendarEventPlacement<TResourceId>>;
}

export type CalendarEventChangeHandler<TEvent, TResourceId extends ResourceId = ResourceId> = (
  change: CalendarEventChange<TEvent, TResourceId>,
) => boolean | Promise<boolean | void> | void;

export interface CalendarPolicyContext<TEvent, TResource> {
  readonly environment: CalendarEnvironment;
  readonly event: TEvent | null;
  readonly resources: readonly TResource[];
}

export type CalendarPolicy<TEvent, TResource, TResourceId extends ResourceId = ResourceId> = (
  proposal: CalendarEventChangeProposal<TEvent, TResourceId>,
  context: CalendarPolicyContext<TEvent, TResource>,
) =>
  | CalendarValidationResult<CalendarEventPlacement<TResourceId>>
  | Promise<CalendarValidationResult<CalendarEventPlacement<TResourceId>>>;

export type CalendarTransactionState = "pending" | "confirmed" | "rejected";

export interface CalendarTransactionStateChange<
  TEvent,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly change: CalendarEventChange<TEvent, TResourceId>;
  readonly error?: unknown;
  readonly state: CalendarTransactionState;
}
