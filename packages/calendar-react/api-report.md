# @moltenship/calendar-react API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-react`

```ts
import "@ui-sdk/react/primitive";
import {
  AvailabilityBand,
  AvailabilityExtent,
  AvailabilitySnapshot,
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAnnouncementContext,
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
  CalendarInputMethod,
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
  EventHistoryOutcome,
  EventHistorySnapshot,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceStatus,
  ResourceVisibilityOptions,
  TimeGridAnnotationGeometry,
  TimeGridAnnotationMark,
  TimeGridColumn,
  VisibleResource,
} from "@moltenship/calendar-core";
import {
  CalendarActions,
  CalendarActiveView as CalendarActiveView$1,
  CalendarAgentEvent,
  CalendarAnnotations,
  CalendarChangeReason,
  CalendarChangeSource,
  CalendarCommandOptions,
  CalendarControlledState,
  CalendarDiagnostic,
  CalendarPartIds,
  CalendarPublicState,
  CalendarRootStore,
  CalendarSemanticActions,
  CalendarStateChangeDetail,
  CalendarStateChangeHandler,
  CalendarStateChangeHandlers,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStateSlice,
  CalendarStore,
  CalendarStoreOptions,
  CalendarViewActions,
  CalendarViewDefinition,
  CalendarViewOptionsMap as CalendarViewOptionsMap$1,
  CalendarVisibleRange,
  createCalendarStore,
} from "@moltenship/calendar-primitives";
import {
  ComponentPropsWithRef,
  ComponentType,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
  RefCallback,
  RefObject,
  SyntheticEvent,
} from "react";
import {
  InstantInterval,
  PlainDateInterval,
  WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";

type AnyCalendarView<TEvent = any> = CalendarView<string, any, any, TEvent>;
type AnyDraft = CalendarDraft<EventId, ResourceId>;
type CalendarAccessibleName = {
  readonly "aria-label": string;
  readonly children?: ReactNode;
} | {
  readonly "aria-label"?: string;
  readonly children: ReactNode;
};
type CalendarActiveView<TViewDef extends AnyCalendarView> = CalendarActiveView$1<TViewDef>;
interface CalendarActiveViewProps {
  readonly fallback?: ReactNode;
}
type CalendarAnnouncerProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  readonly messages: CalendarAnnouncementMessages;
};
type CalendarBusyResources = ReadonlyMap<ResourceId, readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[]>;
interface CalendarContextValue<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly actions: CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  readonly meta: CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
}
interface CalendarDraftBusy {
  readonly events: readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[];
  readonly outsideHours: boolean;
}
interface CalendarEventProps<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly children: (value: CalendarEventRenderValue<TEvent, TEventId, TResourceId>) => ReactNode;
  readonly eventId: TEventId;
  readonly fallback?: ReactNode;
}
interface CalendarEventRenderValue<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly event: TEvent;
  readonly normalized: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
}
interface CalendarFactory<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly ActiveView: ComponentType<CalendarActiveViewProps>;
  readonly Announcer: ComponentType<CalendarAnnouncerProps>;
  readonly Event: ComponentType<CalendarEventProps<TEvent, TEventId, TResourceId>>;
  readonly Frame: ComponentType<CalendarFrameProps>;
  readonly NextTrigger: ComponentType<CalendarTriggerProps>;
  readonly PreviousTrigger: ComponentType<CalendarTriggerProps>;
  readonly Root: ComponentType<CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>>;
  readonly Title: ComponentType<CalendarTitleProps>;
  readonly TodayTrigger: ComponentType<CalendarTriggerProps>;
  readonly Toolbar: ComponentType<CalendarToolbarProps>;
  readonly Viewport: ComponentType<CalendarViewportProps>;
  readonly ViewSwitcher: ComponentType<CalendarViewSwitcherProps<TViewDef["name"]>>;
  readonly views: readonly TViewDef[];
  useCalendar(): CalendarContextValue<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
  useCalendarActions(): CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  useCalendarMeta(): CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  useCalendarPendingChanges(): CalendarPendingChanges<TEvent, TEventId, TResourceId>;
  useCalendarPendingChanges<TSelected>(selector: CalendarStateSelector<CalendarPendingChanges<TEvent, TEventId, TResourceId>, TSelected>, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
  useCalendarSelector<TSelected>(selector: CalendarStateSelector<CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>, TSelected>, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
  useCalendarState(): CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  useViewProjection(): CalendarActiveView<TViewDef> | null;
  useVisibleRange(): PlainDateInterval | null;
}
type CalendarFrameProps = Omit<ComponentPropsWithRef<"section">, "id">;
interface CalendarHistory<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> extends EventHistorySnapshot<TEvent, TEventId, TResourceId> {
  readonly canRedo: boolean;
  readonly canUndo: boolean;
  readonly redo: (options?: CalendarHistoryCommandOptions) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
  readonly undo: (options?: CalendarHistoryCommandOptions) => Promise<EventHistoryOutcome<TEvent, TEventId, TResourceId>>;
}
type CalendarHistoryAnnouncementBuilder<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> = (outcome: EventHistoryOutcome<TEvent, TEventId, TResourceId>, context: CalendarHistoryAnnouncementContext<TEvent, TEventId, TResourceId>) => string | null;
interface CalendarHistoryAnnouncementContext<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> extends CalendarAnnouncementContext {
  readonly event: NormalizedCalendarEvent<TEvent, TEventId, TResourceId> | undefined;
}
interface CalendarHistoryCommandOptions {
  readonly input?: CalendarInputMethod;
}
interface CalendarHistoryMessages<TEvent = unknown, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly redo: CalendarHistoryAnnouncementBuilder<TEvent, TEventId, TResourceId>;
  readonly undo: CalendarHistoryAnnouncementBuilder<TEvent, TEventId, TResourceId>;
}
interface CalendarHistoryOptions<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly messages?: CalendarHistoryMessages<TEvent, TEventId, TResourceId>;
}
interface CalendarHistoryShortcutsOptions {
  readonly disabled?: boolean;
  readonly redo?: readonly string[];
  readonly scope: RefObject<HTMLElement | null>;
  readonly undo?: readonly string[];
}
interface CalendarHistoryShortcutsTarget {
  readonly redo: (options?: CalendarHistoryCommandOptions) => unknown;
  readonly undo: (options?: CalendarHistoryCommandOptions) => unknown;
}
interface CalendarKeyboardHandlers {
  readonly onBlur: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
}
interface CalendarKeyboardOptions {
  readonly axis?: "block" | "inline";
  readonly createDuration?: Temporal.DurationLike;
  readonly snap?: WallTimeSnapOptions;
}
interface CalendarMeta<TEvent, TResource, TViewDef extends AnyCalendarView = AnyCalendarView, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> {
  readonly activeView: TViewDef | undefined;
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  readonly environment: CalendarEnvironment;
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly ids: CalendarPartIds;
  readonly instanceId: string;
  readonly label: string | undefined;
  readonly refs: CalendarPartRefs;
  readonly resources: readonly TResource[];
  readonly views: readonly TViewDef[];
}
interface CalendarPartRefs {
  readonly frame: RefObject<HTMLElement | null>;
  readonly title: RefObject<HTMLSpanElement | null>;
  readonly toolbar: RefObject<HTMLElement | null>;
  readonly viewport: RefObject<HTMLDivElement | null>;
}
interface CalendarResourceExpansion {
  readonly expanded: boolean;
  readonly collapse: (cause?: CalendarResourceExpansionCause) => void;
  readonly expand: (cause?: CalendarResourceExpansionCause) => void;
  readonly toggle: (cause?: CalendarResourceExpansionCause) => void;
}
type CalendarResourceExpansionCause = CalendarCommandOptions | SyntheticEvent;
type CalendarResourceStatus = ResourceStatus<NormalizedCalendarEvent<unknown, EventId, ResourceId>>;
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
  readonly children?: ReactNode;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultView?: TViewDef["name"];
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  readonly formatAgentEventLabel?: (event: CalendarAgentEvent) => string;
  readonly events: CalendarEventInput<TEvent>;
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  readonly id?: string;
  readonly label?: string;
  readonly locale: Intl.Locale | string;
  readonly onAnchorDateChange?: CalendarStateChangeHandler<Temporal.PlainDate, "anchorDate">;
  readonly onDiagnosticsChange?: (diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onEventChangeResult?: (result: CalendarTransactionResult<TEvent, TEventId, TResourceId>, detail: CalendarProposalDetail) => void;
  readonly onExpandedResourceIdsChange?: CalendarStateChangeHandler<readonly TResourceId[], "expandedResourceIds">;
  readonly onFocusChange?: CalendarStateChangeHandler<TFocus | null, "focus">;
  readonly onSelectionChange?: CalendarStateChangeHandler<TSelection | null, "selection">;
  readonly onTimeZoneChange?: CalendarStateChangeHandler<string, "timeZone">;
  readonly onViewChange?: CalendarStateChangeHandler<TViewDef["name"], "view">;
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange<TViewDef["name"]>) => void;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  readonly secondaryTimeZones?: readonly (CalendarSecondaryTimeZone | string)[];
  readonly selection?: TSelection | null;
  readonly store?: CalendarRootStore<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly view?: TViewDef["name"];
  readonly viewOptions?: CalendarViewOptionsMap<TViewDef>;
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
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly ref: RefCallback<HTMLElement>;
  readonly tabIndex: 0 | -1;
}
type CalendarTitleProps = Omit<ComponentPropsWithRef<"span">, "id">;
type CalendarToolbarProps = ComponentPropsWithRef<"header">;
type CalendarTriggerProps = Omit<ComponentPropsWithRef<"button">, "children"> & CalendarAccessibleName;
interface CalendarView<TName extends string = string, TProjection = unknown, TOptions = unknown, TEvent = unknown> extends CalendarViewDefinition<TName, TProjection, TOptions, TEvent> {
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
}
type CalendarViewInput<TName extends string, TProjection, TOptions, TEvent> = CalendarViewInputBase<TName, TProjection, TOptions, TEvent> & (undefined extends TOptions ? {
  readonly defaultOptions?: TOptions;
} : {
  readonly defaultOptions: TOptions;
});
interface CalendarViewInputBase<TName extends string, TProjection, TOptions, TEvent> {
  readonly name: TName;
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}
type CalendarViewOptionsMap<TViewDef extends AnyCalendarView> = CalendarViewOptionsMap$1<TViewDef>;
interface CalendarViewRendererProps<TProjection, TOptions> {
  readonly actions: CalendarViewActions;
  readonly environment: CalendarEnvironmentBase;
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  readonly isReadOnly?: boolean;
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly projection: TProjection;
  readonly range: PlainDateInterval;
}
type CalendarViewSwitcherProps<TView extends string = string> = Omit<ComponentPropsWithRef<"select">, "children" | "defaultValue" | "value"> & {
  readonly getViewLabel: (view: TView) => string;
};
type CalendarViewportProps = Omit<ComponentPropsWithRef<"div">, "id">;
interface CreateCalendarOptions<TEvent, TViewDef extends AnyCalendarView, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views?: readonly TViewDef[];
}
interface UseNowOptions {
  readonly intervalMs?: number;
}
export declare function createCalendar<TEvent, TResource = unknown, TSelection = CalendarSelection, TFocus = CalendarFocus>(): <TViewDef extends AnyCalendarView<TEvent> = never, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>) => CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
export declare function defineCalendarView<const TName extends string, TProjection, TOptions = undefined, TEvent = unknown>(view: CalendarViewInput<TName, TProjection, TOptions, TEvent>): CalendarView<TName, TProjection, TOptions, TEvent>;
export declare function useAnchorDateRequests(listener: (date: Temporal.PlainDate, range: PlainDateInterval | null) => void): void;
export declare function useBusyResources(range: InstantInterval | CalendarEventInterval | null, { exclude, resourceIds }?: {
  readonly exclude?: EventId | null;
  readonly resourceIds?: readonly ResourceId[];
}): CalendarBusyResources;
export declare function useCalendarAnnotations(): CalendarAnnotations;
export declare function useCalendarAnnouncer(): CalendarAnnouncer;
export declare function useCalendarAvailability(): AvailabilitySnapshot;
export declare function useCalendarDraft(): AnyDraft | null;
export declare function useCalendarDraftReporter(): (draft: AnyDraft | null) => void;
export declare function useCalendarFocus<TSelected>(selector: (focus: CalendarFocus | null) => TSelected, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
export declare function useCalendarHistory<TEvent, TEventId extends EventId, TResourceId extends ResourceId>(history: EventHistory<TEvent, TEventId, TResourceId>, options?: CalendarHistoryOptions<NoInfer<TEvent>, NoInfer<TEventId>, NoInfer<TResourceId>>): CalendarHistory<TEvent, TEventId, TResourceId>;
export declare function useCalendarHistoryShortcuts(history: CalendarHistoryShortcutsTarget, options: CalendarHistoryShortcutsOptions): void;
export declare function useCalendarInteraction(): CalendarKeyboardSession | null;
export declare function useCalendarInteraction<TSelected>(selector: (session: CalendarKeyboardSession | null, check: CalendarInteractionCheck) => TSelected, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
export declare function useCalendarKeyboard(options?: CalendarKeyboardOptions): CalendarKeyboardHandlers;
export declare function useCalendarSelection<TSelected>(selector: (selection: CalendarSelection | null) => TSelected, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
export declare function useClosedDates(range: PlainDateInterval, resourceId?: ResourceId | null): ReadonlyMap<string, ClosedDate>;
export declare function useDraftBusy(resourceId: ResourceId | null): CalendarDraftBusy | null;
export declare function useNow({ intervalMs }?: UseNowOptions): Temporal.Instant | null;
export declare function useResourceExpansion(resourceId: ResourceId): CalendarResourceExpansion;
export declare function useResourceStatus(resourceId?: ResourceId | null, at?: Temporal.Instant): CalendarResourceStatus | null;
export declare function useRovingFocus(target: CalendarFocus, { days }?: CalendarRovingFocusOptions): CalendarRovingFocusProps;
export declare function useTimeGridAnnotations(columns: readonly TimeGridColumn[], { layout, maxLanes, minGap, minHeight }?: TimeGridAnnotationGeometry): readonly (readonly TimeGridAnnotationMark[])[];
export declare function useTimeGridAvailability(columns: readonly TimeGridColumn[], resourceId?: ResourceId | null): readonly (readonly AvailabilityBand[])[];
export declare function useTimelineAvailability(columns: readonly TimeGridColumn[], resourceId?: ResourceId | null): readonly AvailabilityExtent[];
export declare function useVisibleResources(options?: ResourceVisibilityOptions): readonly VisibleResource[];

export {
  type AnyCalendarView,
  type CalendarActions,
  type CalendarActiveView,
  type CalendarActiveViewProps,
  type CalendarAgentEvent,
  type CalendarAnnotations,
  type CalendarAnnouncerProps,
  type CalendarBusyResources,
  type CalendarChangeReason,
  type CalendarChangeSource,
  type CalendarCommandOptions,
  type CalendarContextValue,
  type CalendarControlledState,
  type CalendarDiagnostic,
  type CalendarDraftBusy,
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
  type CalendarKeyboardHandlers,
  type CalendarKeyboardOptions,
  type CalendarMeta,
  type CalendarPartIds,
  type CalendarPartRefs,
  type CalendarPublicState,
  type CalendarResourceExpansion,
  type CalendarResourceExpansionCause,
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
  type UseNowOptions,
  createCalendarStore,
};
```
