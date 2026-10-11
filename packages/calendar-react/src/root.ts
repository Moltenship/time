import {
  applyEventOverlay,
  createAnnotationSnapshot,
  createAvailabilitySnapshot,
  createEventSnapshotCache,
  createEventTransactions,
  createResourceTree,
  readOnlyPolicy,
  resolveViewInstantRange,
  resolveViewLoadRange,
  type AnnotationSnapshotIssue,
  type AvailabilityIssue,
  type AvailabilitySnapshot,
  type CalendarEnvironment,
  type CalendarEnvironmentBase,
  type CalendarEventChangeHandler,
  type CalendarPolicy,
  type CalendarResource,
  type EventAdapter,
  type ResourceTree,
  type EventId,
  type EventSnapshot,
  type EventSnapshotIssue,
  type EventTransactions,
  type InvalidCalendarEventPolicy,
  type CalendarPendingPlacements,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  createElement,
  createRef,
  useEffect,
  useId,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import type {
  CalendarDiagnostic,
  CalendarMeta,
  CalendarRootProps,
  CalendarSemanticActions,
  CalendarVisibleRange,
} from "./calendar-types";
import { CalendarAnnotationsContext } from "./annotations";
import { createAnnouncerChannel } from "./announcer";
import { CalendarAvailabilityContext } from "./availability";
import { CalendarNowSourceContext, type CalendarContexts } from "./context";
import {
  sameAvailability,
  sameElements,
  sameInstant,
  samePlainDate,
  sameRange,
  sameWeekRules,
  shallowEqual,
} from "./equality";
import { CalendarInteractionContext, type CalendarInteractionRuntime } from "./interaction";
import { createDraftStore } from "./draft";
import { createKeyboardSessionStore } from "./keyboard-store";
import { CalendarResourcesContext } from "./resources";
import { useCalendarStateBinding } from "./state-binding";
import type { CalendarRootStoreBinding } from "./store";
import { CalendarEventsContext } from "./status";
import { useNowFrom } from "./use-now";
import { useStableValue } from "./use-stable-value";
import { resolveViewOptions, type AnyCalendarView, type CalendarActiveView } from "./views";

export interface CalendarRootConfig<
  TEvent,
  TViewDef,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views: readonly TViewDef[];
}

type ViewOptionsOverrides = Readonly<Record<string, object | undefined>> | undefined;

interface CommittedRootInputs<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  /** The view on screen. */
  readonly activeView: CalendarActiveView<AnyCalendarView> | null;
  readonly availability: AvailabilitySnapshot;
  readonly environment: CalendarEnvironment;
  /** The application's events, without pending changes. */
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly onDiagnosticsChange:
    | ((diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void)
    | undefined;
  readonly onEventChange: CalendarEventChangeHandler<TEvent, TEventId, TResourceId> | undefined;
  readonly onVisibleRangeChange: ((range: CalendarVisibleRange<string>) => void) | undefined;
  readonly policies: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[] | undefined;
  readonly resourceTree: ResourceTree;
  readonly viewOptions: ViewOptionsOverrides;
}

const noResources: readonly never[] = Object.freeze([]);
const noAnnotations: readonly never[] = Object.freeze([]);
const todaySampleIntervalMs = 60_000;
/** A root without `onEventChange` is read-only, so its checks reject everything. */
const readOnlyRoot = () => ({ reason: "read-only", type: "reject" }) as const;

function sameLocale(left: Intl.Locale | string, right: Intl.Locale | string): boolean {
  return String(left) === String(right);
}

function sameIssue(
  left: EventSnapshotIssue<unknown, EventId>,
  right: EventSnapshotIssue<unknown, EventId>,
): boolean {
  return (
    left.code === right.code &&
    left.index === right.index &&
    left.eventId === right.eventId &&
    left.accessor === right.accessor &&
    left.message === right.message &&
    left.resourceIndex === right.resourceIndex
  );
}

function sameDiagnostics(
  left: readonly CalendarDiagnostic<unknown, EventId>[],
  right: readonly CalendarDiagnostic<unknown, EventId>[],
): boolean {
  return (
    left.length === right.length &&
    left.every((diagnostic, index) => {
      const other = right[index];
      if (other === undefined || other.code !== diagnostic.code) return false;
      switch (diagnostic.code) {
        case "invalid-event":
          return other.code === "invalid-event" && sameIssue(diagnostic.issue, other.issue);
        case "invalid-annotation":
          return (
            other.code === "invalid-annotation" &&
            other.issue.annotation === diagnostic.issue.annotation &&
            other.issue.code === diagnostic.issue.code &&
            other.issue.index === diagnostic.issue.index
          );
        case "invalid-availability":
          return (
            other.code === "invalid-availability" &&
            other.issue.code === diagnostic.issue.code &&
            other.issue.resourceId === diagnostic.issue.resourceId &&
            other.issue.value === diagnostic.issue.value
          );
        case "unregistered-active-view":
          return (
            other.code === "unregistered-active-view" && other.viewName === diagnostic.viewName
          );
      }
    })
  );
}

function collectDiagnostics<TEvent, TEventId extends EventId>(
  view: string,
  viewIsRegistered: boolean,
  issues: readonly EventSnapshotIssue<TEvent, TEventId>[],
  annotationIssues: readonly AnnotationSnapshotIssue[],
  availabilityIssues: readonly AvailabilityIssue[],
): readonly CalendarDiagnostic<TEvent, TEventId>[] {
  const diagnostics: CalendarDiagnostic<TEvent, TEventId>[] = [];
  if (!viewIsRegistered) {
    diagnostics.push(
      Object.freeze({ code: "unregistered-active-view", severity: "error", viewName: view }),
    );
  }
  for (const issue of issues) {
    diagnostics.push(Object.freeze({ code: "invalid-event", issue, severity: "error" }));
  }
  for (const issue of annotationIssues) {
    diagnostics.push(Object.freeze({ code: "invalid-annotation", issue, severity: "error" }));
  }
  for (const issue of availabilityIssues) {
    diagnostics.push(Object.freeze({ code: "invalid-availability", issue, severity: "error" }));
  }
  return Object.freeze(diagnostics);
}

function createSemanticActions<
  TView extends string,
  TSelection,
  TFocus,
  TEvent,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(
  { actions, read }: CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>,
  viewsByName: ReadonlyMap<string, AnyCalendarView>,
  committed: { readonly current: CommittedRootInputs<TEvent, TEventId, TResourceId> },
  transactions: EventTransactions<TEvent, TEventId, TResourceId>,
  readOnly: CalendarPolicy<TEvent, TEventId, TResourceId>,
): CalendarSemanticActions<TView, TSelection, TFocus, TResourceId, TEvent, TEventId> {
  /** The policies every change runs through; a root without `onEventChange` rejects them all. */
  function policiesOf({
    onEventChange,
    policies = [],
  }: CommittedRootInputs<TEvent, TEventId, TResourceId>) {
    return onEventChange === undefined ? [readOnlyRoot] : [readOnly, ...policies];
  }

  // Every command reads the latest requested state, so consecutive commands in one handler compose.
  function navigate(delta: number) {
    const latest = read();
    const view = viewsByName.get(latest.view);
    if (view === undefined) return;
    const options = resolveViewOptions(view, committed.current.viewOptions?.[latest.view]);
    actions.setAnchorDate(view.strategy.navigate(latest.anchorDate, delta, options));
  }

  return Object.freeze({
    ...actions,
    checkEventChange(proposal) {
      const { availability, eventSnapshot } = committed.current;
      return transactions.check(proposal, {
        availability,
        policies: policiesOf(committed.current),
        snapshot: eventSnapshot,
        timeZone: read().timeZone,
      });
    },
    navigateNext: () => navigate(1),
    navigatePrevious: () => navigate(-1),
    navigateToday() {
      const { environment } = committed.current;
      const instant = environment.now ?? environment.clock?.instant() ?? Temporal.Now.instant();
      actions.setAnchorDate(instant.toZonedDateTimeISO(read().timeZone).toPlainDate());
    },
    proposeEventChange(proposal) {
      const { availability, eventSnapshot, onEventChange } = committed.current;
      if (onEventChange === undefined) {
        return Promise.resolve({ reason: "read-only", status: "rejected" });
      }
      return transactions.propose(proposal, {
        availability,
        onEventChange,
        policies: policiesOf(committed.current),
        snapshot: eventSnapshot,
        timeZone: read().timeZone,
      });
    },
  });
}

export function createCalendarRoot<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarView,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
>(config: CalendarRootConfig<TEvent, TViewDef, TEventId, TResourceId>, contexts: CalendarContexts) {
  type View = TViewDef["name"];
  const viewsByName: ReadonlyMap<string, AnyCalendarView> = new Map(
    config.views.map((view) => [view.name, view]),
  );
  const readOnly = readOnlyPolicy<TEvent, TEventId, TResourceId>();

  return function Root({
    anchorDate,
    annotationSources = noAnnotations,
    annotations = noAnnotations,
    availability,
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
    events,
    expandedResourceIds,
    focus,
    id,
    locale,
    now,
    onAnchorDateChange,
    onDiagnosticsChange,
    onEventChange,
    onExpandedResourceIdsChange,
    onFocusChange,
    onSelectionChange,
    onTimeZoneChange,
    onViewChange,
    onVisibleRangeChange,
    policies,
    resources = noResources,
    selection,
    store: injectedStore,
    timeZone,
    view,
    viewOptions,
    weekRules,
  }: CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>) {
    const reactId = useId();
    const instanceId = id ?? reactId;
    const { binding, source, state } = useCalendarStateBinding<
      View,
      TSelection,
      TFocus,
      TResourceId
    >(
      injectedStore,
      () => {
        const initialAnchorDate = defaultAnchorDate ?? anchorDate;
        const initialTimeZone = defaultTimeZone ?? timeZone;
        const initialView: View | undefined = defaultView ?? view ?? config.views[0]?.name;
        if (initialAnchorDate === undefined) {
          throw new TypeError("calendar-root-requires-anchor-date");
        }
        if (initialTimeZone === undefined) throw new TypeError("calendar-root-requires-time-zone");
        if (initialView === undefined) throw new TypeError("calendar-root-requires-view");
        return {
          defaultAnchorDate: initialAnchorDate,
          defaultExpandedResourceIds,
          defaultFocus,
          defaultSelection,
          defaultTimeZone: initialTimeZone,
          defaultView: initialView,
        };
      },
      {
        controlled: { anchorDate, expandedResourceIds, focus, selection, timeZone, view },
        handlers: {
          onAnchorDateChange,
          onExpandedResourceIdsChange,
          onFocusChange,
          onSelectionChange,
          onTimeZoneChange,
          onViewChange,
        },
      },
    );

    const stableLocale = useStableValue(locale, sameLocale);
    const stableWeekRules = useStableValue(weekRules, sameWeekRules);
    const stableNow = useStableValue(now, sameInstant);
    const viewEnvironment = useMemo<CalendarEnvironmentBase>(
      () =>
        Object.freeze({
          direction,
          disambiguation,
          locale: stableLocale,
          timeZone: state.timeZone,
          weekRules: stableWeekRules,
        }),
      [direction, disambiguation, stableLocale, stableWeekRules, state.timeZone],
    );
    const environment = useMemo<CalendarEnvironment>(() => {
      if (stableNow !== undefined) return Object.freeze({ ...viewEnvironment, now: stableNow });
      if (clock !== undefined) return Object.freeze({ ...viewEnvironment, clock });
      return viewEnvironment;
    }, [clock, stableNow, viewEnvironment]);

    const [snapshotCache] = useState(() =>
      createEventSnapshotCache(config.eventAdapter, {
        invalidEventPolicy: config.invalidEventPolicy,
      }),
    );
    const stableEvents = useStableValue(events, sameElements);
    const eventSnapshot = useMemo(
      () => snapshotCache.getSnapshot(stableEvents),
      [snapshotCache, stableEvents],
    );
    const [transactions] = useState(() => createEventTransactions<TEvent, TEventId, TResourceId>());
    const pending = useSyncExternalStore(
      transactions.subscribe,
      transactions.getPending,
      transactions.getPending,
    );
    const [keyboard] = useState(createKeyboardSessionStore);
    const [pointerDraft] = useState(createDraftStore);
    const preview = useSyncExternalStore(
      keyboard.subscribe,
      keyboard.getPreview,
      keyboard.getPreview,
    ) as CalendarPendingPlacements<TEventId, TResourceId>;
    // Pending changes and a keyboard gesture's preview patch only their events at query time; the
    // snapshot's indexes are reused.
    const visibleSnapshot = useMemo(
      () => applyEventOverlay(applyEventOverlay(eventSnapshot, pending), preview),
      [eventSnapshot, pending, preview],
    );
    // New events confirm resolved changes; this runs before paint, so none shows stale.
    useLayoutEffect(() => transactions.reconcile(eventSnapshot), [eventSnapshot, transactions]);
    const stableResources = useStableValue(resources, sameElements);
    // Built once per resource list, so expanding and collapsing reuse it. Resource views read
    // resources as `CalendarResource`s.
    const resourceTree = useMemo(
      () => createResourceTree(stableResources as unknown as readonly CalendarResource[]),
      [stableResources],
    );
    const stableExpandedResourceIds = useStableValue(state.expandedResourceIds, sameElements);
    // Annotations get their own snapshot, so they never invalidate event projections.
    const stableAnnotations = useStableValue(annotations, sameElements);
    const annotationSnapshot = useMemo(
      () => createAnnotationSnapshot(stableAnnotations),
      [stableAnnotations],
    );
    const stableAnnotationSources = useStableValue(annotationSources, sameElements);
    const annotationContext = useMemo(
      () => Object.freeze({ snapshot: annotationSnapshot, sources: stableAnnotationSources }),
      [annotationSnapshot, stableAnnotationSources],
    );
    // Working hours resolve each date once and cache it, for every view and policy check.
    const stableAvailability = useStableValue(availability, sameAvailability);
    const availabilitySnapshot = useMemo(
      () =>
        createAvailabilitySnapshot({
          availability: stableAvailability,
          resources: stableResources as unknown as readonly CalendarResource[],
          timeZone: state.timeZone,
        }),
      [stableAvailability, stableResources, state.timeZone],
    );

    const activeDefinition = viewsByName.get(state.view);
    const viewOverrides = viewOptions as ViewOptionsOverrides;
    const options = useStableValue(
      activeDefinition === undefined
        ? undefined
        : resolveViewOptions(activeDefinition, viewOverrides?.[state.view]),
      shallowEqual,
    );
    const range = useStableValue(
      activeDefinition?.strategy.getRange(state.anchorDate, viewEnvironment, options),
      sameRange,
    );
    const loadRange = useStableValue(
      activeDefinition === undefined || range === undefined
        ? undefined
        : resolveViewLoadRange(
            activeDefinition.strategy,
            state.anchorDate,
            viewEnvironment,
            options,
            range,
          ),
      sameRange,
    );
    const instant = useNowFrom(environment, todaySampleIntervalMs);
    const today = useStableValue(
      instant === null ? null : instant.toZonedDateTimeISO(state.timeZone).toPlainDate(),
      samePlainDate,
    );
    // Ranges and their instants change together, so range observers see one value per change.
    const visibleRange = useMemo<CalendarVisibleRange<View> | null>(
      () =>
        activeDefinition === undefined || range === undefined || loadRange === undefined
          ? null
          : Object.freeze({
              instantRange: resolveViewInstantRange(range, viewEnvironment.timeZone),
              loadInstantRange: resolveViewInstantRange(loadRange, viewEnvironment.timeZone),
              loadRange,
              range,
              view: activeDefinition.name as View,
            }),
      [activeDefinition, loadRange, range, viewEnvironment.timeZone],
    );
    const activeView = useMemo<CalendarActiveView<AnyCalendarView> | null>(() => {
      if (activeDefinition === undefined || visibleRange === null) return null;
      const { instantRange, loadInstantRange, loadRange, range } = visibleRange;
      return Object.freeze({
        definition: activeDefinition,
        environment: viewEnvironment,
        events: visibleSnapshot,
        instantRange,
        loadInstantRange,
        loadRange,
        options,
        projection: activeDefinition.strategy.project({
          environment: viewEnvironment,
          expandedResourceIds: stableExpandedResourceIds,
          instantRange,
          loadRange,
          options,
          range,
          resources: resourceTree,
          snapshot: visibleSnapshot,
          today,
        }),
        range,
        view: activeDefinition.name,
      });
    }, [
      activeDefinition,
      options,
      visibleRange,
      resourceTree,
      stableExpandedResourceIds,
      today,
      viewEnvironment,
      visibleSnapshot,
    ]);

    const diagnostics = useStableValue(
      collectDiagnostics(
        state.view,
        activeDefinition !== undefined,
        eventSnapshot.issues,
        annotationSnapshot.issues,
        availabilitySnapshot.issues,
      ),
      sameDiagnostics,
    );
    // Callbacks and options are read from the last commit, so inline values need no memoization.
    const committedInputs: CommittedRootInputs<TEvent, TEventId, TResourceId> = {
      activeView,
      availability: availabilitySnapshot,
      environment,
      eventSnapshot,
      onDiagnosticsChange,
      onEventChange,
      onVisibleRangeChange,
      policies,
      resourceTree,
      viewOptions: viewOverrides,
    };
    const committed = useRef(committedInputs);
    useInsertionEffect(() => {
      committed.current = committedInputs;
    });
    useEffect(() => committed.current.onDiagnosticsChange?.(diagnostics), [diagnostics]);
    // After the commit that shows a range, so loading its events never delays it; new events and
    // other updates don't repeat it.
    useEffect(() => {
      if (visibleRange !== null) committed.current.onVisibleRangeChange?.(visibleRange);
    }, [visibleRange]);
    const actions = useMemo(
      () => createSemanticActions(binding, viewsByName, committed, transactions, readOnly),
      [binding, transactions],
    );
    const [announcements] = useState(() =>
      createAnnouncerChannel(
        () => committed.current.environment,
        () => committed.current.resourceTree,
      ),
    );
    const interaction = useMemo<CalendarInteractionRuntime>(
      () =>
        Object.freeze({
          actions,
          announcements,
          keyboard,
          pointerDraft,
          rangeOf: (anchor: Temporal.PlainDate) => {
            // The view on screen, which is the one listening, even while a controlled owner has
            // yet to take a change of view asked for in the same handler.
            const view = committed.current.activeView;
            return view === null
              ? null
              : view.definition.strategy.getRange(anchor, view.environment, view.options);
          },
          read: binding.read,
          requests: binding.subscribeRequests,
          source,
        }),
      [actions, announcements, binding, keyboard, pointerDraft, source],
    );

    const [refs] = useState(() =>
      Object.freeze({
        frame: createRef<HTMLElement>(),
        title: createRef<HTMLSpanElement>(),
        toolbar: createRef<HTMLElement>(),
        viewport: createRef<HTMLDivElement>(),
      }),
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
    const meta = useMemo<CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId>>(
      () =>
        Object.freeze({
          activeView: activeDefinition as TViewDef | undefined,
          diagnostics,
          environment,
          eventSnapshot: visibleSnapshot,
          ids,
          instanceId,
          refs,
          resources: stableResources,
          views: config.views,
        }),
      [
        activeDefinition,
        diagnostics,
        environment,
        visibleSnapshot,
        ids,
        instanceId,
        refs,
        stableResources,
      ],
    );

    return createElement(
      CalendarNowSourceContext,
      { value: environment },
      createElement(
        contexts.source,
        { value: source },
        createElement(
          contexts.actions,
          { value: actions },
          createElement(
            contexts.meta,
            { value: meta },
            createElement(
              contexts.state,
              { value: state },
              createElement(
                contexts.view,
                { value: activeView },
                createElement(
                  CalendarResourcesContext,
                  { value: resourceTree },
                  createElement(
                    CalendarAnnotationsContext,
                    { value: annotationContext },
                    createElement(
                      CalendarAvailabilityContext,
                      { value: availabilitySnapshot },
                      createElement(
                        CalendarEventsContext,
                        { value: visibleSnapshot as EventSnapshot<unknown, EventId, ResourceId> },
                        createElement(CalendarInteractionContext, { value: interaction }, children),
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
