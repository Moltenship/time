import type {
  CalendarAvailability,
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAnnouncementMessages,
  CalendarEnvironment,
  CalendarEventChangeHandler,
  CalendarFocus,
  CalendarSelection,
  CalendarEventInput,
  CalendarNowSource,
  CalendarPendingChanges,
  CalendarPolicy,
  CalendarProposalDetail,
  CalendarSecondaryTimeZone,
  CalendarTransactionResult,
  CalendarWeekRules,
  EventAdapter,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";
import type {
  CalendarAgentEvent,
  CalendarDiagnostic,
  CalendarPartIds,
  CalendarSemanticActions,
  CalendarVisibleRange,
} from "@moltenship/calendar-primitives";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import type { ComponentPropsWithRef, ComponentType, ReactNode, RefObject } from "react";

import type {
  CalendarPublicState,
  CalendarStateChangeHandler,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarRootStore,
} from "./types";
import type { AnyCalendarView, CalendarActiveView, CalendarViewOptionsMap } from "./views";

export type {
  CalendarAgentEvent,
  CalendarDiagnostic,
  CalendarPartIds,
  CalendarSemanticActions,
  CalendarVisibleRange,
};

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
  /** `Root`'s `label`, the frame's name. */
  readonly label: string | undefined;
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
  /**
   * Lets an AI agent delete events through the calendar's `deleteEvent` action. Off by default,
   * since a delete needs a person: turn it on only with an agent bridge whose `allow` asks one
   * for each `deleteEvent` step. While it's off, `deleteEvent` isn't among the agent's actions.
   */
  readonly allowAgentDelete?: boolean;
  /** The sources views show annotations of, in order. Leave one out to hide its annotations. */
  readonly annotationSources?: readonly CalendarAnnotationSource[];
  /**
   * Time-based information shown beside events, such as listening sessions or sleep. Annotations
   * are read-only and never change how events share lanes. Invalid ones are skipped and reported
   * through `onDiagnosticsChange`.
   */
  readonly annotations?: readonly CalendarAnnotation<unknown, TResourceId>[];
  /**
   * The calendar's working hours. Resources follow them on their own `timeZone`, unless they have
   * their own `availability`. Views shade the time outside them, and `availabilityPolicy` keeps
   * changes inside. Invalid rules and time zones are left out and reported through
   * `onDiagnosticsChange`.
   */
  readonly availability?: CalendarAvailability;
  readonly children?: ReactNode;
  readonly defaultExpandedResourceIds?: readonly TResourceId[];
  readonly defaultFocus?: TFocus | null;
  readonly defaultSelection?: TSelection | null;
  readonly defaultView?: TViewDef["name"];
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  /**
   * Names each visible event for an AI agent, in the calendar's agent items. By default its title
   * and when it happens in ISO 8601 in the calendar's time zone, as
   * `Design review · 2026-03-14T09:00 to 2026-03-14T10:00 (Europe/Berlin)`, which an agent reads
   * back exactly; a localized date it can't.
   */
  readonly formatAgentEventLabel?: (event: CalendarAgentEvent) => string;
  /**
   * Your events: an array, or a `CalendarEventSource` an external store updates. A new array
   * holding the same records counts as unchanged. A source's updates render the calendar without
   * the component that renders `Root`; keep the source stable, since a new one subscribes again.
   */
  readonly events: CalendarEventInput<TEvent>;
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  readonly id?: string;
  /**
   * The calendar's name, as `"Team calendar"`. The frame takes it as its `aria-label`, so screen
   * readers and AI agents find the calendar by a name that stays put while navigating; without
   * it, the frame is labelled by the title, which names the visible dates.
   */
  readonly label?: string;
  readonly locale: Intl.Locale | string;
  readonly onAnchorDateChange?: CalendarStateChangeHandler<Temporal.PlainDate, "anchorDate">;
  readonly onDiagnosticsChange?: (
    diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[],
  ) => void;
  /**
   * Persists an accepted event change. Apply it to `events` synchronously, or return a promise:
   * the change stays visible as pending until it settles and `events` reflect it, and a rejection
   * rolls it back. Without a handler the calendar is read-only. `detail.input` names what proposed
   * the change: `"pointer"`, `"keyboard"`, `"api"`, or `"agent"` for an AI agent's.
   */
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  /**
   * Hears how each proposal ended, from a pointer, the keyboard, an agent or `proposeEventChange`: once per
   * proposal, after it settles, with the result its promise resolves with and the input that made
   * it. Read from the latest render. A committed change may still wait for `events`; see
   * `useCalendarPendingChanges`.
   */
  readonly onEventChangeResult?: (
    result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => void;
  readonly onExpandedResourceIdsChange?: CalendarStateChangeHandler<
    readonly TResourceId[],
    "expandedResourceIds"
  >;
  readonly onFocusChange?: CalendarStateChangeHandler<TFocus | null, "focus">;
  readonly onSelectionChange?: CalendarStateChangeHandler<TSelection | null, "selection">;
  readonly onTimeZoneChange?: CalendarStateChangeHandler<string, "timeZone">;
  readonly onViewChange?: CalendarStateChangeHandler<TViewDef["name"], "view">;
  /**
   * Called after the active view first shows its dates and whenever they, the view, or the time
   * zone change, but not when only events do. Load events for `loadRange`, and a scrolling view's
   * next pages are ready before they scroll into view. Each change is reported once, also when
   * Strict Mode runs effects twice or a hidden `Activity` is revealed, and never on the server, so
   * the first render needs a guess of its own.
   */
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange<TViewDef["name"]>) => void;
  /** Run in order on every proposed change, after the built-in read-only check. */
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  /**
   * Other time zones time grids label their hours in, beside the display time zone: IANA names,
   * or `{ timeZone, label }` to name one in the header. Views get them as
   * `environment.secondaryTimeZones`. Invalid entries are left out and reported through
   * `onDiagnosticsChange`.
   */
  readonly secondaryTimeZones?: readonly (CalendarSecondaryTimeZone | string)[];
  readonly selection?: TSelection | null;
  readonly store?: CalendarRootStore<TViewDef["name"], TSelection, TFocus, TResourceId>;
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
  /**
   * Proposals still validating or saving, and saved changes `events` don't show yet, by change ID
   * in the order they were proposed. Re-renders when they change; with a selector, only when its
   * result does, by `isEqual` (`Object.is` by default).
   */
  useCalendarPendingChanges(): CalendarPendingChanges<TEvent, TEventId, TResourceId>;
  useCalendarPendingChanges<TSelected>(
    selector: CalendarStateSelector<
      CalendarPendingChanges<TEvent, TEventId, TResourceId>,
      TSelected
    >,
    options?: CalendarStateSelectorOptions<TSelected>,
  ): TSelected;
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
