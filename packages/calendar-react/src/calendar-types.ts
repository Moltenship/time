import type {
  CalendarAnnouncementMessages,
  CalendarEnvironment,
  CalendarFocus,
  CalendarSelection,
  CalendarEventChangeHandler,
  CalendarEventProposal,
  CalendarNowSource,
  CalendarPolicy,
  CalendarTransactionResult,
  CalendarWeekRules,
  EventAdapter,
  EventId,
  EventSnapshot,
  EventSnapshotIssue,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import type { ComponentPropsWithRef, ComponentType, ReactNode, RefObject } from "react";

import type {
  CalendarActions,
  CalendarPublicState,
  CalendarStateChangeHandler,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStore,
} from "./types";
import type { AnyCalendarView, CalendarActiveView, CalendarViewOptionsMap } from "./views";

export type CalendarSemanticActions<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
  TEvent = unknown,
  TEventId extends EventId = EventId,
> = CalendarActions<TView, TSelection, TFocus, TResourceId> & {
  navigateNext(): void;
  navigatePrevious(): void;
  navigateToday(): void;
  /**
   * Validates a change against the root's policies, shows it while `onEventChange` persists it,
   * and resolves with the outcome. Read-only events and roots without `onEventChange` reject. A
   * plain function, so it can be passed on as a callback.
   */
  readonly proposeEventChange: (
    proposal: CalendarEventProposal<TEventId, TResourceId>,
  ) => Promise<CalendarTransactionResult<TEvent, TEventId, TResourceId>>;
};

export type CalendarDiagnostic<TEvent, TEventId extends EventId> =
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
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
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

export interface CalendarContextValue<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly actions: CalendarSemanticActions<
    TViewDef["name"],
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  readonly meta: CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
}

interface CalendarRootBaseProps<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
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
  readonly onDiagnosticsChange?: (
    diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[],
  ) => void;
  /**
   * Persists an accepted event change. Apply it to `events` synchronously, or return a promise:
   * the change stays visible as pending until it settles and `events` reflect it, and a rejection
   * rolls it back. Without a handler the calendar is read-only.
   */
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onExpandedResourceIdsChange?: CalendarStateChangeHandler<
    readonly TResourceId[],
    "expandedResourceIds"
  >;
  readonly onFocusChange?: CalendarStateChangeHandler<TFocus | null, "focus">;
  readonly onSelectionChange?: CalendarStateChangeHandler<TSelection | null, "selection">;
  readonly onTimeZoneChange?: CalendarStateChangeHandler<string, "timeZone">;
  readonly onViewChange?: CalendarStateChangeHandler<TViewDef["name"], "view">;
  /** Run in order on every proposed change, after the built-in read-only check. */
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  readonly selection?: TSelection | null;
  readonly store?: CalendarStore<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly view?: TViewDef["name"];
  /** Per-view overrides of each registered view's `defaultOptions`. */
  readonly viewOptions?: CalendarViewOptionsMap<TViewDef>;
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
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> = CalendarRootBaseProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> &
  CalendarRootAnchorProps &
  CalendarRootTimeZoneProps &
  CalendarNowSource;

export type CalendarFrameProps = Omit<ComponentPropsWithRef<"section">, "id">;
export type CalendarToolbarProps = ComponentPropsWithRef<"header">;
export type CalendarViewportProps = Omit<ComponentPropsWithRef<"div">, "id">;
export type CalendarTitleProps = Omit<ComponentPropsWithRef<"span">, "id">;

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

export type CalendarAnnouncerProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  /** What each phase says, in the calendar's language; the registry has an English set. */
  readonly messages: CalendarAnnouncementMessages;
};

export interface CalendarActiveViewProps {
  readonly fallback?: ReactNode;
}

export interface CalendarEventRenderValue<
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly event: TEvent;
  readonly normalized: NormalizedCalendarEvent<TEvent, TEventId, TResourceId>;
}

export interface CalendarEventProps<
  TEvent,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly children: (value: CalendarEventRenderValue<TEvent, TEventId, TResourceId>) => ReactNode;
  readonly eventId: TEventId;
  readonly fallback?: ReactNode;
}

export interface CreateCalendarOptions<
  TEvent,
  TViewDef extends AnyCalendarView,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views?: readonly TViewDef[];
}

export interface CalendarFactory<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  readonly ActiveView: ComponentType<CalendarActiveViewProps>;
  readonly Announcer: ComponentType<CalendarAnnouncerProps>;
  readonly Event: ComponentType<CalendarEventProps<TEvent, TEventId, TResourceId>>;
  readonly Frame: ComponentType<CalendarFrameProps>;
  readonly NextTrigger: ComponentType<CalendarTriggerProps>;
  readonly PreviousTrigger: ComponentType<CalendarTriggerProps>;
  readonly Root: ComponentType<
    CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
  >;
  readonly Title: ComponentType<CalendarTitleProps>;
  readonly TodayTrigger: ComponentType<CalendarTriggerProps>;
  readonly Toolbar: ComponentType<CalendarToolbarProps>;
  readonly Viewport: ComponentType<CalendarViewportProps>;
  readonly ViewSwitcher: ComponentType<CalendarViewSwitcherProps<TViewDef["name"]>>;
  readonly views: readonly TViewDef[];
  useCalendar(): CalendarContextValue<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  useCalendarActions(): CalendarSemanticActions<
    TViewDef["name"],
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  useCalendarMeta(): CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>;
  useCalendarSelector<TSelected>(
    selector: CalendarStateSelector<
      CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>,
      TSelected
    >,
    options?: CalendarStateSelectorOptions<TSelected>,
  ): TSelected;
  useCalendarState(): CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  /** The active view's projection, discriminated by `view`; `null` when it is unregistered. */
  useViewProjection(): CalendarActiveView<TViewDef> | null;
  /** The active view's visible dates; `null` when it is unregistered. */
  useVisibleRange(): PlainDateInterval | null;
}
