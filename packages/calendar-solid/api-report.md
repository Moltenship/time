# @moltenship/calendar-solid API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-solid`

```ts
import {
  Accessor,
  Component,
} from "solid-js";
import {
  CalendarActions,
  CalendarActiveView,
  CalendarActiveView as CalendarActiveView$1,
  CalendarAgentEvent,
  CalendarAgentEvent as CalendarAgentEvent$1,
  CalendarChangeReason,
  CalendarChangeSource,
  CalendarCommandOptions,
  CalendarControlledState,
  CalendarDiagnostic,
  CalendarDiagnostic as CalendarDiagnostic$1,
  CalendarPartIds,
  CalendarPartIds as CalendarPartIds$1,
  CalendarPublicState,
  CalendarPublicState as CalendarPublicState$1,
  CalendarRootStore,
  CalendarRootStore as CalendarRootStore$1,
  CalendarSemanticActions,
  CalendarSemanticActions as CalendarSemanticActions$1,
  CalendarStateChangeDetail,
  CalendarStateChangeHandler,
  CalendarStateChangeHandler as CalendarStateChangeHandler$1,
  CalendarStateChangeHandlers,
  CalendarStateSelector,
  CalendarStateSelector as CalendarStateSelector$1,
  CalendarStateSelectorOptions,
  CalendarStateSelectorOptions as CalendarStateSelectorOptions$1,
  CalendarStateSlice,
  CalendarStateSource,
  CalendarStateSource as CalendarStateSource$1,
  CalendarStore,
  CalendarStoreOptions,
  CalendarViewActions,
  CalendarViewActions as CalendarViewActions$1,
  CalendarViewDefinition,
  CalendarViewOptionsMap,
  CalendarViewOptionsMap as CalendarViewOptionsMap$1,
  CalendarVisibleRange,
  CalendarVisibleRange as CalendarVisibleRange$1,
  createCalendarStore,
  resolveViewOptions,
} from "@moltenship/calendar-primitives";
import {
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAvailability,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarEventChangeHandler,
  CalendarEventInput,
  CalendarFocus,
  CalendarNowSource,
  CalendarPendingChanges,
  CalendarPolicy,
  CalendarProposalDetail,
  CalendarSecondaryTimeZone,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  CalendarWeekRules,
  EventAdapter,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  JSX,
} from "@solidjs/web";
import {
  PlainDateInterval,
} from "@moltenship/calendar-temporal";

type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;
type CalendarAccessibleName = {
  readonly "aria-label": string;
  readonly children?: JSX.Element;
} | {
  readonly "aria-label"?: string;
  readonly children: JSX.Element;
};
interface CalendarActiveViewProps {
  readonly fallback?: JSX.Element;
}
interface CalendarContextValue<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly actions: CalendarSemanticActions$1<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  readonly meta: CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  readonly state: CalendarPublicState$1<TViewDef["name"], TSelection, TFocus, TResourceId>;
}
interface CalendarFactory<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly ActiveView: Component<CalendarActiveViewProps>;
  readonly Frame: Component<CalendarFrameProps>;
  readonly NextTrigger: Component<CalendarTriggerProps>;
  readonly PreviousTrigger: Component<CalendarTriggerProps>;
  readonly Root: Component<CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>>;
  readonly Title: Component<CalendarTitleProps>;
  readonly TodayTrigger: Component<CalendarTriggerProps>;
  readonly Toolbar: Component<CalendarToolbarProps>;
  readonly Viewport: Component<CalendarViewportProps>;
  readonly ViewSwitcher: Component<CalendarViewSwitcherProps<TViewDef["name"]>>;
  readonly views: readonly TViewDef[];
  useCalendar(): CalendarContextValue<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
  useCalendarActions(): CalendarSemanticActions$1<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  useCalendarMeta(): Accessor<CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>>;
  useCalendarPendingChanges(): Accessor<CalendarPendingChanges<TEvent, TEventId, TResourceId>>;
  useCalendarPendingChanges<TSelected>(selector: CalendarStateSelector$1<CalendarPendingChanges<TEvent, TEventId, TResourceId>, TSelected>, options?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
  useCalendarSelector<TSelected>(selector: CalendarStateSelector$1<CalendarPublicState$1<TViewDef["name"], TSelection, TFocus, TResourceId>, TSelected>, options?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
  useCalendarState(): Accessor<CalendarPublicState$1<TViewDef["name"], TSelection, TFocus, TResourceId>>;
  useViewProjection(): Accessor<CalendarActiveView$1<TViewDef> | null>;
  useVisibleRange(): Accessor<PlainDateInterval | null>;
}
type CalendarFrameProps = Omit<ElementProps<"section">, "id">;
interface CalendarMeta<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly activeView: TViewDef | undefined;
  readonly diagnostics: readonly CalendarDiagnostic$1<TEvent, TEventId>[];
  readonly environment: CalendarEnvironment;
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly ids: CalendarPartIds$1;
  readonly instanceId: string;
  readonly label: string | undefined;
  readonly refs: CalendarPartRefs;
  readonly resources: readonly TResource[];
  readonly views: readonly TViewDef[];
}
interface CalendarPartRefs {
  readonly frame: Accessor<HTMLElement | undefined>;
  readonly title: Accessor<HTMLSpanElement | undefined>;
  readonly toolbar: Accessor<HTMLElement | undefined>;
  readonly viewport: Accessor<HTMLDivElement | undefined>;
}
type CalendarRootAnchorProps = {
  readonly anchorDate: Temporal.PlainDate;
  readonly defaultAnchorDate?: Temporal.PlainDate;
} | {
  readonly anchorDate?: undefined;
  readonly defaultAnchorDate: Temporal.PlainDate;
};
interface CalendarRootBaseProps<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly allowAgentDelete?: boolean;
  readonly annotationSources?: readonly CalendarAnnotationSource[];
  readonly annotations?: readonly CalendarAnnotation<unknown, TResourceId>[];
  readonly availability?: CalendarAvailability;
  readonly children?: JSX.Element;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultView?: TViewDef["name"];
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  readonly formatAgentEventLabel?: (event: CalendarAgentEvent$1) => string;
  readonly events: CalendarEventInput<TEvent>;
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  readonly id?: string;
  readonly label?: string;
  readonly locale: Intl.Locale | string;
  readonly onAnchorDateChange?: CalendarStateChangeHandler$1<Temporal.PlainDate, "anchorDate">;
  readonly onDiagnosticsChange?: (diagnostics: readonly CalendarDiagnostic$1<TEvent, TEventId>[]) => void;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onEventChangeResult?: (result: CalendarTransactionResult<TEvent, TEventId, TResourceId>, detail: CalendarProposalDetail) => void;
  readonly onExpandedResourceIdsChange?: CalendarStateChangeHandler$1<readonly TResourceId[], "expandedResourceIds">;
  readonly onFocusChange?: CalendarStateChangeHandler$1<TFocus | null, "focus">;
  readonly onSelectionChange?: CalendarStateChangeHandler$1<TSelection | null, "selection">;
  readonly onTimeZoneChange?: CalendarStateChangeHandler$1<string, "timeZone">;
  readonly onViewChange?: CalendarStateChangeHandler$1<TViewDef["name"], "view">;
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange$1<TViewDef["name"]>) => void;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  readonly secondaryTimeZones?: readonly (CalendarSecondaryTimeZone | string)[];
  readonly selection?: TSelection | null;
  readonly store?: CalendarRootStore$1<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly view?: TViewDef["name"];
  readonly viewOptions?: CalendarViewOptionsMap$1<TViewDef>;
  readonly weekRules: CalendarWeekRules;
}
type CalendarRootProps<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = CalendarRootBaseProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> & CalendarRootAnchorProps & CalendarRootTimeZoneProps & CalendarNowSource;
type CalendarRootTimeZoneProps = {
  readonly defaultTimeZone?: string;
  readonly timeZone: string;
} | {
  readonly defaultTimeZone: string;
  readonly timeZone?: undefined;
};
type CalendarTitleProps = Omit<ElementProps<"span">, "id">;
type CalendarToolbarProps = ElementProps<"header">;
type CalendarTriggerProps = Omit<ElementProps<"button">, "children"> & CalendarAccessibleName;
interface CalendarView<TName extends string = string, TProjection = unknown, TOptions = unknown, TEvent = unknown> extends CalendarViewDefinition<TName, TProjection, TOptions, TEvent> {
  readonly Renderer: Component<CalendarViewRendererProps<TProjection, TOptions>>;
}
type CalendarViewInput<TName extends string, TProjection, TOptions, TEvent> = CalendarViewInputBase<TName, TProjection, TOptions, TEvent> & (undefined extends TOptions ? {
  readonly defaultOptions?: TOptions;
} : {
  readonly defaultOptions: TOptions;
});
interface CalendarViewInputBase<TName extends string, TProjection, TOptions, TEvent> {
  readonly name: TName;
  readonly Renderer: Component<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}
interface CalendarViewRendererProps<TProjection, TOptions> {
  readonly actions: CalendarViewActions$1;
  readonly environment: CalendarEnvironmentBase;
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  readonly isReadOnly?: boolean;
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly projection: TProjection;
  readonly range: PlainDateInterval;
}
type CalendarViewSwitcherProps<TView extends string = string> = Omit<ElementProps<"select">, "children" | "value"> & {
  readonly getViewLabel: (view: TView) => string;
};
type CalendarViewportProps = Omit<ElementProps<"div">, "id">;
interface CreateCalendarOptions<TEvent, TViewDef extends AnyCalendarView, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views?: readonly TViewDef[];
}
type ElementProps<Tag extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[Tag];
export declare function createCalendar<TEvent, TResource = unknown, TSelection = CalendarSelection, TFocus = CalendarFocus>(): <TViewDef extends AnyCalendarView<TEvent> = never, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>) => CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
export declare function createStateSelector<TState, TSelected>(source: CalendarStateSource$1<TState> | Accessor<CalendarStateSource$1<TState>>, selector: CalendarStateSelector$1<TState, TSelected>, { isEqual }?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
export declare function defineCalendarView<const TName extends string, TProjection, TOptions = undefined, TEvent = unknown>(view: CalendarViewInput<TName, TProjection, TOptions, TEvent>): CalendarView<TName, TProjection, TOptions, TEvent>;

export {
  type AnyCalendarView,
  type CalendarActions,
  type CalendarActiveView,
  type CalendarActiveViewProps,
  type CalendarAgentEvent,
  type CalendarChangeReason,
  type CalendarChangeSource,
  type CalendarCommandOptions,
  type CalendarContextValue,
  type CalendarControlledState,
  type CalendarDiagnostic,
  type CalendarFactory,
  type CalendarFrameProps,
  type CalendarMeta,
  type CalendarPartIds,
  type CalendarPartRefs,
  type CalendarPublicState,
  type CalendarRootProps,
  type CalendarRootStore,
  type CalendarSemanticActions,
  type CalendarStateChangeDetail,
  type CalendarStateChangeHandler,
  type CalendarStateChangeHandlers,
  type CalendarStateSelector,
  type CalendarStateSelectorOptions,
  type CalendarStateSlice,
  type CalendarStateSource,
  type CalendarStore,
  type CalendarStoreOptions,
  type CalendarTitleProps,
  type CalendarToolbarProps,
  type CalendarTriggerProps,
  type CalendarView,
  type CalendarViewActions,
  type CalendarViewInput,
  type CalendarViewOptionsMap,
  type CalendarViewRendererProps,
  type CalendarViewSwitcherProps,
  type CalendarViewportProps,
  type CalendarVisibleRange,
  type CreateCalendarOptions,
  createCalendarStore,
  resolveViewOptions,
};
```
