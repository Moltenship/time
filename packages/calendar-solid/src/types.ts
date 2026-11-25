import type {
  CalendarAnnouncementMessages,
  CalendarAnnotation,
  CalendarAnnotationSource,
  CalendarAvailability,
  CalendarEnvironment,
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
  CalendarWeekRules,
  EventAdapter,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  NormalizedCalendarEvent,
  ResourceId,
} from "@moltenship/calendar-core";
import type {
  CalendarActiveView,
  CalendarAgentEvent,
  CalendarDiagnostic,
  CalendarPartIds,
  CalendarPublicState,
  CalendarSemanticActions,
  CalendarStateChangeHandler,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarRootStore,
  CalendarViewOptionsMap,
  CalendarVisibleRange,
} from "@moltenship/calendar-primitives";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import type { JSX } from "@solidjs/web";
import type { Accessor, Component } from "solid-js";

import type { AnyCalendarView } from "./views";

/** The elements of a root's structural parts, once they are rendered. */
export interface CalendarPartRefs {
  readonly frame: Accessor<HTMLElement | undefined>;
  readonly title: Accessor<HTMLSpanElement | undefined>;
  readonly toolbar: Accessor<HTMLElement | undefined>;
  readonly viewport: Accessor<HTMLDivElement | undefined>;
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
  /** The events views show, pending changes included. */
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly ids: CalendarPartIds;
  readonly instanceId: string;
  /** `Root`'s `label`, the frame's name. */
  readonly label: string | undefined;
  readonly refs: CalendarPartRefs;
  readonly resources: readonly TResource[];
  readonly views: readonly TViewDef[];
}

/**
 * `useCalendar()`'s value. `meta` and `state` are getters, as Solid props are: read them in a
 * tracking scope (JSX, a memo, an effect's compute) and don't destructure them.
 */
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
  /** The sources views show annotations of, in order. */
  readonly annotationSources?: readonly CalendarAnnotationSource[];
  /** Time-based information shown beside events; invalid ones go to `onDiagnosticsChange`. */
  readonly annotations?: readonly CalendarAnnotation<unknown, TResourceId>[];
  /** The calendar's working hours; invalid rules go to `onDiagnosticsChange`. */
  readonly availability?: CalendarAvailability;
  readonly children?: JSX.Element;
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
   * Your events: an array, or a `CalendarEventSource` an external store updates. A source's
   * updates re-derive the calendar without the component that renders `Root`; the server and
   * hydration read its `getServerSnapshot`.
   */
  readonly events: CalendarEventInput<TEvent>;
  readonly expandedResourceIds?: readonly TResourceId[];
  readonly focus?: TFocus | null;
  /** The instance's id, which the parts' ids start with; one is generated without it. */
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
  /** Hears how each proposal ended, once per proposal, after it settles. */
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
   * zone change, but not when only events do; once per change, and never on the server.
   */
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange<TViewDef["name"]>) => void;
  /** Run in order on every proposed change, after the built-in read-only check. */
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  /** Other time zones time grids label their hours in, beside the display time zone. */
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

/**
 * `Root`'s props. Each of the six slices is controlled by its prop (`view`, `anchorDate`, …) or
 * left to the calendar with its `default…` prop, and reports changes through `on…Change`. Pass
 * them as JSX attributes or getters: Solid reads them where they are used, so a signal passed as
 * `view={view()}` stays live.
 */
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

type ElementProps<Tag extends keyof JSX.IntrinsicElements> = JSX.IntrinsicElements[Tag];

export type CalendarFrameProps = Omit<ElementProps<"section">, "id">;
export type CalendarToolbarProps = ElementProps<"header">;
export type CalendarViewportProps = Omit<ElementProps<"div">, "id">;
export type CalendarTitleProps = Omit<ElementProps<"span">, "id">;

type CalendarAccessibleName =
  | { readonly "aria-label": string; readonly children?: JSX.Element }
  | { readonly "aria-label"?: string; readonly children: JSX.Element };

export type CalendarTriggerProps = Omit<ElementProps<"button">, "children"> &
  CalendarAccessibleName;

export type CalendarViewSwitcherProps<TView extends string = string> = Omit<
  ElementProps<"select">,
  "children" | "value"
> & {
  readonly getViewLabel: (view: TView) => string;
};

export type CalendarAnnouncerProps = Omit<ElementProps<"div">, "children"> & {
  /** What each phase says, in the calendar's language; read each time something is said. */
  readonly messages: CalendarAnnouncementMessages;
};

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
  /**
   * Renders the event as the calendar shows it, pending changes included. It gets an accessor and
   * stays rendered while the event changes, as `Show` does; read it where it is used.
   */
  readonly children: (
    value: Accessor<CalendarEventRenderValue<TEvent, TEventId, TResourceId>>,
  ) => JSX.Element;
  readonly eventId: TEventId;
  /** What shows while the calendar has no such event. */
  readonly fallback?: JSX.Element;
}

export interface CalendarActiveViewProps {
  /** What shows while the active view is unregistered. */
  readonly fallback?: JSX.Element;
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

/**
 * A typed calendar's parts and hooks. The hooks return accessors, as Solid's own primitives do:
 * call them in a tracking scope to follow the calendar, or once to read it now.
 */
export interface CalendarFactory<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView = AnyCalendarView,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
> {
  /** Renders the active view's `Renderer` with its projection. */
  readonly ActiveView: Component<CalendarActiveViewProps>;
  /**
   * A polite live region that speaks keyboard and pointer moves, resizes, and creates through
   * `messages`. Render one inside `Root`.
   */
  readonly Announcer: Component<CalendarAnnouncerProps>;
  /** Renders one event by its ID as the calendar shows it, or `fallback` without it. */
  readonly Event: Component<CalendarEventProps<TEvent, TEventId, TResourceId>>;
  /** A `section`: the calendar's frame, named by `label` or the title, which agents find. */
  readonly Frame: Component<CalendarFrameProps>;
  readonly NextTrigger: Component<CalendarTriggerProps>;
  readonly PreviousTrigger: Component<CalendarTriggerProps>;
  readonly Root: Component<
    CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
  >;
  /** A `span` with the active view's title, unless it has children of its own. */
  readonly Title: Component<CalendarTitleProps>;
  readonly TodayTrigger: Component<CalendarTriggerProps>;
  readonly Toolbar: Component<CalendarToolbarProps>;
  readonly Viewport: Component<CalendarViewportProps>;
  /** A `select` of the registered views. */
  readonly ViewSwitcher: Component<CalendarViewSwitcherProps<TViewDef["name"]>>;
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
  /** The calendar's commands; the same object for the root's lifetime. */
  useCalendarActions(): CalendarSemanticActions<
    TViewDef["name"],
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  useCalendarMeta(): Accessor<CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>>;
  /**
   * Proposals still validating or saving, and saved changes `events` don't show yet, by change ID
   * in the order they were proposed. With a selector, whatever reads it re-runs only when its
   * result changes, by `isEqual` (`Object.is` by default).
   */
  useCalendarPendingChanges(): Accessor<CalendarPendingChanges<TEvent, TEventId, TResourceId>>;
  useCalendarPendingChanges<TSelected>(
    selector: CalendarStateSelector<
      CalendarPendingChanges<TEvent, TEventId, TResourceId>,
      TSelected
    >,
    options?: CalendarStateSelectorOptions<TSelected>,
  ): Accessor<TSelected>;
  /** A selection of the state; whatever reads it re-runs only when the selection changes. */
  useCalendarSelector<TSelected>(
    selector: CalendarStateSelector<
      CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>,
      TSelected
    >,
    options?: CalendarStateSelectorOptions<TSelected>,
  ): Accessor<TSelected>;
  useCalendarState(): Accessor<
    CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>
  >;
  /** The active view's projection, discriminated by `view`; `null` when it is unregistered. */
  useViewProjection(): Accessor<CalendarActiveView<TViewDef> | null>;
  /** The active view's visible dates; `null` when it is unregistered. */
  useVisibleRange(): Accessor<PlainDateInterval | null>;
}
