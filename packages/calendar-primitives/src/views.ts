import type {
  CalendarEnvironmentBase,
  CalendarEventProposal,
  CalendarFocus,
  CalendarPolicyResult,
  CalendarProposalDetail,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  EventId,
  EventSnapshot,
  ResourceId,
} from "@moltenship/calendar-core";
import type { InstantInterval, PlainDateInterval } from "@moltenship/calendar-temporal";

import type { CalendarCommandOptions } from "./types";

/**
 * A view as the kernel knows it: a name and the strategy that ranges, navigates and projects it.
 * A framework adapter adds what renders it, as React's `defineCalendarView` adds a `Renderer`.
 */
export interface CalendarViewDefinition<
  TName extends string = string,
  TProjection = unknown,
  TOptions = unknown,
  TEvent = unknown,
> {
  readonly defaultOptions: TOptions;
  readonly name: TName;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}

// oxlint-disable-next-line typescript/no-explicit-any -- views are heterogeneous in a calendar.
export type AnyCalendarViewDefinition<TEvent = any> = CalendarViewDefinition<
  string,
  // oxlint-disable-next-line typescript/no-explicit-any -- as above.
  any,
  // oxlint-disable-next-line typescript/no-explicit-any -- as above.
  any,
  TEvent
>;

/** The semantic commands a view renderer may issue without knowing its calendar's types. */
export interface CalendarViewActions {
  /**
   * Asks the policies about a proposal without saving it, as a gesture's preview does; pass it to
   * the pointer layer's `check`. A plain function, so it can be passed on as a callback.
   */
  readonly checkEventChange: (
    proposal: CalendarEventProposal<EventId, ResourceId, unknown>,
  ) => CalendarPolicyResult<unknown, EventId, ResourceId> | null;
  navigateNext(options?: CalendarCommandOptions): void;
  navigatePrevious(options?: CalendarCommandOptions): void;
  navigateToday(options?: CalendarCommandOptions): void;
  /**
   * Proposes a move, resize, create, or delete, such as the result of a pointer drag; the pointer
   * layer passes `{ input: "pointer" }` as `detail`. A create may carry the application's record
   * as `event`, as an item dropped in from outside the calendar does. A plain function, so it can
   * be passed on as a callback.
   */
  readonly proposeEventChange: (
    proposal: CalendarEventProposal<EventId, ResourceId, unknown>,
    detail?: CalendarProposalDetail,
  ) => Promise<CalendarTransactionResult<unknown, EventId, ResourceId>>;
  setAnchorDate(anchorDate: Temporal.PlainDate, options?: CalendarCommandOptions): void;
  /** Moves the calendar's focus; `useRovingFocus` and `useCalendarKeyboard` call it for you. */
  setFocus(focus: CalendarFocus | null, options?: CalendarCommandOptions): void;
  setSelection(selection: CalendarSelection | null, options?: CalendarCommandOptions): void;
  setView(view: string, options?: CalendarCommandOptions): void;
}

/** Options a root passes to its registered views, keyed by view name. */
export type CalendarViewOptionsMap<TViewDef extends AnyCalendarViewDefinition> = {
  readonly [TName in TViewDef["name"]]?: Partial<
    Extract<TViewDef, { readonly name: TName }>["defaultOptions"]
  >;
};

/** The active view of a calendar with its visible range and memoized projection. */
export type CalendarActiveView<TViewDef extends AnyCalendarViewDefinition> =
  TViewDef extends unknown
    ? {
        readonly definition: TViewDef;
        readonly environment: CalendarEnvironmentBase;
        /** The events the projection was built from, pending changes included. */
        readonly events: EventSnapshot<unknown, EventId, ResourceId>;
        readonly instantRange: InstantInterval;
        /** `loadRange` resolved to instants in the display time zone. */
        readonly loadInstantRange: InstantInterval;
        /** The dates the projection covers: `range`, or more for a scrolling view. */
        readonly loadRange: PlainDateInterval;
        readonly options: TViewDef["defaultOptions"];
        readonly projection: ReturnType<TViewDef["strategy"]["project"]>;
        readonly range: PlainDateInterval;
        readonly view: TViewDef["name"];
      }
    : never;

/** Applies a root's partial overrides to a view's `defaultOptions`. */
export function resolveViewOptions(
  view: AnyCalendarViewDefinition,
  overrides: object | undefined,
): unknown {
  return overrides === undefined ? view.defaultOptions : { ...view.defaultOptions, ...overrides };
}
