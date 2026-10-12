# @moltenship/calendar-react API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-react`

```ts
import {
  AnnotationSnapshot,
  AnnotationSnapshotIssue,
  AvailabilityBand,
  AvailabilityExtent,
  AvailabilityIssue,
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
  CalendarEventInterval,
  CalendarEventProposal,
  CalendarFocus,
  CalendarInteractionCheck,
  CalendarKeyboardSession,
  CalendarNowSource,
  CalendarPolicy,
  CalendarPolicyResult,
  CalendarSecondaryTimeZone,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  CalendarWeekRules,
  ClosedDate,
  EventAdapter,
  EventId,
  EventSnapshot,
  EventSnapshotIssue,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceStatus,
  ResourceVisibilityOptions,
  SecondaryTimeZoneIssue,
  TimeGridAnnotationGeometry,
  TimeGridAnnotationMark,
  TimeGridColumn,
  VisibleResource,
} from "@moltenship/calendar-core";
import {
  ComponentPropsWithRef,
  ComponentType,
  FocusEvent,
  KeyboardEvent,
  ReactNode,
  RefCallback,
  RefObject,
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
type CalendarActions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = { readonly [TSlice in CalendarStateSlice as `set${Capitalize<TSlice>}`]: (next: CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice]) => void; };
type CalendarActiveView<TViewDef extends AnyCalendarView> = TViewDef extends unknown ? {
  readonly definition: TViewDef;
  readonly environment: CalendarEnvironmentBase;
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  readonly instantRange: InstantInterval;
  readonly loadInstantRange: InstantInterval;
  readonly loadRange: PlainDateInterval;
  readonly options: TViewDef["defaultOptions"];
  readonly projection: ReturnType<TViewDef["strategy"]["project"]>;
  readonly range: PlainDateInterval;
  readonly view: TViewDef["name"];
} : never;
interface CalendarActiveViewProps {
  readonly fallback?: ReactNode;
}
interface CalendarAnnotations {
  readonly snapshot: AnnotationSnapshot;
  readonly sources: readonly CalendarAnnotationSource[];
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
type CalendarControlledState<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = Partial<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;
type CalendarDiagnostic<TEvent, TEventId extends EventId> = {
  readonly code: "unregistered-active-view";
  readonly severity: "error";
  readonly viewName: string;
} | {
  readonly code: "invalid-event";
  readonly issue: EventSnapshotIssue<TEvent, TEventId>;
  readonly severity: "error";
} | {
  readonly code: "invalid-annotation";
  readonly issue: AnnotationSnapshotIssue;
  readonly severity: "error";
} | {
  readonly code: "invalid-availability";
  readonly issue: AvailabilityIssue;
  readonly severity: "error";
} | {
  readonly code: "invalid-secondary-time-zone";
  readonly issue: SecondaryTimeZoneIssue;
  readonly severity: "error";
};
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
  useCalendarSelector<TSelected>(selector: CalendarStateSelector<CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>, TSelected>, options?: CalendarStateSelectorOptions<TSelected>): TSelected;
  useCalendarState(): CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  useViewProjection(): CalendarActiveView<TViewDef> | null;
  useVisibleRange(): PlainDateInterval | null;
}
type CalendarFrameProps = Omit<ComponentPropsWithRef<"section">, "id">;
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
  readonly refs: CalendarPartRefs;
  readonly resources: readonly TResource[];
  readonly views: readonly TViewDef[];
}
interface CalendarPartIds {
  readonly frame: string;
  readonly title: string;
  readonly viewport: string;
}
interface CalendarPartRefs {
  readonly frame: RefObject<HTMLElement | null>;
  readonly title: RefObject<HTMLSpanElement | null>;
  readonly toolbar: RefObject<HTMLElement | null>;
  readonly viewport: RefObject<HTMLDivElement | null>;
}
interface CalendarPublicState<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly anchorDate: Temporal.PlainDate;
  readonly expandedResourceIds: readonly TResourceId[];
  readonly focus: TFocus | null;
  readonly selection: TSelection | null;
  readonly timeZone: string;
  readonly view: TView;
}
interface CalendarResourceExpansion {
  readonly expanded: boolean;
  readonly collapse: () => void;
  readonly expand: () => void;
  readonly toggle: () => void;
}
type CalendarResourceStatus = ResourceStatus<NormalizedCalendarEvent<unknown, EventId, ResourceId>>;
type CalendarRootAnchorProps = {
  readonly anchorDate: Temporal.PlainDate;
  readonly defaultAnchorDate?: Temporal.PlainDate;
} | {
  readonly anchorDate?: undefined;
  readonly defaultAnchorDate: Temporal.PlainDate;
};
interface CalendarRootBaseProps<TEvent, TResource, TViewDef extends AnyCalendarView, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> {
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
  readonly events: readonly TEvent[];
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  readonly id?: string;
  readonly locale: Intl.Locale | string;
  readonly onAnchorDateChange?: CalendarStateChangeHandler<Temporal.PlainDate, "anchorDate">;
  readonly onDiagnosticsChange?: (diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
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
  readonly store?: CalendarStore<TViewDef["name"], TSelection, TFocus, TResourceId>;
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
type CalendarSemanticActions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId, TEvent = unknown, TEventId extends EventId = EventId> = CalendarActions<TView, TSelection, TFocus, TResourceId> & {
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  readonly checkEventChange: (proposal: CalendarEventProposal<TEventId, TResourceId>) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  readonly proposeEventChange: (proposal: CalendarEventProposal<TEventId, TResourceId>) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
};
interface CalendarStateChangeDetail<TValue, TSlice extends CalendarStateSlice = CalendarStateSlice> {
  readonly controlled: boolean;
  readonly previous: TValue;
  readonly slice: TSlice;
}
type CalendarStateChangeHandler<TValue, TSlice extends CalendarStateSlice> = (next: TValue, detail: CalendarStateChangeDetail<TValue, TSlice>) => void;
type CalendarStateChangeHandlers<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = { readonly [TSlice in CalendarStateSlice as `on${Capitalize<TSlice>}Change`]?: CalendarStateChangeHandler<CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice], TSlice>; };
type CalendarStateSelector<TState, TSelected> = (state: TState) => TSelected;
interface CalendarStateSelectorOptions<TSelected> {
  readonly isEqual?: (previous: TSelected, next: TSelected) => boolean;
}
type CalendarStateSlice = keyof CalendarPublicState;
interface CalendarStore<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly getSnapshot: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly subscribe: (listener: () => void) => () => void;
}
interface CalendarStoreOptions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly defaultAnchorDate: Temporal.PlainDate;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultTimeZone: string;
  readonly defaultView: TView;
}
type CalendarTitleProps = Omit<ComponentPropsWithRef<"span">, "id">;
type CalendarToolbarProps = ComponentPropsWithRef<"header">;
type CalendarTriggerProps = Omit<ComponentPropsWithRef<"button">, "children"> & CalendarAccessibleName;
interface CalendarView<TName extends string = string, TProjection = unknown, TOptions = unknown, TEvent = unknown> {
  readonly defaultOptions: TOptions;
  readonly name: TName;
  readonly Renderer: ComponentType<CalendarViewRendererProps<TProjection, TOptions>>;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}
interface CalendarViewActions {
  readonly checkEventChange: (proposal: CalendarEventProposal<EventId, ResourceId>) => CalendarPolicyResult<unknown, EventId, ResourceId> | null;
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  readonly proposeEventChange: (proposal: CalendarEventProposal<EventId, ResourceId>) => Promise<CalendarTransactionResult<unknown, EventId, ResourceId>>;
  setAnchorDate(anchorDate: Temporal.PlainDate): void;
  setFocus(focus: CalendarFocus | null): void;
  setSelection(selection: CalendarSelection | null): void;
  setView(view: string): void;
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
type CalendarViewOptionsMap<TViewDef extends AnyCalendarView> = { readonly [TName in TViewDef["name"]]?: Partial<Extract<TViewDef, {
  readonly name: TName;
}>["defaultOptions"]>; };
interface CalendarViewRendererProps<TProjection, TOptions> {
  readonly actions: CalendarViewActions;
  readonly environment: CalendarEnvironmentBase;
  readonly events: EventSnapshot<unknown, EventId, ResourceId>;
  readonly loadRange?: PlainDateInterval;
  readonly options: TOptions;
  readonly projection: TProjection;
  readonly range: PlainDateInterval;
}
type CalendarViewSwitcherProps<TView extends string = string> = Omit<ComponentPropsWithRef<"select">, "children" | "defaultValue" | "value"> & {
  readonly getViewLabel: (view: TView) => string;
};
type CalendarViewportProps = Omit<ComponentPropsWithRef<"div">, "id">;
interface CalendarVisibleRange<TView extends string = string> {
  readonly instantRange: InstantInterval;
  readonly loadInstantRange: InstantInterval;
  readonly loadRange: PlainDateInterval;
  readonly range: PlainDateInterval;
  readonly view: TView;
}
interface CreateCalendarOptions<TEvent, TViewDef extends AnyCalendarView, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views?: readonly TViewDef[];
}
interface UseNowOptions {
  readonly intervalMs?: number;
}
export declare function createCalendar<TEvent, TResource = unknown, TSelection = CalendarSelection, TFocus = CalendarFocus>(): <TViewDef extends AnyCalendarView<TEvent> = never, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(options: CreateCalendarOptions<TEvent, TViewDef, TEventId, TResourceId>) => CalendarFactory<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
export declare function createCalendarStore<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId>(options: CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>): CalendarStore<TView, TSelection, TFocus, TResourceId>;
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
  type CalendarAnnotations,
  type CalendarAnnouncerProps,
  type CalendarBusyResources,
  type CalendarContextValue,
  type CalendarControlledState,
  type CalendarDiagnostic,
  type CalendarDraftBusy,
  type CalendarEventProps,
  type CalendarEventRenderValue,
  type CalendarFactory,
  type CalendarFrameProps,
  type CalendarKeyboardHandlers,
  type CalendarKeyboardOptions,
  type CalendarMeta,
  type CalendarPartIds,
  type CalendarPartRefs,
  type CalendarPublicState,
  type CalendarResourceExpansion,
  type CalendarResourceStatus,
  type CalendarRootProps,
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
};
```
