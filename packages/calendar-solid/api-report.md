# @moltenship/calendar-solid API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-solid`

```ts
import {
  Accessor,
  Component,
} from "solid-js";
import {
  AvailabilityBand,
  AvailabilityExtent,
  AvailabilitySnapshot,
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAnnouncementMessages,
  CalendarAnnouncer,
  CalendarAvailability,
  CalendarDraft,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarEventChangeHandler,
  CalendarEventInput,
  CalendarEventInterval,
  CalendarFocus,
  CalendarInteractionCheck,
  CalendarKeyboardSession,
  CalendarNowSource,
  CalendarPendingChanges,
  CalendarPolicy,
  CalendarProposalDetail,
  CalendarSecondaryTimeZone,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  CalendarWeekRules,
  ClosedDate,
  EventAdapter,
  EventHistory,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceVisibilityOptions,
  TimeGridAnnotationGeometry,
  TimeGridAnnotationMark,
  TimeGridColumn,
  VisibleResource,
} from "@moltenship/calendar-core";
import {
  CalendarActions,
  CalendarActiveView,
  CalendarActiveView as CalendarActiveView$1,
  CalendarAgentEvent,
  CalendarAgentEvent as CalendarAgentEvent$1,
  CalendarAnnotations,
  CalendarBusyResources,
  CalendarChangeReason,
  CalendarChangeSource,
  CalendarCommandOptions,
  CalendarCommandOptions as CalendarCommandOptions$1,
  CalendarControlledState,
  CalendarDiagnostic,
  CalendarDiagnostic as CalendarDiagnostic$1,
  CalendarDraftBusy,
  CalendarHistory,
  CalendarHistoryAnnouncementBuilder,
  CalendarHistoryAnnouncementContext,
  CalendarHistoryCommandOptions,
  CalendarHistoryMessages,
  CalendarHistoryOptions,
  CalendarHistoryShortcutsTarget,
  CalendarKeyboardOptions,
  CalendarPartIds,
  CalendarPartIds as CalendarPartIds$1,
  CalendarPublicState,
  CalendarPublicState as CalendarPublicState$1,
  CalendarResourceStatus,
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
  CalendarDragFollower,
  CalendarDragMonitor,
  CalendarDragPreview,
  CalendarDropOptions,
  CalendarDropSession,
  CalendarDropSource,
  CalendarEventDrag,
  CalendarPoint,
  CalendarPointerOptions,
  CalendarPointerOptions as CalendarPointerOptions$1,
  CalendarRect,
  CalendarRegion,
  attachCalendarPointer,
  eventIdAttributes,
  eventIdOf,
  monitorCalendarDrags,
  observeCalendarRegions,
  resourceIdAttributes,
  resourceIdOf,
  startCalendarDrop,
} from "@moltenship/calendar-dnd";
import {
  InstantInterval,
  PlainDateInterval,
} from "@moltenship/calendar-temporal";
import {
  JSX,
} from "@solidjs/web";

export declare function Announcer(props: CalendarAnnouncerProps): JSX.Element;
type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;
type AnyDraft = CalendarDraft<EventId, ResourceId>;
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
type CalendarAnnouncerProps = Omit<ElementProps<"div">, "children"> & {
  readonly messages: CalendarAnnouncementMessages;
};
interface CalendarBusyResourcesOptions {
  readonly exclude?: EventId | null;
  readonly resourceIds?: readonly ResourceId[];
}
interface CalendarContextValue<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly actions: CalendarSemanticActions$1<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  readonly meta: CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  readonly state: CalendarPublicState$1<TViewDef["name"], TSelection, TFocus, TResourceId>;
}
interface CalendarEventProps<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly children: (value: Accessor<CalendarEventRenderValue<TEvent, TEventId, TResourceId>>) => JSX.Element;
  readonly eventId: TEventId;
  readonly fallback?: JSX.Element;
}
interface CalendarEventRenderValue<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly event: TEvent;
  readonly normalized: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
}
interface CalendarFactory<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly ActiveView: Component<CalendarActiveViewProps>;
  readonly Announcer: Component<CalendarAnnouncerProps>;
  readonly Event: Component<CalendarEventProps<TEvent, TEventId, TResourceId>>;
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
interface CalendarHistoryShortcutsOptions {
  readonly disabled?: boolean;
  readonly redo?: readonly string[];
  readonly scope: MaybeAccessor<HTMLElement | null | undefined>;
  readonly undo?: readonly string[];
}
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
interface CalendarResourceExpansion {
  readonly expanded: Accessor<boolean>;
  readonly collapse: CalendarResourceExpansionCommand;
  readonly expand: CalendarResourceExpansionCommand;
  readonly toggle: CalendarResourceExpansionCommand;
}
type CalendarResourceExpansionCause = CalendarCommandOptions$1 | Event;
type CalendarResourceExpansionCommand = (cause?: unknown) => void;
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
interface CalendarRovingFocusOptions {
  readonly days?: number;
}
interface CalendarRovingFocusProps {
  readonly onFocus: (event: FocusEvent) => void;
  readonly ref: (element: HTMLElement) => void;
  readonly tabindex: 0 | -1;
}
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
type MaybeAccessor<T> = T | Accessor<T>;
interface UseNowOptions {
  readonly intervalMs?: number;
}
export declare function createCalendar<TEvent, TResource = unknown, TSelection = CalendarSelection, TFocus = CalendarFocus>(): <TViewDef extends AnyCalendarView<TEvent> = never, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>) => CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
export declare function createStateSelector<TState, TSelected>(source: CalendarStateSource$1<TState> | Accessor<CalendarStateSource$1<TState>>, selector: CalendarStateSelector$1<TState, TSelected>, { isEqual }?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
export declare function defineCalendarView<const TName extends string, TProjection, TOptions = undefined, TEvent = unknown>(view: CalendarViewInput<TName, TProjection, TOptions, TEvent>): CalendarView<TName, TProjection, TOptions, TEvent>;
export declare function useAnchorDateRequests(listener: (date: Temporal.PlainDate, range: PlainDateInterval | null) => void): void;
export declare function useBusyResources(range: MaybeAccessor<InstantInterval | CalendarEventInterval | null>, options?: MaybeAccessor<CalendarBusyResourcesOptions>): Accessor<CalendarBusyResources>;
export declare function useCalendarAnnotations(): Accessor<CalendarAnnotations>;
export declare function useCalendarAnnouncer(): CalendarAnnouncer;
export declare function useCalendarAvailability(): Accessor<AvailabilitySnapshot>;
export declare function useCalendarDraft(): Accessor<AnyDraft | null>;
export declare function useCalendarDraftReporter(): (draft: AnyDraft | null) => void;
export declare function useCalendarFocus<TSelected>(selector: (focus: CalendarFocus | null) => TSelected, options?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
export declare function useCalendarHistory<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(history: EventHistory<TEvent, TEventId, TResourceId>, options?: MaybeAccessor<CalendarHistoryOptions<NoInfer<TEvent>, NoInfer<TEventId>, NoInfer<TResourceId>>>): Accessor<CalendarHistory<TEvent, TEventId, TResourceId>>;
export declare function useCalendarHistoryShortcuts(history: MaybeAccessor<CalendarHistoryShortcutsTarget>, options: MaybeAccessor<CalendarHistoryShortcutsOptions>): void;
export declare function useCalendarInteraction(): Accessor<CalendarKeyboardSession | null>;
export declare function useCalendarInteraction<TSelected>(selector: (session: CalendarKeyboardSession | null, check: CalendarInteractionCheck) => TSelected, options?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
export declare function useCalendarKeyboard(options?: MaybeAccessor<CalendarKeyboardOptions>): (element: HTMLElement) => void;
export declare function useCalendarPointer<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(options: MaybeAccessor<CalendarPointerOptions$1<TEvent, TEventId, TResourceId>>): (element: HTMLElement) => void;
export declare function useCalendarSelection<TSelected>(selector: (selection: CalendarSelection | null) => TSelected, options?: CalendarStateSelectorOptions$1<TSelected>): Accessor<TSelected>;
export declare function useClosedDates(range: MaybeAccessor<PlainDateInterval>, resourceId?: MaybeAccessor<ResourceId | null | undefined>): Accessor<ReadonlyMap<string, ClosedDate>>;
export declare function useDraftBusy(resourceId: MaybeAccessor<ResourceId | null>): Accessor<CalendarDraftBusy | null>;
export declare function useNow(options?: MaybeAccessor<UseNowOptions>): Accessor<Temporal.Instant | null>;
export declare function useResourceExpansion(resourceId: MaybeAccessor<ResourceId>): CalendarResourceExpansion;
export declare function useResourceStatus(resourceId?: MaybeAccessor<ResourceId | null | undefined>, at?: MaybeAccessor<Temporal.Instant | undefined>): Accessor<CalendarResourceStatus | null>;
export declare function useRovingFocus(target: MaybeAccessor<CalendarFocus>, options?: MaybeAccessor<CalendarRovingFocusOptions>): CalendarRovingFocusProps;
export declare function useTimeGridAnnotations(columns: MaybeAccessor<readonly TimeGridColumn[]>, geometry?: MaybeAccessor<TimeGridAnnotationGeometry>): Accessor<readonly (readonly TimeGridAnnotationMark[])[]>;
export declare function useTimeGridAvailability(columns: MaybeAccessor<readonly TimeGridColumn[]>, resourceId?: MaybeAccessor<ResourceId | null | undefined>): Accessor<readonly (readonly AvailabilityBand[])[]>;
export declare function useTimelineAvailability(columns: MaybeAccessor<readonly TimeGridColumn[]>, resourceId?: MaybeAccessor<ResourceId | null | undefined>): Accessor<readonly AvailabilityExtent[]>;
export declare function useVisibleResources(options?: MaybeAccessor<ResourceVisibilityOptions>): Accessor<readonly VisibleResource[]>;

export * from "@moltenship/calendar-core";
export * from "@moltenship/calendar-temporal";

export {
  type AnyCalendarView,
  type CalendarActions,
  type CalendarActiveView,
  type CalendarActiveViewProps,
  type CalendarAgentEvent,
  type CalendarAnnotations,
  type CalendarAnnouncerProps,
  type CalendarBusyResources,
  type CalendarBusyResourcesOptions,
  type CalendarChangeReason,
  type CalendarChangeSource,
  type CalendarCommandOptions,
  type CalendarContextValue,
  type CalendarControlledState,
  type CalendarDiagnostic,
  type CalendarDraftBusy,
  type CalendarDragFollower,
  type CalendarDragMonitor,
  type CalendarDragPreview,
  type CalendarDropOptions,
  type CalendarDropSession,
  type CalendarDropSource,
  type CalendarEventDrag,
  type CalendarEventProps,
  type CalendarEventRenderValue,
  type CalendarFactory,
  type CalendarFrameProps,
  type CalendarHistory,
  type CalendarHistoryAnnouncementBuilder,
  type CalendarHistoryAnnouncementContext,
  type CalendarHistoryCommandOptions,
  type CalendarHistoryMessages,
  type CalendarHistoryOptions,
  type CalendarHistoryShortcutsOptions,
  type CalendarHistoryShortcutsTarget,
  type CalendarKeyboardOptions,
  type CalendarMeta,
  type CalendarPartIds,
  type CalendarPartRefs,
  type CalendarPoint,
  type CalendarPointerOptions,
  type CalendarPublicState,
  type CalendarRect,
  type CalendarRegion,
  type CalendarResourceExpansion,
  type CalendarResourceExpansionCause,
  type CalendarResourceExpansionCommand,
  type CalendarResourceStatus,
  type CalendarRootProps,
  type CalendarRootStore,
  type CalendarRovingFocusOptions,
  type CalendarRovingFocusProps,
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
  type MaybeAccessor,
  type UseNowOptions,
  attachCalendarPointer,
  createCalendarStore,
  eventIdAttributes,
  eventIdOf,
  monitorCalendarDrags,
  observeCalendarRegions,
  resolveViewOptions,
  resourceIdAttributes,
  resourceIdOf,
  startCalendarDrop,
};
```
