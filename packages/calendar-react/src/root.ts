import type {
  CalendarNowSource,
  EventAdapter,
  EventId,
  EventSnapshot,
  InvalidCalendarEventPolicy,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  createCalendarPartIds,
  createCalendarRuntime,
  resolveCalendarStoreDefaults,
  TODAY_SAMPLE_INTERVAL_MS,
  type CalendarPrimitive,
  type CalendarRuntimeInputs,
} from "@moltenship/calendar-primitives";
import { usePrimitive } from "@ui-sdk/react/primitive";
import {
  createElement,
  createRef,
  useEffect,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import type { CalendarMeta, CalendarRootProps } from "./calendar-types";
import { CalendarAnnotationsContext } from "./annotations";
import { CalendarAvailabilityContext } from "./availability";
import {
  CalendarNowSourceContext,
  type AnyPendingChanges,
  type CalendarContexts,
  type CalendarStateSource,
} from "./context";
import { useEventInput } from "./event-input";
import { CalendarInteractionContext } from "./interaction";
import { CalendarResourcesContext } from "./resources";
import { CalendarEventsContext } from "./status";
import { useNowFrom } from "./use-now";
import type { AnyCalendarView, CalendarActiveView } from "./views";

interface CalendarRootConfig<
  TEvent,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly primitive: CalendarPrimitive<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly views: readonly TViewDef[];
}

/**
 * The React adapter of the calendar kernel: it creates the root's runtime once, feeds it each
 * render's props and what it subscribes to, runs the runtime's effects at their moments, and
 * hands the derived model to the same contexts views and hooks always read.
 */
export function createCalendarRoot<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  config: CalendarRootConfig<TEvent, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
  contexts: CalendarContexts,
) {
  type View = TViewDef["name"];
  type Inputs = CalendarRuntimeInputs<
    TEvent,
    TResource,
    TViewDef,
    TSelection,
    TFocus,
    TEventId,
    TResourceId
  >;
  const runtimeConfig = {
    eventAdapter: config.eventAdapter,
    invalidEventPolicy: config.invalidEventPolicy,
    views: config.views,
  };

  return function Root({
    allowAgentDelete,
    anchorDate,
    annotationSources,
    annotations,
    availability,
    children,
    clock,
    defaultAnchorDate,
    defaultExpandedResourceIds,
    defaultFocus,
    defaultSelection,
    defaultTimeZone,
    defaultView,
    direction,
    disambiguation,
    events,
    expandedResourceIds,
    focus,
    formatAgentEventLabel,
    id,
    label,
    locale,
    now,
    onAnchorDateChange,
    onDiagnosticsChange,
    onEventChange,
    onEventChangeResult,
    onExpandedResourceIdsChange,
    onFocusChange,
    onSelectionChange,
    onTimeZoneChange,
    onViewChange,
    onVisibleRangeChange,
    policies,
    resources,
    secondaryTimeZones,
    selection,
    store,
    timeZone,
    view,
    viewOptions,
    weekRules,
  }: CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>) {
    const reactId = useId();
    const instanceId = id ?? reactId;
    // Creating a runtime has no side effects, so the one Strict Mode throws away costs nothing.
    const [runtime] = useState(() =>
      createCalendarRuntime<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>(
        runtimeConfig,
      ),
    );

    // Controlled values are read during render, so they are current in the first render that
    // receives them, and Temporal or array values that are recreated inline keep their identity.
    const connection = runtime.connect({
      controlled: { anchorDate, expandedResourceIds, focus, selection, timeZone, view },
      defaults: () =>
        resolveCalendarStoreDefaults<View, TSelection, TFocus, TResourceId>(
          {
            anchorDate,
            defaultAnchorDate,
            defaultExpandedResourceIds,
            defaultFocus,
            defaultSelection,
            defaultTimeZone,
            defaultView,
            timeZone,
            view,
          },
          config.views,
        ),
      store,
    });
    const { binding, source } = connection;
    const state = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
    const { overlay } = runtime;
    const overlaid = useSyncExternalStore(
      overlay.subscribe,
      overlay.getSnapshot,
      overlay.getSnapshot,
    );
    // A source's updates render the calendar and not the component that renders `Root`.
    const resolvedEvents = useEventInput(events);
    const instant = useNowFrom({ clock, now } as CalendarNowSource, TODAY_SAMPLE_INTERVAL_MS);

    const inputs: Inputs = {
      annotationSources,
      annotations,
      availability,
      clock,
      connection,
      direction,
      disambiguation,
      events: resolvedEvents,
      handlers: {
        onAnchorDateChange,
        onExpandedResourceIdsChange,
        onFocusChange,
        onSelectionChange,
        onTimeZoneChange,
        onViewChange,
      },
      instant,
      locale,
      now,
      onDiagnosticsChange,
      onEventChange,
      onEventChangeResult,
      onVisibleRangeChange,
      overlay: overlaid,
      policies,
      resources,
      secondaryTimeZones,
      state,
      viewOptions,
      weekRules,
    };
    const model = runtime.derive(inputs);

    // Commands run only after a commit, and every commit publishes its render's props first.
    useInsertionEffect(() => runtime.commit(model, inputs));
    useInsertionEffect(() => binding.attach(), [binding]);
    // New events confirm resolved changes; this runs before paint, so none shows stale.
    const { diagnostics, eventSnapshot, visibleRange } = model;
    useLayoutEffect(() => runtime.reconcile(eventSnapshot), [eventSnapshot, runtime]);
    useEffect(() => runtime.reportDiagnostics(diagnostics), [diagnostics, runtime]);
    useEffect(() => runtime.reportVisibleRange(visibleRange), [runtime, visibleRange]);

    // The merged state, in the render that computed it: the instance mirrors it and owns nothing.
    const handle = usePrimitive(config.primitive, {
      allowAgentDelete,
      formatAgentEventLabel,
      runtime,
      ...state,
    });

    const [refs] = useState(() =>
      Object.freeze({
        frame: createRef<HTMLElement>(),
        title: createRef<HTMLSpanElement>(),
        toolbar: createRef<HTMLElement>(),
        viewport: createRef<HTMLDivElement>(),
      }),
    );
    const ids = useMemo(() => createCalendarPartIds(instanceId), [instanceId]);
    const { activeDefinition, environment, resources: stableResources, visibleEvents } = model;
    const meta = useMemo<CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>>(
      () =>
        Object.freeze({
          activeView: activeDefinition,
          diagnostics,
          environment,
          eventSnapshot: visibleEvents,
          ids,
          instanceId,
          label,
          refs,
          resources: stableResources,
          views: config.views,
        }),
      [
        activeDefinition,
        diagnostics,
        environment,
        visibleEvents,
        ids,
        instanceId,
        label,
        refs,
        stableResources,
      ],
    );

    return createElement(
      CalendarNowSourceContext,
      { value: environment },
      createElement(
        contexts.source,
        { value: source as CalendarStateSource },
        createElement(
          contexts.actions,
          { value: model.actions },
          createElement(
            contexts.changes,
            { value: runtime.pendingChanges as CalendarStateSource<AnyPendingChanges> },
            createElement(
              contexts.meta,
              { value: meta },
              createElement(
                contexts.state,
                { value: state },
                createElement(
                  contexts.view,
                  { value: model.activeView as CalendarActiveView<AnyCalendarView> | null },
                  createElement(
                    contexts.handle,
                    { value: handle },
                    createElement(
                      CalendarResourcesContext,
                      { value: model.resourceTree },
                      createElement(
                        CalendarAnnotationsContext,
                        { value: model.annotations },
                        createElement(
                          CalendarAvailabilityContext,
                          { value: model.availability },
                          createElement(
                            CalendarEventsContext,
                            {
                              value: visibleEvents as EventSnapshot<unknown, EventId, ResourceId>,
                            },
                            createElement(
                              CalendarInteractionContext,
                              { value: model.interaction },
                              children,
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  };
}
