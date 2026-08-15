"use client";

import {
  createEventSnapshotCache,
  type CalendarEnvironment,
  type EventId,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import type { Ref, RefObject } from "react";

import { createCalendarCapabilitySet } from "./capabilities.js";
import type {
  CalendarContextValue,
  CalendarDiagnostic,
  CalendarEventProps,
  CalendarFactory,
  CalendarMeta,
  CalendarRootProps,
  CalendarSemanticActions,
  CreateCalendarOptions,
} from "./calendar-types.js";
import type { InferEventId, InferResourceId } from "./generics.js";
import {
  useCalendarStore,
  useCalendarStoreBinding,
  useCalendarStoreSelector,
} from "./react-store.js";
import type { CalendarPublicState, CalendarStateSource } from "./types.js";
import {
  bindCalendarView,
  createCalendarViewRegistry,
  type CalendarDefinedView,
  type CalendarViewDefinitionInput,
  type CalendarViewRegistration,
} from "./views.js";

function safePartId(reactId: string): string {
  return `calendar-${reactId.replaceAll(":", "")}`;
}

function useComposedRef<T>(internalRef: RefObject<T | null>, externalRef: Ref<T> | undefined) {
  return useCallback(
    (node: T | null) => {
      internalRef.current = node;
      if (typeof externalRef === "function") externalRef(node);
      else if (externalRef !== null && externalRef !== undefined) externalRef.current = node;
    },
    [externalRef, internalRef],
  );
}

export function createCalendar<
  TEvent,
  TResource,
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TEventId extends EventId = InferEventId<TEvent>,
  TResourceId extends ResourceId = InferResourceId<TResource>,
>(
  options: CreateCalendarOptions<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >,
): CalendarFactory<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId> {
  type ContextValue = CalendarContextValue<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  type State = CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  type Actions = CalendarSemanticActions<TView, TSelection, TFocus, TResourceId>;
  type Meta = CalendarMeta<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>;
  type Source = CalendarStateSource<TView, TSelection, TFocus, TResourceId>;
  type View = CalendarViewRegistration<
    TEvent,
    TResource,
    TView,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;

  const factoryViews = Object.freeze([...(options.views ?? [])]);
  const factoryCapabilities = Object.freeze([...(options.capabilities ?? [])]);
  const viewRegistry = createCalendarViewRegistry(factoryViews);
  const CalendarActionsContext = createContext<Actions | null>(null);
  const CalendarContext = createContext<ContextValue | null>(null);
  const CalendarMetaContext = createContext<Meta | null>(null);
  const CalendarSourceContext = createContext<Source | null>(null);
  const CalendarStateContext = createContext<State | null>(null);
  const selectAnchorDate = (state: State) => state.anchorDate;
  const selectView = (state: State) => state.view;

  function useCalendar(): ContextValue {
    const calendar = useContext(CalendarContext);
    if (calendar === null) {
      throw new Error("calendar-compound-component-outside-root");
    }
    return calendar;
  }

  function useCalendarState(): State {
    const state = useContext(CalendarStateContext);
    if (state === null) throw new Error("calendar-hook-outside-root");
    return state;
  }

  function useCalendarActions(): Actions {
    const actions = useContext(CalendarActionsContext);
    if (actions === null) throw new Error("calendar-hook-outside-root");
    return actions;
  }

  function useCalendarMeta(): Meta {
    const meta = useContext(CalendarMetaContext);
    if (meta === null) throw new Error("calendar-hook-outside-root");
    return meta;
  }

  function useCalendarSelector<TSelected>(
    selector: (state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>) => TSelected,
    selectorOptions: { readonly isEqual?: (previous: TSelected, next: TSelected) => boolean } = {},
  ): TSelected {
    const source = useContext(CalendarSourceContext);
    if (source === null) throw new Error("calendar-hook-outside-root");
    return useCalendarStoreSelector(source, selector, selectorOptions);
  }

  function Root({
    anchorDate,
    children,
    clock,
    defaultAnchorDate,
    defaultExpandedResourceIds,
    defaultFocus,
    defaultSelection,
    defaultTimeZone,
    defaultView,
    direction = "ltr",
    disambiguation = "compatible",
    eventAdapter = options.eventAdapter,
    events,
    expandedResourceIds,
    focus,
    id,
    invalidEventPolicy = options.invalidEventPolicy,
    locale,
    now,
    onAnchorDateChange,
    onDiagnosticsChange,
    onExpandedResourceIdsChange,
    onFocusChange,
    onSelectionChange,
    onTimeZoneChange,
    onViewChange,
    resources = [],
    selection,
    store: injectedStore,
    timeZone,
    view,
    views,
    weekRules,
  }: CalendarRootProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>) {
    const reactId = useId();
    const instanceId = id ?? safePartId(reactId);
    const rootViewRegistry = useMemo(
      () =>
        views === undefined
          ? viewRegistry
          : createCalendarViewRegistry([...factoryViews, ...views]),
      [views],
    );
    const initialView = defaultView ?? view ?? rootViewRegistry.names[0];
    const initialAnchorDate = defaultAnchorDate ?? anchorDate;
    const initialTimeZone = defaultTimeZone ?? timeZone;

    if (initialAnchorDate === undefined) {
      throw new TypeError("calendar-root-requires-anchor-date");
    }
    if (initialTimeZone === undefined) {
      throw new TypeError("calendar-root-requires-time-zone");
    }
    if (initialView === undefined) {
      throw new TypeError("calendar-root-requires-view");
    }

    const store = useCalendarStore(
      {
        defaultAnchorDate: initialAnchorDate,
        defaultExpandedResourceIds,
        defaultFocus,
        defaultSelection,
        defaultTimeZone: initialTimeZone,
        defaultView: initialView,
      },
      injectedStore,
    );
    const binding = useCalendarStoreBinding(store, {
      controlled: {
        anchorDate,
        expandedResourceIds,
        focus,
        selection,
        timeZone,
        view,
      },
      handlers: {
        onAnchorDateChange,
        onExpandedResourceIdsChange,
        onFocusChange,
        onSelectionChange,
        onTimeZoneChange,
        onViewChange,
      },
    });
    const environment = useMemo<CalendarEnvironment>(() => {
      const base = {
        direction,
        disambiguation,
        locale,
        timeZone: binding.state.timeZone,
        weekRules,
      };
      if (now !== undefined) return Object.freeze({ ...base, now });
      if (clock !== undefined) return Object.freeze({ ...base, clock });
      return Object.freeze(base);
    }, [binding.state.timeZone, clock, direction, disambiguation, locale, now, weekRules]);
    const snapshotCache = useMemo(
      () => createEventSnapshotCache(eventAdapter, { invalidEventPolicy }),
      [eventAdapter, invalidEventPolicy],
    );
    const eventSnapshot = useMemo(() => snapshotCache.getSnapshot(events), [events, snapshotCache]);
    const activeView = rootViewRegistry.get(binding.state.view);
    const diagnostics = useMemo(() => {
      const next = rootViewRegistry.diagnostics.map<CalendarDiagnostic<TEvent, TEventId>>(
        (diagnostic) => Object.freeze({ ...diagnostic, severity: "warning" }),
      );

      if (activeView === undefined) {
        next.push(
          Object.freeze({
            code: "unregistered-active-view",
            severity: "error",
            viewName: binding.state.view,
          }),
        );
      }
      for (const issue of eventSnapshot.issues) {
        next.push(Object.freeze({ code: "invalid-event", issue, severity: "error" }));
      }
      return Object.freeze(next);
    }, [activeView, binding.state.view, eventSnapshot.issues, rootViewRegistry.diagnostics]);
    const capabilities = useMemo(
      () =>
        createCalendarCapabilitySet([
          "calendar:state",
          "calendar:events",
          "calendar:resources",
          "calendar:diagnostics",
          ...factoryCapabilities,
          ...(activeView === undefined ? [] : ["view:active", "view:navigate"]),
          ...(now === undefined && clock === undefined ? [] : ["view:today"]),
          ...(activeView?.capabilities ?? []),
        ]),
      [activeView, clock, now],
    );
    const ids = useMemo(
      () =>
        Object.freeze({
          frame: `${instanceId}-frame`,
          title: `${instanceId}-title`,
          viewport: `${instanceId}-viewport`,
        }),
      [instanceId],
    );
    const frameRef = useRef<HTMLElement>(null);
    const titleRef = useRef<HTMLSpanElement>(null);
    const toolbarRef = useRef<HTMLElement>(null);
    const viewportRef = useRef<HTMLDivElement>(null);
    const refs = useMemo(
      () =>
        Object.freeze({
          frame: frameRef,
          title: titleRef,
          toolbar: toolbarRef,
          viewport: viewportRef,
        }),
      [],
    );

    interface ActionRuntime {
      readonly activeView: View | undefined;
      readonly environment: CalendarEnvironment;
      readonly state: CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
    }

    const actionRuntime = { activeView, environment, state: binding.state } satisfies ActionRuntime;
    const committedActionRuntime = useRef<ActionRuntime | null>(null);
    if (committedActionRuntime.current === null) committedActionRuntime.current = actionRuntime;
    useLayoutEffect(() => {
      committedActionRuntime.current = actionRuntime;
    }, [actionRuntime]);
    const actions = useMemo<CalendarSemanticActions<TView, TSelection, TFocus, TResourceId>>(
      () =>
        Object.freeze({
          ...binding.actions,
          navigateNext() {
            const runtime = committedActionRuntime.current;
            if (runtime?.activeView === undefined) return;
            binding.actions.setAnchorDate(
              runtime.activeView.navigate(runtime.state.anchorDate, 1, runtime.environment),
            );
          },
          navigatePrevious() {
            const runtime = committedActionRuntime.current;
            if (runtime?.activeView === undefined) return;
            binding.actions.setAnchorDate(
              runtime.activeView.navigate(runtime.state.anchorDate, -1, runtime.environment),
            );
          },
          navigateToday() {
            const runtime = committedActionRuntime.current;
            if (runtime === null) return;
            const instant = runtime.environment.now ?? runtime.environment.clock?.instant();
            if (instant === undefined) return;
            binding.actions.setAnchorDate(
              instant.toZonedDateTimeISO(runtime.state.timeZone).toPlainDate(),
            );
          },
        }),
      [binding.actions],
    );
    const meta = useMemo<
      CalendarMeta<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>
    >(
      () =>
        Object.freeze({
          activeView,
          capabilities,
          diagnostics,
          environment,
          eventAdapter,
          eventSnapshot,
          events,
          ids,
          instanceId,
          refs,
          resources,
          viewRegistry: rootViewRegistry,
        }),
      [
        activeView,
        capabilities,
        diagnostics,
        environment,
        eventAdapter,
        eventSnapshot,
        events,
        ids,
        instanceId,
        refs,
        resources,
        rootViewRegistry,
      ],
    );
    const calendar = useMemo<ContextValue>(
      () => Object.freeze({ actions, meta, state: binding.state }),
      [actions, binding.state, meta],
    );

    useEffect(() => {
      onDiagnosticsChange?.(diagnostics);
    }, [diagnostics, onDiagnosticsChange]);

    return createElement(
      CalendarSourceContext,
      { value: binding.meta.source },
      createElement(
        CalendarActionsContext,
        { value: actions },
        createElement(
          CalendarMetaContext,
          { value: meta },
          createElement(
            CalendarStateContext,
            { value: binding.state },
            createElement(CalendarContext, { value: calendar }, children),
          ),
        ),
      ),
    );
  }

  function Frame({ children, id, ref, ...props }: React.ComponentPropsWithRef<"section">) {
    const meta = useCalendarMeta();
    const composedRef = useComposedRef(meta.refs.frame, ref);
    return createElement(
      "section",
      {
        ...props,
        "data-calendar-instance": meta.instanceId,
        "data-calendar-part": "frame",
        id: id ?? meta.ids.frame,
        ref: composedRef,
      },
      children,
    );
  }

  function Toolbar({ children, ref, ...props }: React.ComponentPropsWithRef<"header">) {
    const meta = useCalendarMeta();
    const composedRef = useComposedRef(meta.refs.toolbar, ref);
    return createElement(
      "header",
      { ...props, "data-calendar-part": "toolbar", ref: composedRef },
      children,
    );
  }

  function Viewport({ children, id, ref, ...props }: React.ComponentPropsWithRef<"div">) {
    const meta = useCalendarMeta();
    const composedRef = useComposedRef(meta.refs.viewport, ref);
    return createElement(
      "div",
      {
        ...props,
        "data-calendar-part": "viewport",
        id: id ?? meta.ids.viewport,
        ref: composedRef,
      },
      children,
    );
  }

  function Title({ children, id, ref, ...props }: React.ComponentPropsWithRef<"span">) {
    const meta = useCalendarMeta();
    const anchorDate = useCalendarSelector(selectAnchorDate);
    const composedRef = useComposedRef(meta.refs.title, ref);
    const title = meta.activeView?.getTitle(anchorDate, meta.environment) ?? "";
    return createElement(
      "span",
      {
        ...props,
        "data-calendar-part": "title",
        id: id ?? meta.ids.title,
        ref: composedRef,
      },
      children ?? title,
    );
  }

  function PreviousTrigger({
    children,
    disabled,
    ref,
    type = "button",
    ...props
  }: React.ComponentPropsWithRef<"button">) {
    const actions = useCalendarActions();
    const meta = useCalendarMeta();
    return createElement(
      "button",
      {
        ...props,
        "aria-controls": props["aria-controls"] ?? meta.ids.viewport,
        "data-calendar-part": "previous-trigger",
        disabled: disabled ?? meta.activeView === undefined,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) actions.navigatePrevious();
        },
        ref,
        type,
      },
      children,
    );
  }

  function NextTrigger({
    children,
    disabled,
    ref,
    type = "button",
    ...props
  }: React.ComponentPropsWithRef<"button">) {
    const actions = useCalendarActions();
    const meta = useCalendarMeta();
    return createElement(
      "button",
      {
        ...props,
        "aria-controls": props["aria-controls"] ?? meta.ids.viewport,
        "data-calendar-part": "next-trigger",
        disabled: disabled ?? meta.activeView === undefined,
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) actions.navigateNext();
        },
        ref,
        type,
      },
      children,
    );
  }

  function TodayTrigger({
    children,
    disabled,
    ref,
    type = "button",
    ...props
  }: React.ComponentPropsWithRef<"button">) {
    const actions = useCalendarActions();
    const meta = useCalendarMeta();
    return createElement(
      "button",
      {
        ...props,
        "aria-controls": props["aria-controls"] ?? meta.ids.viewport,
        "data-calendar-part": "today-trigger",
        disabled: disabled ?? !meta.capabilities.has("view:today"),
        onClick: (event: React.MouseEvent<HTMLButtonElement>) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) actions.navigateToday();
        },
        ref,
        type,
      },
      children,
    );
  }

  function ViewSwitcher({
    getViewLabel,
    onChange,
    ref,
    ...props
  }: React.ComponentPropsWithRef<"select"> & { readonly getViewLabel: (view: TView) => string }) {
    const actions = useCalendarActions();
    const meta = useCalendarMeta();
    const view = useCalendarSelector(selectView);
    return createElement(
      "select",
      {
        ...props,
        "data-calendar-part": "view-switcher",
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => {
          onChange?.(event);
          const nextView = meta.viewRegistry.get(event.currentTarget.value);
          if (!event.defaultPrevented && nextView !== undefined) actions.setView(nextView.name);
        },
        ref,
        value: view,
      },
      meta.viewRegistry.names.map((name) =>
        createElement("option", { key: name, value: name }, getViewLabel(name)),
      ),
    );
  }

  function ActiveView({ fallback }: { readonly fallback?: React.ReactNode }) {
    const calendar = useCalendar();
    return calendar.meta.activeView?.render(calendar) ?? fallback ?? null;
  }

  function CustomView({ view: customView }: { readonly view: View }) {
    const calendar = useCalendar();
    return customView.render(calendar);
  }

  function Event({
    children,
    eventId,
    fallback,
  }: CalendarEventProps<TEvent, TResource, TView, TSelection, TFocus, TEventId, TResourceId>) {
    const calendar = useCalendar();
    const normalized = calendar.meta.eventSnapshot.get(eventId);
    if (normalized === undefined) return fallback ?? null;
    return children({ ...calendar, event: normalized.event, normalized });
  }

  function defineView<
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
  ): CalendarDefinedView<
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
  > {
    return bindCalendarView(definition);
  }

  return Object.freeze({
    ActiveView,
    CustomView,
    Event,
    Frame,
    NextTrigger,
    PreviousTrigger,
    Root,
    Title,
    TodayTrigger,
    Toolbar,
    ViewSwitcher,
    Viewport,
    defineView,
    useCalendar,
    useCalendarActions,
    useCalendarMeta,
    useCalendarSelector,
    useCalendarState,
    viewRegistry,
  });
}
