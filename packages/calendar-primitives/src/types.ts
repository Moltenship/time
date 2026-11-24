import type { CalendarFocus, CalendarSelection, ResourceId } from "@moltenship/calendar-core";

export interface CalendarPublicState<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly anchorDate: Temporal.PlainDate;
  readonly expandedResourceIds: readonly TResourceId[];
  readonly focus: TFocus | null;
  readonly selection: TSelection | null;
  readonly timeZone: string;
  readonly view: TView;
}

export type CalendarStateSlice = keyof CalendarPublicState;

export interface CalendarStoreOptions<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly defaultAnchorDate: Temporal.PlainDate;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultTimeZone: string;
  readonly defaultView: TView;
}

/** Slices whose value is owned by props. `undefined` leaves a slice uncontrolled. */
export type CalendarControlledState<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> = Partial<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;

/**
 * Why a slice changed: `"imperative"` for a command called from code, the press of the
 * navigation trigger that asked for it, `"input-change"` for the view switcher,
 * `"keyboard-navigation"` for a view's keys moving focus or the range, `"focus-change"` for focus
 * a person moves onto a cell or event, and `"resource-toggle"` for a resource's expand or collapse.
 */
export type CalendarChangeReason =
  | "focus-change"
  | "imperative"
  | "input-change"
  | "keyboard-navigation"
  | "next-press"
  | "previous-press"
  | "resource-toggle"
  | "today-press";

/**
 * Who caused a change: a person by `"mouse"`, `"touch"`, `"pen"`, `"keyboard"` or `"virtual"` (a
 * click with no pointer or key behind it, which may be assistive technology), an AI agent
 * (`"agent"`), or code (`"programmatic"`). For analytics and focus choices, not for behaviour;
 * a change to refuse an agent's is the place for that.
 */
export type CalendarChangeSource =
  | "agent"
  | "keyboard"
  | "mouse"
  | "pen"
  | "programmatic"
  | "touch"
  | "virtual";

/** What a command passes on to the change handler it reaches. */
export interface CalendarCommandOptions {
  /** The DOM event behind the command, which tells the handler how the person caused it. */
  readonly event?: Event;
  /** `"imperative"` by default. */
  readonly reason?: CalendarChangeReason;
  /**
   * Who asked, when the command doesn't learn it from `event`: the calendar's agent actions pass
   * `"agent"`. Worked out from the event, or `"programmatic"`, when absent.
   */
  readonly source?: CalendarChangeSource;
}

/**
 * What a change handler hears beside the new value: why it changed, the DOM event behind it, who
 * caused it (`"agent"` for a change an AI agent asked for) and `cancel()`, plus the slice, its
 * previous value and whether a prop controls it. `cancel()` keeps an uncontrolled slice as it
 * was; a controlled one changes only when its owner passes the new value anyway.
 */
export interface CalendarStateChangeDetail<
  TValue,
  TSlice extends CalendarStateSlice = CalendarStateSlice,
> {
  /** Stops the change: an uncontrolled slice keeps its value. */
  readonly cancel: () => void;
  /** Whether `cancel()` was called. */
  readonly canceled: boolean;
  readonly controlled: boolean;
  /** The DOM event behind the change, as a trigger's click; absent for code and agents. */
  readonly event?: Event;
  readonly previous: TValue;
  readonly reason: CalendarChangeReason;
  readonly slice: TSlice;
  readonly source: CalendarChangeSource;
}

export type CalendarStateChangeHandler<TValue, TSlice extends CalendarStateSlice> = (
  next: TValue,
  detail: CalendarStateChangeDetail<TValue, TSlice>,
) => void;

export type CalendarStateChangeHandlers<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> = {
  readonly [
    TSlice in CalendarStateSlice as `on${Capitalize<TSlice>}Change`
  ]?: CalendarStateChangeHandler<
    CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice],
    TSlice
  >;
};

export type CalendarActions<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> = {
  readonly [TSlice in CalendarStateSlice as `set${Capitalize<TSlice>}`]: (
    next: CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice],
    options?: CalendarCommandOptions,
  ) => void;
};

/**
 * Uncontrolled calendar state. While a `Root` is mounted with this store, `actions` honor that
 * root's controlled slices and change handlers.
 */
export interface CalendarStore<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly getSnapshot: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly subscribe: (listener: () => void) => () => void;
}

/**
 * The store a root takes: one made with the root's types, or, for a calendar without resources,
 * one made with the default `ResourceId`. An adapter whose `getResourceIds` returns `[]` infers
 * `never` for its resource IDs, which a store made without type arguments doesn't match; such a
 * calendar has no resource ID to keep, so either fits.
 */
export type CalendarRootStore<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
> =
  | CalendarStore<TView, TSelection, TFocus, TResourceId>
  | ([TResourceId] extends [never] ? CalendarStore<TView, TSelection, TFocus> : never);

export type CalendarStateSelector<TState, TSelected> = (state: TState) => TSelected;

export interface CalendarStateSelectorOptions<TSelected> {
  readonly isEqual?: (previous: TSelected, next: TSelected) => boolean;
}

/** Something that holds a value and says when it changes, as a store or a root's pending changes. */
export interface CalendarStateSource<TState = AnyCalendarState> {
  /** What the server and hydration read, when it differs from `getSnapshot`. */
  readonly getServerSnapshot?: () => TState;
  readonly getSnapshot: () => TState;
  readonly subscribe: (listener: () => void) => () => void;
}

export type AnyCalendarState = CalendarPublicState<string, unknown, unknown>;
