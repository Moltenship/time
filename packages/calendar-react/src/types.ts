import type { ResourceId } from "@moltenship/calendar-core";

export interface CalendarPublicState<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
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
  TSelection = string,
  TFocus = string,
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
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> = Partial<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;

export interface CalendarStateChangeDetail<
  TValue,
  TSlice extends CalendarStateSlice = CalendarStateSlice,
> {
  readonly controlled: boolean;
  readonly previous: TValue;
  readonly slice: TSlice;
}

export type CalendarStateChangeHandler<TValue, TSlice extends CalendarStateSlice> = (
  next: TValue,
  detail: CalendarStateChangeDetail<TValue, TSlice>,
) => void;

export type CalendarStateChangeHandlers<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> = {
  readonly [TSlice in CalendarStateSlice as `on${Capitalize<TSlice>}Change`]?: CalendarStateChangeHandler<
    CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice],
    TSlice
  >;
};

export type CalendarActions<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> = {
  readonly [TSlice in CalendarStateSlice as `set${Capitalize<TSlice>}`]: (
    next: CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice],
  ) => void;
};

/**
 * Uncontrolled calendar state. While a `Root` is mounted with this store, `actions` honor that
 * root's controlled slices and change handlers.
 */
export interface CalendarStore<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly getSnapshot: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly subscribe: (listener: () => void) => () => void;
}

export type CalendarStateSelector<TState, TSelected> = (state: TState) => TSelected;

export interface CalendarStateSelectorOptions<TSelected> {
  readonly isEqual?: (previous: TSelected, next: TSelected) => boolean;
}
