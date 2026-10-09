import type {
  CalendarEnvironmentBase,
  CalendarEventProposal,
  CalendarFocus,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  EventId,
  EventSnapshot,
  ResourceId,
} from "@moltenship/calendar-core";
import type { InstantInterval, PlainDateInterval } from "@moltenship/calendar-temporal";
import type { ComponentType } from "react";

/** The semantic commands a view renderer may issue without knowing its calendar's types. */
export interface CalendarViewActions {
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  /**
   * Proposes a move, resize, create, or delete, such as the result of a pointer drag. A plain
   * function, so it can be passed on as a callback.
   */
  readonly proposeEventChange: (
    proposal: CalendarEventProposal<EventId, ResourceId>,
  ) => Promise<CalendarTransactionResult<unknown, EventId, ResourceId>>;
  setAnchorDate(anchorDate: Temporal.PlainDate): void;
  /** Moves the calendar's focus; `useRovingFocus` and `useCalendarKeyboard` call it for you. */
  setFocus(focus: CalendarFocus | null): void;
  setSelection(selection: CalendarSelection | null): void;
  setView(view: string): void;
}

export interface CalendarViewRendererProps<TProjection, TOptions> {
  /** Stable for the lifetime of the calendar root. */
  readonly actions: CalendarViewActions;
  readonly environment: CalendarEnvironmentBase;
  /** The events the projection was built from, pending changes included. */
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  readonly options: TOptions;
  readonly projection: TProjection;
  readonly range: PlainDateInterval;
}

export interface CalendarView<
  TName extends string = string,
  TProjection = unknown,
  TOptions = unknown,
  TEvent = unknown,
> {
  readonly defaultOptions: TOptions;
  readonly name: TName;
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}

// oxlint-disable-next-line typescript/no-explicit-any -- views are heterogeneous in a calendar.
export type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;

interface CalendarViewInputBase<TName extends string, TProjection, TOptions, TEvent> {
  readonly name: TName;
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}

export type CalendarViewInput<
  TName extends string,
  TProjection,
  TOptions,
  TEvent,
> = CalendarViewInputBase<TName, TProjection, TOptions, TEvent> &
  (undefined extends TOptions
    ? { readonly defaultOptions?: TOptions }
    : { readonly defaultOptions: TOptions });

/** Options a root passes to its registered views, keyed by view name. */
export type CalendarViewOptionsMap<TViewDef extends AnyCalendarView> = {
  readonly [TName in TViewDef["name"]]?: Partial<
    Extract<TViewDef, { readonly name: TName }>["defaultOptions"]
  >;
};

/** The active view of a calendar with its visible range and memoized projection. */
export type CalendarActiveView<TViewDef extends AnyCalendarView> = TViewDef extends unknown
  ? {
      readonly definition: TViewDef;
      readonly environment: CalendarEnvironmentBase;
      /** The events the projection was built from, pending changes included. */
      readonly events: EventSnapshot<unknown, EventId, ResourceId>;
      readonly instantRange: InstantInterval;
      readonly options: TViewDef["defaultOptions"];
      readonly projection: ReturnType<TViewDef["strategy"]["project"]>;
      readonly range: PlainDateInterval;
      readonly view: TViewDef["name"];
    }
  : never;

export function defineCalendarView<
  const TName extends string,
  TProjection,
  TOptions = undefined,
  TEvent = unknown,
>(
  view: CalendarViewInput<TName, TProjection, TOptions, TEvent>,
): CalendarView<TName, TProjection, TOptions, TEvent> {
  return Object.freeze({
    defaultOptions: view.defaultOptions as TOptions,
    name: view.name,
    Renderer: view.Renderer,
    strategy: view.strategy,
  });
}

/** Applies a root's partial overrides to a view's `defaultOptions`. */
export function resolveViewOptions(view: AnyCalendarView, overrides: object | undefined): unknown {
  return overrides === undefined ? view.defaultOptions : { ...view.defaultOptions, ...overrides };
}
