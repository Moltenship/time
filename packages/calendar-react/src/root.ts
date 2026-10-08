import {
  createEventSnapshotCache,
  resolveViewInstantRange,
  type CalendarEnvironment,
  type CalendarEnvironmentBase,
  type EventAdapter,
  type EventId,
  type EventSnapshotIssue,
  type InvalidCalendarEventPolicy,
  type ResourceId,
} from "@moltenship/calendar-core";
import {
  createElement,
  createRef,
  useEffect,
  useEffectEvent,
  useId,
  useInsertionEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import type {
  CalendarDiagnostic,
  CalendarMeta,
  CalendarRootProps,
  CalendarSemanticActions,
} from "./calendar-types";
import {
  CalendarActionsContext,
  CalendarMetaContext,
  CalendarSourceContext,
  CalendarStateContext,
  CalendarViewContext,
} from "./context";
import {
  sameElements,
  sameInstant,
  samePlainDate,
  sameRange,
  sameWeekRules,
  shallowEqual,
} from "./equality";
import { useCalendarStateBinding } from "./state-binding";
import type { CalendarStore } from "./types";
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

interface CommittedRootInputs {
  readonly environment: CalendarEnvironment;
  readonly viewOptions: ViewOptionsOverrides;
}

const noResources: readonly never[] = Object.freeze([]);
const todaySampleIntervalMs = 60_000;

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
      return diagnostic.code === "invalid-event"
        ? other.code === "invalid-event" && sameIssue(diagnostic.issue, other.issue)
        : other.code === "unregistered-active-view" && other.viewName === diagnostic.viewName;
    })
  );
}

function collectDiagnostics<TEvent, TEventId extends EventId>(
  view: string,
  viewIsRegistered: boolean,
  issues: readonly EventSnapshotIssue<TEvent, TEventId>[],
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
  return Object.freeze(diagnostics);
}

function createSemanticActions<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  store: CalendarStore<TView, TSelection, TFocus, TResourceId>,
  read: () => {
    readonly anchorDate: Temporal.PlainDate;
    readonly timeZone: string;
    readonly view: TView;
  },
  viewsByName: ReadonlyMap<string, AnyCalendarView>,
  committed: RefObject<CommittedRootInputs>,
): CalendarSemanticActions<TView, TSelection, TFocus, TResourceId> {
  // Every command reads the latest requested state, so consecutive commands in one handler compose.
  function navigate(delta: number) {
    const latest = read();
    const view = viewsByName.get(latest.view);
    if (view === undefined) return;
    const options = resolveViewOptions(view, committed.current.viewOptions?.[latest.view]);
    store.actions.setAnchorDate(view.strategy.navigate(latest.anchorDate, delta, options));
  }

  return Object.freeze({
    ...store.actions,
    navigateNext: () => navigate(1),
    navigatePrevious: () => navigate(-1),
    navigateToday() {
      const { environment } = committed.current;
      const instant = environment.now ?? environment.clock?.instant() ?? Temporal.Now.instant();
      store.actions.setAnchorDate(instant.toZonedDateTimeISO(read().timeZone).toPlainDate());
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
>(config: CalendarRootConfig<TEvent, TViewDef, TEventId, TResourceId>) {
  type View = TViewDef["name"];
  const viewsByName: ReadonlyMap<string, AnyCalendarView> = new Map(
    config.views.map((view) => [view.name, view]),
  );

  return function Root({
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
    events,
    expandedResourceIds,
    focus,
    id,
    locale,
    now,
    onAnchorDateChange,
    onDiagnosticsChange,
    onExpandedResourceIdsChange,
    onFocusChange,
    onSelectionChange,
    onTimeZoneChange,
    onViewChange,
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
    const { internals, source, state, store } = useCalendarStateBinding<
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
    const stableResources = useStableValue(resources, sameElements);

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
    const instant = useNowFrom(environment, todaySampleIntervalMs);
    const today = useStableValue(
      instant === null ? null : instant.toZonedDateTimeISO(state.timeZone).toPlainDate(),
      samePlainDate,
    );
    const activeView = useMemo<CalendarActiveView<AnyCalendarView> | null>(() => {
      if (activeDefinition === undefined || range === undefined) return null;
      const instantRange = resolveViewInstantRange(range, viewEnvironment.timeZone);
      return Object.freeze({
        definition: activeDefinition,
        environment: viewEnvironment,
        instantRange,
        options,
        projection: activeDefinition.strategy.project({
          environment: viewEnvironment,
          instantRange,
          options,
          range,
          resources: stableResources,
          snapshot: eventSnapshot,
          today,
        }),
        range,
        view: activeDefinition.name,
      });
    }, [activeDefinition, eventSnapshot, options, range, stableResources, today, viewEnvironment]);

    const diagnostics = useStableValue(
      collectDiagnostics(state.view, activeDefinition !== undefined, eventSnapshot.issues),
      sameDiagnostics,
    );
    const reportDiagnostics = useEffectEvent(
      (next: readonly CalendarDiagnostic<TEvent, TEventId>[]) => onDiagnosticsChange?.(next),
    );
    useEffect(() => reportDiagnostics(diagnostics), [diagnostics]);

    const committed = useRef<CommittedRootInputs>({ environment, viewOptions: viewOverrides });
    useInsertionEffect(() => {
      committed.current = { environment, viewOptions: viewOverrides };
    });
    const actions = useMemo(
      () => createSemanticActions(store, internals.read, viewsByName, committed),
      [internals, store],
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
          eventSnapshot,
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
        eventSnapshot,
        ids,
        instanceId,
        refs,
        stableResources,
      ],
    );

    return createElement(
      CalendarSourceContext,
      { value: source },
      createElement(
        CalendarActionsContext,
        { value: actions },
        createElement(
          CalendarMetaContext,
          { value: meta },
          createElement(
            CalendarStateContext,
            { value: state },
            createElement(CalendarViewContext, { value: activeView }, children),
          ),
        ),
      ),
    );
  };
}
