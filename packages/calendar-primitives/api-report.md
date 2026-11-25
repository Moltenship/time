# @moltenship/calendar-primitives API report

Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.

## `@moltenship/calendar-primitives`

```ts
import {
  AnnotationSnapshot,
  AnnotationSnapshotIssue,
  AvailabilityIssue,
  AvailabilitySnapshot,
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAnnouncementContext,
  CalendarAnnouncementMessages,
  CalendarAnnouncer,
  CalendarAvailability,
  CalendarCellFocus,
  CalendarChangeCause,
  CalendarDraft,
  CalendarEnvironment,
  CalendarEnvironmentBase,
  CalendarEventChangeHandler,
  CalendarEventInterval,
  CalendarEventPlacement,
  CalendarEventProposal,
  CalendarFocus,
  CalendarInputMethod,
  CalendarInteractionCheck,
  CalendarKeyboardSession,
  CalendarNowSource,
  CalendarPendingChanges,
  CalendarPendingPlacements,
  CalendarPolicy,
  CalendarPolicyResult,
  CalendarProposalDetail,
  CalendarProposalOutcome,
  CalendarSecondaryTimeZone,
  CalendarSelection,
  CalendarTransactionResult,
  CalendarViewStrategy,
  CalendarWeekRules,
  EventAdapter,
  EventHistory,
  EventHistoryOutcome,
  EventHistorySnapshot,
  EventId,
  EventSnapshot,
  EventSnapshotIssue,
  EventTransactions,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
  ResourceStatus,
  ResourceTree,
  SecondaryTimeZoneIssue,
} from "@moltenship/calendar-core";
import {
  CalendarClock,
  InstantInterval,
  PlainDateInterval,
  WallTimeSnapOptions,
} from "@moltenship/calendar-temporal";
import {
  PrimitiveInstance,
  PropSpec,
  SlotDefinition,
} from "@ui-sdk/core";

interface AnnouncerChannel {
  readonly announcer: CalendarAnnouncer;
  readonly mount: (getMessages: () => CalendarAnnouncementMessages, speak: (text: string) => void) => () => void;
  readonly say: (build: (context: CalendarAnnouncementContext, messages: CalendarAnnouncementMessages) => string | null) => void;
}
interface AnnouncerLiveText extends CalendarStateSource<string> {
  readonly speak: (text: string) => void;
}
type AnyCalendarState = CalendarPublicState<string, unknown, unknown>;
type AnyCalendarViewDefinition<TEvent = any> = CalendarViewDefinition<string, any, any, TEvent>;
type AnyDraft = CalendarDraft<EventId, ResourceId>;
type AnyEvent = NormalizedCalendarEvent<unknown, EventId, ResourceId>;
type AnyEvents = EventSnapshot<unknown, EventId, ResourceId>;
type AnyPendingChanges = CalendarPendingChanges<unknown, EventId, ResourceId>;
type AnyRuntime = CalendarRuntime<any, any, any, any, any, any, any>;
type BusyRange = InstantInterval | CalendarEventInterval;
type CalendarActions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = { readonly [TSlice in CalendarStateSlice as `set${Capitalize<TSlice>}`]: (next: CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice], options?: CalendarCommandOptions) => void; };
type CalendarActiveView<TViewDef extends AnyCalendarViewDefinition> = TViewDef extends unknown ? {
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
interface CalendarAgentApi<TView extends string = string> {
  readonly createEvent?: (input: CalendarAgentCreateInput) => CalendarAgentChange;
  readonly deleteEvent?: (input: CalendarAgentEventRef) => CalendarAgentChange;
  describeCalendar(): CalendarAgentDescription;
  getChange(input: {
    readonly changeId: string;
  }): CalendarAgentChange;
  goToDate(input: {
    readonly date: string;
  }): void;
  listEvents(input?: CalendarAgentRange): readonly CalendarAgentEvent[];
  readonly moveEvent?: (input: CalendarAgentMoveInput) => CalendarAgentChange;
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  readonly resizeEvent?: (input: CalendarAgentResizeInput) => CalendarAgentChange;
  selectEvent(input: {
    readonly eventId: EventId | null;
  }): void;
  setTimeZone(input: {
    readonly timeZone: string;
  }): void;
  setView(input: {
    readonly view: TView;
  }): void;
  readonly updateEvent?: (input: CalendarAgentUpdateInput) => CalendarAgentChange;
}
interface CalendarAgentChange {
  readonly cause: CalendarChangeCause;
  readonly changeId: string;
  readonly eventId: EventId | null;
  readonly proposed: CalendarAgentPlacement | null;
  readonly reason?: string;
  readonly status: "rejected" | "saved" | "saving" | "validating";
}
interface CalendarAgentCreateInput extends CalendarAgentEventFields {
  readonly end: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start: string;
}
interface CalendarAgentDescription {
  readonly actions: Readonly<Record<string, string>>;
  readonly anchorDate: string;
  readonly canDelete: boolean;
  readonly conventions: string;
  readonly locale: string;
  readonly now: string;
  readonly pendingChanges: readonly CalendarAgentChange[];
  readonly readOnly: boolean;
  readonly resources: readonly {
    readonly id: ResourceId;
    readonly parentId: ResourceId | null;
    readonly title: string;
  }[];
  readonly selectedEventId: EventId | null;
  readonly timeZone: string;
  readonly today: string;
  readonly view: string;
  readonly views: readonly string[];
  readonly visibleRange: {
    readonly end: string;
    readonly start: string;
  } | null;
}
interface CalendarAgentEvent {
  readonly end: string;
  readonly id: EventId;
  readonly kind: "all-day" | "floating" | "timed";
  readonly pending?: true;
  readonly readOnly?: true;
  readonly resourceIds: readonly ResourceId[];
  readonly start: string;
  readonly title: string;
}
interface CalendarAgentEventFields {
  readonly fields?: Readonly<Record<string, unknown>>;
  readonly title?: string;
}
interface CalendarAgentEventRef {
  readonly eventId: EventId;
}
interface CalendarAgentItem {
  readonly label: string;
  readonly value: string;
}
interface CalendarAgentMoveInput extends CalendarAgentEventRef {
  readonly end?: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start: string;
}
type CalendarAgentPlacement = Pick<CalendarAgentEvent, "end" | "kind" | "resourceIds" | "start">;
interface CalendarAgentRange {
  readonly end?: string;
  readonly start?: string;
}
interface CalendarAgentResizeInput extends CalendarAgentEventRef {
  readonly end?: string;
  readonly start?: string;
}
interface CalendarAgentUpdateInput extends CalendarAgentEventRef, CalendarAgentEventFields {
  readonly end?: string;
  readonly resourceIds?: readonly ResourceId[];
  readonly start?: string;
}
interface CalendarAnnotations {
  readonly snapshot: AnnotationSnapshot;
  readonly sources: readonly CalendarAnnotationSource[];
}
type CalendarBusyResources = ReadonlyMap<ResourceId, readonly NormalizedCalendarEvent<unknown, EventId, ResourceId>[]>;
interface CalendarBusyResourcesQuery {
  readonly exclude?: EventId | null;
  readonly resourceIds?: readonly ResourceId[];
  readonly timeZone: string;
}
type CalendarChangeReason = "focus-change" | "imperative" | "input-change" | "keyboard-navigation" | "next-press" | "previous-press" | "resource-toggle" | "today-press";
type CalendarChangeSource = "agent" | "keyboard" | "mouse" | "pen" | "programmatic" | "touch" | "virtual";
interface CalendarClockTicker {
  readonly getSnapshot: () => Temporal.Instant;
  readonly subscribe: (onChange: () => void) => () => void;
}
interface CalendarCommandOptions {
  readonly event?: Event;
  readonly reason?: CalendarChangeReason;
  readonly source?: CalendarChangeSource;
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
interface CalendarHistoryBindingOptions<TEvent, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId> extends CalendarHistoryOptions<TEvent, TEventId, TResourceId> {
  readonly events: EventSnapshot<TEvent, TEventId, TResourceId>;
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
interface CalendarHistoryShortcutsConfig {
  readonly history: CalendarHistoryShortcutsTarget;
  readonly redo?: readonly string[];
  readonly scope: HTMLElement | null;
  readonly undo?: readonly string[];
}
interface CalendarHistoryShortcutsTarget {
  readonly redo: (options?: CalendarHistoryCommandOptions) => unknown;
  readonly undo: (options?: CalendarHistoryCommandOptions) => unknown;
}
interface CalendarInteractionRuntime {
  readonly actions: CalendarSemanticActions<any, any, any, any, any, any>;
  readonly announcements: AnnouncerChannel;
  readonly changes: CalendarStateSource<AnyPendingChanges>;
  readonly draft: CalendarStateSource<CalendarDraft<EventId, ResourceId> | null>;
  readonly isReadOnly: boolean;
  readonly keyboard: KeyboardSessionStore;
  readonly pointerDraft: DraftStore;
  readonly rangeOf: (anchor: Temporal.PlainDate) => PlainDateInterval | null;
  readonly read: () => AnyCalendarState;
  readonly requests: (listener: CalendarRequestListener) => () => void;
  readonly source: CalendarStateSource<AnyCalendarState>;
}
interface CalendarKeyEventWrapper {
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
}
interface CalendarKeyboardController {
  readonly focusOut: (event: FocusEvent, region: HTMLElement) => void;
  readonly keyDown: (event: KeyboardEvent, wrapper?: CalendarKeyEventWrapper) => void;
}
interface CalendarKeyboardOptions {
  readonly axis?: "block" | "inline";
  readonly createDuration?: Temporal.DurationLike;
  readonly snap?: WallTimeSnapOptions;
}
interface CalendarPartIds {
  readonly frame: string;
  readonly title: string;
  readonly viewport: string;
}
type CalendarPrimitive<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = ((initialOptions: CalendarPrimitiveOptions<TView, TSelection, TFocus, TResourceId> & {
  readonly id: string;
}) => CalendarPrimitiveInstance<TView, TSelection, TFocus, TResourceId>) & {
  readonly options: Record<string, PropSpec> | undefined;
  readonly slots: CalendarSlots<TView, TSelection, TFocus, TResourceId>;
};
interface CalendarPrimitiveApi<TView extends string = string> extends CalendarAgentApi<TView> {
  showNext(options?: CalendarCommandOptions): void;
  showPrevious(options?: CalendarCommandOptions): void;
  showToday(options?: CalendarCommandOptions): void;
  selectView(view: string, options?: CalendarCommandOptions): boolean;
  viewNames(): readonly TView[];
  visibleEvents(): readonly CalendarAgentItem[];
}
interface CalendarPrimitiveConfig<TViewDef extends AnyCalendarViewDefinition> {
  readonly views: readonly TViewDef[];
}
interface CalendarPrimitiveInstance<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> extends PrimitiveInstance {
  readonly api: CalendarPrimitiveApi<TView>;
  readonly get: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly types: {
    readonly api: CalendarPrimitiveApi<TView>;
    readonly options: CalendarPrimitiveOptions<TView, TSelection, TFocus, TResourceId>;
    readonly slots: CalendarSlots<TView, TSelection, TFocus, TResourceId>;
    readonly state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  };
}
type CalendarPrimitiveOptions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = CalendarPublicState<TView, TSelection, TFocus, TResourceId> & {
  readonly allowAgentDelete?: boolean;
  readonly formatAgentEventLabel?: (event: CalendarAgentEvent) => string;
  readonly runtime: AnyRuntime;
};
interface CalendarPublicState<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly anchorDate: Temporal.PlainDate;
  readonly expandedResourceIds: readonly TResourceId[];
  readonly focus: TFocus | null;
  readonly selection: TSelection | null;
  readonly timeZone: string;
  readonly view: TView;
}
type CalendarRequestListener = (slice: CalendarStateSlice, value: unknown) => void;
interface CalendarResourceExpansionCommands {
  readonly collapse: (cause?: unknown) => void;
  readonly expand: (cause?: unknown) => void;
  readonly toggle: (cause?: unknown) => void;
}
type CalendarResourceStatus = ResourceStatus<NormalizedCalendarEvent<unknown, EventId, ResourceId>>;
type CalendarRootStore<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = CalendarStore<TView, TSelection, TFocus, TResourceId> | ([TResourceId] extends [never] ? CalendarStore<TView, TSelection, TFocus> : never);
interface CalendarRootStoreBinding<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly attach: () => () => void;
  readonly commit: (binding: CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>) => void;
  readonly read: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly subscribeRequests: (listener: CalendarRequestListener) => () => void;
}
type CalendarRovingEntry = (command: "end" | "home") => CalendarFocus | null;
interface CalendarRuntime<TEvent, TResource, TViewDef extends AnyCalendarViewDefinition, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly announcements: AnnouncerChannel;
  readonly commit: (model: CalendarRuntimeModel<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>, inputs: CalendarRuntimeInputs<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>) => void;
  readonly committed: () => CalendarRuntimeModel<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> | undefined;
  readonly connect: (options: CalendarRuntimeConnectOptions<TViewDef["name"], TSelection, TFocus, TResourceId>) => CalendarRuntimeConnection<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly derive: (inputs: CalendarRuntimeInputs<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>) => CalendarRuntimeModel<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
  readonly keyboard: KeyboardSessionStore;
  readonly overlay: CalendarStateSource<CalendarRuntimeOverlay<TEventId, TResourceId>>;
  readonly pendingChanges: CalendarStateSource<CalendarPendingChanges<TEvent, TEventId, TResourceId>>;
  readonly pointerDraft: DraftStore;
  readonly proposeNow: (proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>, detail?: CalendarProposalDetail) => CalendarProposalOutcome<TEvent, TEventId, TResourceId>;
  readonly latest: () => {
    readonly range: PlainDateInterval | null;
    readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  } | undefined;
  readonly reconcile: (eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>) => void;
  readonly reportDiagnostics: (diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void;
  readonly reportVisibleRange: (visibleRange: CalendarVisibleRange<TViewDef["name"]> | null) => void;
  readonly transactions: EventTransactions<TEvent, TEventId, TResourceId>;
  readonly views: readonly TViewDef[];
  readonly viewsByName: ReadonlyMap<string, TViewDef>;
}
interface CalendarRuntimeConfig<TEvent, TViewDef extends AnyCalendarViewDefinition, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views: readonly TViewDef[];
}
interface CalendarRuntimeConnectOptions<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  readonly defaults: () => CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>;
  readonly store?: CalendarRootStore<TView, TSelection, TFocus, TResourceId>;
}
interface CalendarRuntimeConnection<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly binding: CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>;
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  readonly source: CalendarStateSource<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;
  readonly store: CalendarStore<TView, TSelection, TFocus, TResourceId>;
}
interface CalendarRuntimeInputs<TEvent, TResource, TViewDef extends AnyCalendarViewDefinition, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly allowAgentDelete?: boolean;
  readonly annotationSources?: readonly CalendarAnnotationSource[];
  readonly annotations?: readonly CalendarAnnotation<unknown, TResourceId>[];
  readonly availability?: CalendarAvailability;
  readonly clock?: CalendarClock;
  readonly connection: CalendarRuntimeConnection<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  readonly events: readonly TEvent[];
  readonly handlers: CalendarStateChangeHandlers<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly instant: Temporal.Instant | null;
  readonly locale: Intl.Locale | string;
  readonly now?: Temporal.Instant;
  readonly onDiagnosticsChange?: (diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onEventChangeResult?: (result: CalendarTransactionResult<TEvent, TEventId, TResourceId>, detail: CalendarProposalDetail) => void;
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange<TViewDef["name"]>) => void;
  readonly overlay: CalendarRuntimeOverlay<TEventId, TResourceId>;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  readonly secondaryTimeZones?: readonly (CalendarSecondaryTimeZone | string)[];
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly viewOptions?: CalendarViewOptionsMap<TViewDef>;
  readonly weekRules: CalendarWeekRules;
}
interface CalendarRuntimeModel<TEvent, TResource, TViewDef extends AnyCalendarViewDefinition, TSelection, TFocus, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly actions: CalendarSemanticActions<TViewDef["name"], TSelection, TFocus, TResourceId, TEvent, TEventId>;
  readonly activeDefinition: TViewDef | undefined;
  readonly activeView: CalendarActiveView<TViewDef> | null;
  readonly annotations: CalendarAnnotations;
  readonly availability: AvailabilitySnapshot;
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  readonly environment: CalendarEnvironment;
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly interaction: CalendarInteractionRuntime;
  readonly isReadOnly: boolean;
  readonly resourceTree: ResourceTree;
  readonly resources: readonly TResource[];
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly source: CalendarStateSource<CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>>;
  readonly today: Temporal.PlainDate | null;
  readonly viewEnvironment: CalendarEnvironmentBase;
  readonly visibleEvents: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly visibleRange: CalendarVisibleRange<TViewDef["name"]> | null;
}
interface CalendarRuntimeOverlay<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly pending: CalendarPendingPlacements<TEventId, TResourceId>;
  readonly preview: CalendarPendingPlacements<TEventId, TResourceId>;
}
type CalendarSemanticActions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId, TEvent = unknown, TEventId extends EventId = EventId> = CalendarActions<TView, TSelection, TFocus, TResourceId> & {
  navigateNext(options?: CalendarCommandOptions): void;
  navigatePrevious(options?: CalendarCommandOptions): void;
  navigateToday(options?: CalendarCommandOptions): void;
  readonly checkEventChange: (proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>, detail?: CalendarProposalDetail) => CalendarPolicyResult<TEvent, TEventId, TResourceId> | null;
  readonly proposeEventChange: (proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>, detail?: CalendarProposalDetail) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
};
type CalendarSlotName = "next-trigger" | "previous-trigger" | "root" | "title" | "today-trigger" | "toolbar" | "view-switcher" | "viewport";
type CalendarSlots<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> = Record<CalendarSlotName, SlotDefinition<CalendarPublicState<TView, TSelection, TFocus, TResourceId>, CalendarPrimitiveApi<TView>, object>>;
interface CalendarStateChangeDetail<TValue, TSlice extends CalendarStateSlice = CalendarStateSlice> {
  readonly cancel: () => void;
  readonly canceled: boolean;
  readonly controlled: boolean;
  readonly event?: Event;
  readonly previous: TValue;
  readonly reason: CalendarChangeReason;
  readonly slice: TSlice;
  readonly source: CalendarChangeSource;
}
type CalendarStateChangeHandler<TValue, TSlice extends CalendarStateSlice> = (next: TValue, detail: CalendarStateChangeDetail<TValue, TSlice>) => void;
type CalendarStateChangeHandlers<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> = { readonly [TSlice in CalendarStateSlice as `on${Capitalize<TSlice>}Change`]?: CalendarStateChangeHandler<CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice], TSlice>; };
type CalendarStateSelector<TState, TSelected> = (state: TState) => TSelected;
interface CalendarStateSelectorOptions<TSelected> {
  readonly isEqual?: (previous: TSelected, next: TSelected) => boolean;
}
type CalendarStateSlice = keyof CalendarPublicState;
interface CalendarStateSource<TState = AnyCalendarState> {
  readonly getServerSnapshot?: () => TState;
  readonly getSnapshot: () => TState;
  readonly subscribe: (listener: () => void) => () => void;
}
interface CalendarStore<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  readonly getSnapshot: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  readonly subscribe: (listener: () => void) => () => void;
}
interface CalendarStoreBinding<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  readonly handlers: CalendarStateChangeHandlers<TView, TSelection, TFocus, TResourceId>;
}
interface CalendarStoreInternals<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly bind: (binding: CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>) => CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>;
}
interface CalendarStoreOptions<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId> {
  readonly defaultAnchorDate: Temporal.PlainDate;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultTimeZone: string;
  readonly defaultView: TView;
}
interface CalendarViewActions {
  readonly checkEventChange: (proposal: CalendarEventProposal<EventId, ResourceId, unknown>) => CalendarPolicyResult<unknown, EventId, ResourceId> | null;
  navigateNext(options?: CalendarCommandOptions): void;
  navigatePrevious(options?: CalendarCommandOptions): void;
  navigateToday(options?: CalendarCommandOptions): void;
  readonly proposeEventChange: (proposal: CalendarEventProposal<EventId, ResourceId, unknown>, detail?: CalendarProposalDetail) => Promise<CalendarTransactionResult<unknown, EventId, ResourceId>>;
  setAnchorDate(anchorDate: Temporal.PlainDate, options?: CalendarCommandOptions): void;
  setFocus(focus: CalendarFocus | null, options?: CalendarCommandOptions): void;
  setSelection(selection: CalendarSelection | null, options?: CalendarCommandOptions): void;
  setView(view: string, options?: CalendarCommandOptions): void;
}
interface CalendarViewDefinition<TName extends string = string, TProjection = unknown, TOptions = unknown, TEvent = unknown> {
  readonly defaultOptions: TOptions;
  readonly name: TName;
  readonly strategy: CalendarViewStrategy<TProjection, TOptions, TEvent>;
}
type CalendarViewOptionsMap<TViewDef extends AnyCalendarViewDefinition> = { readonly [TName in TViewDef["name"]]?: Partial<Extract<TViewDef, {
  readonly name: TName;
}>["defaultOptions"]>; };
interface CalendarViewRuntime {
  readonly getView: () => CalendarActiveView<AnyCalendarViewDefinition> | null;
  readonly roving: RovingFocusStore;
}
interface CalendarVisibleRange<TView extends string = string> {
  readonly instantRange: InstantInterval;
  readonly loadInstantRange: InstantInterval;
  readonly loadRange: PlainDateInterval;
  readonly range: PlainDateInterval;
  readonly view: TView;
}
interface DraftStore extends CalendarStateSource<AnyDraft | null> {
  readonly set: (draft: AnyDraft | null) => void;
}
interface KeyboardGrab {
  readonly cell: CalendarCellFocus;
  readonly check: CalendarInteractionCheck;
  readonly event: NormalizedCalendarEvent<unknown, EventId, ResourceId> | null;
  readonly origin: CalendarFocus;
  readonly session: CalendarKeyboardSession;
}
interface KeyboardSessionStore {
  readonly get: () => KeyboardGrab | null;
  readonly getPreview: () => CalendarPendingPlacements<EventId, ResourceId>;
  readonly grabs: CalendarStateSource<KeyboardGrab | null>;
  readonly set: (grab: KeyboardGrab | null) => void;
  readonly subscribe: (listener: () => void) => () => void;
}
interface RovingFocusStore {
  readonly enterFromEnd: () => void;
  readonly focusTabStop: (when: "now" | "after-update") => void;
  readonly focusAt: (node: Node) => CalendarFocus | null;
  readonly isTabStop: (target: CalendarFocus, days: number) => boolean;
  readonly register: (element: HTMLElement, target: CalendarFocus, days: number) => () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly update: (focus: CalendarFocus | null, getEntry: CalendarRovingEntry) => void;
}
export declare const TODAY_SAMPLE_INTERVAL_MS = 6e4;
export declare function agentEventLabel(event: CalendarAgentEvent, timeZone: string): string;
export declare function attachCalendarHistoryShortcuts({ keyboard, pointerDraft }: Pick<CalendarInteractionRuntime, "keyboard" | "pointerDraft">, getConfig: () => CalendarHistoryShortcutsConfig): () => void;
export declare function bindCalendarHistory<TEvent, TEventId extends EventId, TResourceId extends ResourceId>({ actions, announcements, changes }: Pick<CalendarInteractionRuntime, "actions" | "announcements" | "changes">, history: EventHistory<TEvent, TEventId, TResourceId>, getOptions: () => CalendarHistoryBindingOptions<TEvent, TEventId, TResourceId>): CalendarStateSource<CalendarHistory<TEvent, TEventId, TResourceId>>;
export declare const calendarAgentActions: readonly (keyof CalendarAgentApi)[];
export declare function calendarFocusKey(target: CalendarFocus): string;
export declare const calendarStateSlices: readonly CalendarStateSlice[];
export declare function calendarViewEntry(view: CalendarActiveView<AnyCalendarViewDefinition> | null): CalendarRovingEntry;
export declare function clockOf(source: CalendarNowSource | undefined): CalendarClock;
export declare function createAnnouncerChannel(getEnvironment: () => Pick<CalendarEnvironmentBase, "locale" | "timeZone">, getResources: () => ResourceTree): AnnouncerChannel;
export declare function createAnnouncerLiveText(): AnnouncerLiveText;
export declare function createBusyResourcesQuery(): (events: AnyEvents, range: BusyRange | null, query: CalendarBusyResourcesQuery) => CalendarBusyResources;
export declare function createCalendarKeyboard({ actions, announcements, isReadOnly, keyboard, read }: CalendarInteractionRuntime, { getView, roving }: CalendarViewRuntime, getOptions: () => CalendarKeyboardOptions, getResources: () => ResourceTree | null): CalendarKeyboardController;
export declare function createCalendarPartIds(instanceId: string): CalendarPartIds;
export declare function createCalendarPrimitive<TViewDef extends AnyCalendarViewDefinition, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId>(config: CalendarPrimitiveConfig<TViewDef>): CalendarPrimitive<TViewDef["name"], TSelection, TFocus, TResourceId>;
export declare function createCalendarRuntime<TEvent, TResource = unknown, TViewDef extends AnyCalendarViewDefinition = AnyCalendarViewDefinition, TSelection = CalendarSelection, TFocus = CalendarFocus, TEventId extends EventId = EventId, TResourceId extends ResourceId = ResourceId>(config: CalendarRuntimeConfig<TEvent, TViewDef, TEventId, TResourceId>): CalendarRuntime<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
export declare function createCalendarStore<TView extends string = string, TSelection = CalendarSelection, TFocus = CalendarFocus, TResourceId extends ResourceId = ResourceId>(options: CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>): CalendarStore<TView, TSelection, TFocus, TResourceId>;
export declare function createCalendarViewRuntime(getView: () => CalendarActiveView<AnyCalendarViewDefinition> | null): CalendarViewRuntime;
export declare function createClockTicker(clock: CalendarClock, intervalMs: number): CalendarClockTicker;
export declare function createDraftBusyQuery(): (draft: AnyDraft | null, events: AnyEvents, availability: AvailabilitySnapshot, resourceId: ResourceId | null) => CalendarDraftBusy | null;
export declare function createDraftStore(): DraftStore;
export declare function createKeyboardSessionStore(): KeyboardSessionStore;
export declare function createMemoCell<T>(): (deps: readonly unknown[], compute: () => T) => T;
export declare function createResourceExpansionCommands({ actions, read }: Pick<CalendarInteractionRuntime, "actions" | "read">, resourceId: ResourceId): CalendarResourceExpansionCommands;
export declare function createResourceStatusClock(source: CalendarNowSource | undefined, compute: (at: Temporal.Instant) => CalendarResourceStatus): CalendarStateSource<CalendarResourceStatus | null>;
export declare function createStableCell<T>(isEqual: (previous: T, next: T) => boolean): (next: T) => T;
export declare function describeAgentEvent(event: AnyEvent, environment: Pick<CalendarEnvironmentBase, "timeZone">): CalendarAgentEvent;
export declare function describeAgentPlacement(placement: CalendarEventPlacement, timeZone: string): CalendarAgentPlacement;
export declare function eventLabel(event: AnyEvent, environment: CalendarEnvironmentBase): string;
export declare function eventsInRange(events: AnyEvents, range: PlainDateInterval, environment: CalendarEnvironmentBase): readonly AnyEvent[];
export declare function findEvent(events: AnyEvents, id: unknown): AnyEvent;
export declare function focusRovingTarget({ actions, read }: Pick<CalendarInteractionRuntime, "actions" | "read">, target: CalendarFocus, days: number, event: Event): void;
export declare function getCalendarStoreInternals<TView extends string, TSelection, TFocus, TResourceId extends ResourceId>(store: CalendarStore<TView, TSelection, TFocus, TResourceId>): CalendarStoreInternals<TView, TSelection, TFocus, TResourceId>;
export declare function mergeControlledState<TState extends CalendarPublicState<string, unknown, unknown>>(state: TState, controlled: Partial<TState> | undefined): TState;
export declare function parseInstant(value: unknown, name: string, environment: Pick<CalendarEnvironmentBase, "disambiguation" | "timeZone">): Temporal.Instant;
export declare function parsePlainDate(value: unknown, name: string): Temporal.PlainDate;
export declare function parsePlainDateTime(value: unknown, name: string): Temporal.PlainDateTime;
export declare function parseTimeZone(value: unknown): string;
export declare function readAgentInput<TKey extends string>(action: string, signature: string, input: unknown, keys: Readonly<Record<TKey, boolean>>, extra?: readonly unknown[], nullable?: readonly TKey[]): Readonly<Partial<Record<TKey, unknown>>>;
export declare function reportCallbackError(error: unknown): void;
export declare function resolveCalendarStoreDefaults<TView extends string, TSelection, TFocus, TResourceId extends ResourceId>(props: {
  readonly anchorDate?: Temporal.PlainDate;
  readonly defaultAnchorDate?: Temporal.PlainDate;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultTimeZone?: string;
  readonly defaultView?: TView;
  readonly timeZone?: string;
  readonly view?: TView;
}, views: readonly {
  readonly name: string;
}[]): CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>;
export declare function resolveViewOptions(view: AnyCalendarViewDefinition, overrides: object | undefined): unknown;
export declare function sameAvailability(left: CalendarAvailability | undefined, right: CalendarAvailability | undefined): boolean;
export declare function sameElements<T>(left: readonly T[], right: readonly T[]): boolean;
export declare function sameInstant(left: Temporal.Instant | undefined, right: Temporal.Instant | undefined): boolean;
export declare function samePlainDate(left: Temporal.PlainDate | null | undefined, right: Temporal.PlainDate | null | undefined): boolean;
export declare function sameRange(left: PlainDateInterval | undefined, right: PlainDateInterval | undefined): boolean;
export declare function sameSecondaryTimeZones(left: readonly (CalendarSecondaryTimeZone | string)[], right: readonly (CalendarSecondaryTimeZone | string)[]): boolean;
export declare function sameSliceValue(slice: CalendarStateSlice, previous: unknown, next: unknown): boolean;
export declare function sameWeekRules(left: CalendarWeekRules, right: CalendarWeekRules): boolean;
export declare function shallowEqual<T>(left: T, right: T): boolean;
export declare function subscribeAnchorDateRequests({ rangeOf, requests }: Pick<CalendarInteractionRuntime, "rangeOf" | "requests">, listener: (date: Temporal.PlainDate, range: PlainDateInterval | null) => void): () => void;
export declare const systemClock: CalendarClock;
export declare function visibleEventsOf(events: AnyEvents, view: CalendarActiveView<AnyCalendarViewDefinition> | null): readonly AnyEvent[];

export {
  type AnnouncerChannel,
  type AnnouncerLiveText,
  type AnyCalendarState,
  type AnyCalendarViewDefinition,
  type AnyPendingChanges,
  type BusyRange,
  type CalendarActions,
  type CalendarActiveView,
  type CalendarAgentApi,
  type CalendarAgentChange,
  type CalendarAgentCreateInput,
  type CalendarAgentDescription,
  type CalendarAgentEvent,
  type CalendarAgentEventFields,
  type CalendarAgentEventRef,
  type CalendarAgentItem,
  type CalendarAgentMoveInput,
  type CalendarAgentPlacement,
  type CalendarAgentRange,
  type CalendarAgentResizeInput,
  type CalendarAgentUpdateInput,
  type CalendarAnnotations,
  type CalendarBusyResources,
  type CalendarBusyResourcesQuery,
  type CalendarChangeReason,
  type CalendarChangeSource,
  type CalendarClockTicker,
  type CalendarCommandOptions,
  type CalendarControlledState,
  type CalendarDiagnostic,
  type CalendarDraftBusy,
  type CalendarHistory,
  type CalendarHistoryAnnouncementBuilder,
  type CalendarHistoryAnnouncementContext,
  type CalendarHistoryBindingOptions,
  type CalendarHistoryCommandOptions,
  type CalendarHistoryMessages,
  type CalendarHistoryOptions,
  type CalendarHistoryShortcutsConfig,
  type CalendarHistoryShortcutsTarget,
  type CalendarInteractionRuntime,
  type CalendarKeyEventWrapper,
  type CalendarKeyboardController,
  type CalendarKeyboardOptions,
  type CalendarPartIds,
  type CalendarPrimitive,
  type CalendarPrimitiveApi,
  type CalendarPrimitiveConfig,
  type CalendarPrimitiveInstance,
  type CalendarPrimitiveOptions,
  type CalendarPublicState,
  type CalendarRequestListener,
  type CalendarResourceExpansionCommands,
  type CalendarResourceStatus,
  type CalendarRootStore,
  type CalendarRootStoreBinding,
  type CalendarRovingEntry,
  type CalendarRuntime,
  type CalendarRuntimeConfig,
  type CalendarRuntimeConnectOptions,
  type CalendarRuntimeConnection,
  type CalendarRuntimeInputs,
  type CalendarRuntimeModel,
  type CalendarRuntimeOverlay,
  type CalendarSemanticActions,
  type CalendarSlotName,
  type CalendarStateChangeDetail,
  type CalendarStateChangeHandler,
  type CalendarStateChangeHandlers,
  type CalendarStateSelector,
  type CalendarStateSelectorOptions,
  type CalendarStateSlice,
  type CalendarStateSource,
  type CalendarStore,
  type CalendarStoreBinding,
  type CalendarStoreInternals,
  type CalendarStoreOptions,
  type CalendarViewActions,
  type CalendarViewDefinition,
  type CalendarViewOptionsMap,
  type CalendarViewRuntime,
  type CalendarVisibleRange,
  type DraftStore,
  type KeyboardGrab,
  type KeyboardSessionStore,
  type RovingFocusStore,
};
```
