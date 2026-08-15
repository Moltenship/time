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

type CalendarState<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> = CalendarPublicState<TView, TSelection, TFocus, TResourceId>;

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

export type CalendarControlledState<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> = Partial<CalendarState<TView, TSelection, TFocus, TResourceId>>;

export interface CalendarStateChangeDetail<
  TValue,
  TSlice extends CalendarStateSlice = CalendarStateSlice,
> {
  readonly controlled: boolean;
  readonly previous: TValue;
  readonly slice: TSlice;
  readonly source: "action";
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
    CalendarState<TView, TSelection, TFocus, TResourceId>[TSlice],
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
    next: CalendarState<TView, TSelection, TFocus, TResourceId>[TSlice],
  ) => void;
};

export interface CalendarStateSource<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly controlledSlices: readonly CalendarStateSlice[];
  getServerSnapshot(): CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  getSnapshot(): CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  isControlled(slice: CalendarStateSlice): boolean;
}

export interface CalendarStoreMeta {
  readonly destroyed: boolean;
}

export interface CalendarStore<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> extends CalendarStateSource<TView, TSelection, TFocus, TResourceId> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly meta: CalendarStoreMeta;
  createActions(
    source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>,
    handlers?: CalendarStateChangeHandlers<TView, TSelection, TFocus, TResourceId>,
  ): CalendarActions<TView, TSelection, TFocus, TResourceId>;
  createStateSource(
    controlled?: CalendarControlledState<TView, TSelection, TFocus, TResourceId>,
  ): CalendarStateSource<TView, TSelection, TFocus, TResourceId>;
  destroy(): void;
}

export interface CalendarStoreBindingMeta<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly controlledSlices: readonly CalendarStateSlice[];
  readonly source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>;
  readonly store: CalendarStore<TView, TSelection, TFocus, TResourceId>;
}

export interface CalendarStoreBinding<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly meta: CalendarStoreBindingMeta<TView, TSelection, TFocus, TResourceId>;
  readonly state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
}

export type CalendarStateSelector<TState, TSelected> = (state: TState) => TSelected;

export interface CalendarStateSelectorOptions<TSelected> {
  readonly isEqual?: (previous: TSelected, next: TSelected) => boolean;
}

export interface UseCalendarStoreBindingOptions<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly controlled?: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  readonly handlers?: CalendarStateChangeHandlers<TView, TSelection, TFocus, TResourceId>;
}
