import type {
  CalendarEnvironment,
  CalendarNowSource,
  CalendarWeekRules,
  EventAdapter,
  EventId,
  EventSnapshot,
  EventSnapshotIssue,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";
import type { ComponentPropsWithRef, ComponentType, ReactNode, RefObject } from "react";

import type { CalendarCapability, CalendarCapabilitySet } from "./capabilities.js";
import type { InferEventId, InferResourceId } from "./generics.js";
import type {
  CalendarActions,
  CalendarStateChangeHandler,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStore,
  CalendarPublicState,
} from "./types.js";
import type {
  CalendarDefinedView,
  CalendarViewDefinitionInput,
  CalendarViewRegistration,
  CalendarViewRegistry,
} from "./views.js";

export type CalendarSemanticActions<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
> = CalendarActions<TView, TSelection, TFocus, TResourceId> & {
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
};

export type CalendarDiagnostic<TEvent, TEventId extends EventId> =
  | {
      readonly code: "duplicate-view-name";
      readonly severity: "warning";
      readonly viewName: string;
    }
  | {
      readonly code: "unregistered-active-view";
      readonly severity: "error";
      readonly viewName: string;
    }
  | {
      readonly code: "invalid-event";
      readonly issue: EventSnapshotIssue<TEvent, TEventId>;
      readonly severity: "error";
    };

export interface CalendarPartIds {
  readonly frame: string;
  readonly title: string;
  readonly viewport: string;
}

export interface CalendarPartRefs {
  readonly frame: RefObject<HTMLElement | null>;
  readonly title: RefObject<HTMLSpanElement | null>;
  readonly toolbar: RefObject<HTMLElement | null>;
  readonly viewport: RefObject<HTMLDivElement | null>;
}

export interface CalendarMeta<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly activeView:
    | CalendarViewRegistration<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
    | undefined;
  readonly capabilities: CalendarCapabilitySet;
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  readonly environment: CalendarEnvironment;
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly events: readonly TEvent[];
  readonly ids: CalendarPartIds;
  readonly instanceId: string;
  readonly refs: CalendarPartRefs;
  readonly resources: readonly TResource[];
  readonly viewRegistry: CalendarViewRegistry<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
}

export interface CalendarContextValue<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly actions: CalendarSemanticActions<TView, TSelection, TFocus, TResourceId>;
  readonly meta: CalendarMeta<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>;
  readonly state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
}

interface CalendarRootBaseProps<
  TEvent,
  TResource,
  TView extends string,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly children?: ReactNode;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultView?: TView;
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  readonly eventAdapter?: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly events: readonly TEvent[];
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  readonly id?: string;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly locale: Intl.Locale | string;
  readonly onAnchorDateChange?: CalendarStateChangeHandler<Temporal.PlainDate, "anchorDate">;
  readonly onDiagnosticsChange?: (
    diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[],
  ) => void;
  readonly onExpandedResourceIdsChange?: CalendarStateChangeHandler<
    readonly TResourceId[],
    "expandedResourceIds"
  >;
  readonly onFocusChange?: CalendarStateChangeHandler<TFocus | null, "focus">;
  readonly onSelectionChange?: CalendarStateChangeHandler<TSelection | null, "selection">;
  readonly onTimeZoneChange?: CalendarStateChangeHandler<string, "timeZone">;
  readonly onViewChange?: CalendarStateChangeHandler<TView, "view">;
  readonly resources?: readonly TResource[];
  readonly selection?: TSelection | null;
  readonly store?: CalendarStore<TView, TSelection, TFocus, TResourceId>;
  readonly view?: TView;
  readonly views?: readonly CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >[];
  readonly weekRules: CalendarWeekRules;
}

type CalendarRootAnchorProps =
  | {
      readonly anchorDate: Temporal.PlainDate;
      readonly defaultAnchorDate?: Temporal.PlainDate;
    }
  | {
      readonly anchorDate?: undefined;
      readonly defaultAnchorDate: Temporal.PlainDate;
    };

type CalendarRootTimeZoneProps =
  | { readonly defaultTimeZone?: string; readonly timeZone: string }
  | { readonly defaultTimeZone: string; readonly timeZone?: undefined };

export type CalendarRootProps<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> = CalendarRootBaseProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId> &
  CalendarRootAnchorProps &
  CalendarRootTimeZoneProps &
  CalendarNowSource;

export type CalendarFrameProps = ComponentPropsWithRef<"section">;
export type CalendarToolbarProps = ComponentPropsWithRef<"header">;
export type CalendarViewportProps = ComponentPropsWithRef<"div">;
export type CalendarTitleProps = ComponentPropsWithRef<"span">;

type CalendarAccessibleName =
  | { readonly "aria-label": string; readonly children?: ReactNode }
  | { readonly "aria-label"?: string; readonly children: ReactNode };

export type CalendarTriggerProps = Omit<ComponentPropsWithRef<"button">, "children"> &
  CalendarAccessibleName;

export type CalendarViewSwitcherProps<TView extends string = string> = Omit<
  ComponentPropsWithRef<"select">,
  "children" | "defaultValue" | "value"
> & {
  readonly getViewLabel: (view: TView) => string;
};

export interface CalendarActiveViewProps {
  readonly fallback?: ReactNode;
}

export interface CalendarCustomViewProps<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly view: CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
}

export interface CalendarEventRenderValue<
  TEvent,
  TResource,
  TView extends string,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> extends CalendarContextValue<
  TEvent,
  TResource,
  TView,
  TSelection,
  TFocus,
  TEventId,
  TResourceId
> {
  readonly event: TEvent;
  readonly normalized: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
}

export interface CalendarEventProps<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly children: (
    value: CalendarEventRenderValue<
      TEvent,
      TResource,
      TView,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ) => ReactNode;
  readonly eventId: TEventId;
  readonly fallback?: ReactNode;
}

export interface CreateCalendarOptions<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly capabilities?: readonly CalendarCapability[];
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views?: readonly CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >[];
}

export interface CalendarFactory<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
> {
  readonly ActiveView: ComponentType<CalendarActiveViewProps>;
  readonly CustomView: ComponentType<
    CalendarCustomViewProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
  >;
  readonly Event: ComponentType<
    CalendarEventProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
  >;
  readonly Frame: ComponentType<CalendarFrameProps>;
  readonly NextTrigger: ComponentType<CalendarTriggerProps>;
  readonly PreviousTrigger: ComponentType<CalendarTriggerProps>;
  readonly Root: ComponentType<
    CalendarRootProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
  >;
  readonly Title: ComponentType<CalendarTitleProps>;
  readonly TodayTrigger: ComponentType<CalendarTriggerProps>;
  readonly Toolbar: ComponentType<CalendarToolbarProps>;
  readonly Viewport: ComponentType<CalendarViewportProps>;
  readonly ViewSwitcher: ComponentType<CalendarViewSwitcherProps<TView>>;
  readonly defineView: <
    const TName extends TView,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
  >(
    definition: CalendarViewDefinitionInput<
      TEvent,
      TResource,
      TName,
      TOptions,
      TProjectionInput,
      TProjection,
      TSpatialNavigationInput,
      TSpatialNavigationResult,
      TInteractionGeometryInput,
      TInteractionGeometry,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ) => CalendarDefinedView<
    TEvent,
    TResource,
    TName,
    TOptions,
    TProjectionInput,
    TProjection,
    TSpatialNavigationInput,
    TSpatialNavigationResult,
    TInteractionGeometryInput,
    TInteractionGeometry,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  readonly viewRegistry: CalendarViewRegistry<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  useCalendar(): CalendarContextValue<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  useCalendarActions(): CalendarSemanticActions<TView, TSelection, TFocus, TResourceId>;
  useCalendarMeta(): CalendarMeta<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  useCalendarSelector<TSelected>(
    selector: CalendarStateSelector<
      CalendarPublicState<TView, TSelection, TFocus, TResourceId>,
      TSelected
    >,
    options?: CalendarStateSelectorOptions<TSelected>,
  ): TSelected;
  useCalendarState(): CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
}
