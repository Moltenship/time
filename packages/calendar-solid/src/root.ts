import type {
  CalendarEventInput,
  CalendarEventSource,
  CalendarNowSource,
  EventAdapter,
  EventId,
  InvalidCalendarEventPolicy,
  ResourceId,
} from "@moltenship/calendar-core";
import {
  clockOf,
  createCalendarPartIds,
  createCalendarRuntime,
  createClockTicker,
  resolveCalendarStoreDefaults,
  sameRange,
  TODAY_SAMPLE_INTERVAL_MS,
  type AnyCalendarState,
  type CalendarActiveView,
  type CalendarPrimitive,
  type CalendarRuntime,
  type CalendarRuntimeInputs,
  type CalendarRuntimeModel,
  type CalendarSemanticActions,
  type CalendarStateSource,
} from "@moltenship/calendar-primitives";
import type { PlainDateInterval } from "@moltenship/calendar-temporal";
import { isServer, type JSX } from "@solidjs/web";
import { usePrimitive, type PrimitiveHandle } from "@ui-sdk/solid/primitive";
import {
  createEffect,
  createMemo,
  createRenderEffect,
  createSignal,
  createUniqueId,
  untrack,
  type Accessor,
} from "solid-js";

import type { RootContext } from "./root-context";
import { createStateSelector } from "./state-selector";
import type { CalendarMeta, CalendarRootProps } from "./types";
import type { AnyCalendarView } from "./views";

// oxlint-disable-next-line typescript/no-explicit-any -- the parts serve every factory's root.
type Any = any;

/** What a root hands its parts and hooks; the factory narrows it to its own records. */
export interface CalendarRootValue {
  readonly actions: CalendarSemanticActions<string, Any, Any, ResourceId, Any, EventId>;
  readonly handle: PrimitiveHandle<CalendarPrimitive<string, Any, Any, ResourceId>>;
  readonly meta: Accessor<CalendarMeta<Any, Any, AnyCalendarView, EventId, ResourceId>>;
  readonly model: Accessor<
    CalendarRuntimeModel<Any, Any, AnyCalendarView, Any, Any, EventId, ResourceId>
  >;
  readonly runtime: CalendarRuntime<Any, Any, AnyCalendarView, Any, Any, EventId, ResourceId>;
  /** Where the structural parts record their elements, for `meta.refs`. */
  readonly setRef: {
    readonly [Part in keyof CalendarMeta<unknown, unknown>["refs"]]: (
      element: HTMLElement | undefined,
    ) => void;
  };
  /** The connection's state source, whose identity follows the controlled slices. */
  readonly source: Accessor<CalendarStateSource<AnyCalendarState>>;
  readonly state: Accessor<AnyCalendarState>;
  readonly view: Accessor<CalendarActiveView<AnyCalendarView> | null>;
  readonly visibleRange: Accessor<PlainDateInterval | null>;
}

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

const same = <T>(value: T) => value;
const noop = () => undefined;
/** What an events array subscribes to: nothing. Its server snapshot is the array itself. */
const noEventSource: CalendarStateSource<readonly never[] | null> = Object.freeze({
  getSnapshot: () => null,
  subscribe: () => noop,
});
/** What a fixed `now` subscribes to: nothing. */
const noClock: CalendarStateSource<Temporal.Instant | null> = Object.freeze({
  getSnapshot: () => null,
  subscribe: () => noop,
});

function isEventSource<TEvent>(
  input: CalendarEventInput<TEvent>,
): input is CalendarEventSource<TEvent> {
  return !Array.isArray(input);
}

function sameMeta(left: object, right: object): boolean {
  for (const key of Object.keys(left)) {
    if (
      !Object.is((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key])
    ) {
      return false;
    }
  }
  return true;
}

function sameVisibleRange(
  left: PlainDateInterval | null,
  right: PlainDateInterval | null,
): boolean {
  return left === right || (left !== null && right !== null && sameRange(left, right));
}

/**
 * The Solid adapter of the calendar kernel. It creates the root's runtime once, derives the model
 * in a memo from the props and what it subscribes to, and runs the runtime's effects at their
 * moments in Solid's queue:
 *
 * - `commit` and `attach` in render effects, which Solid runs before user effects and before any
 *   event handler or agent can run a command;
 * - `reconcile` in a render effect too, so new events confirm pending changes before paint;
 * - the diagnostics and visible range in user effects, after the DOM is updated, never on the
 *   server.
 *
 * The effects are created on the server as well, with their side effects skipped there, so the
 * server and the client claim the same hydration ids.
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
  root: RootContext<CalendarRootValue>,
): (
  props: CalendarRootProps<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>,
) => JSX.Element {
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
  type Model = CalendarRuntimeModel<
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

  return function Root(props) {
    // A component body runs once in Solid, so the runtime lives as long as the root.
    const runtime = createCalendarRuntime<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >(runtimeConfig);
    // Called whether or not `id` is given: an `id` that comes or goes later finds one ready.
    const generatedId = createUniqueId();
    const instanceId = () => props.id ?? generatedId;

    // The controlled slices are tracked; `connect` returns the same connection while they hold.
    const connection = createMemo(() =>
      runtime.connect({
        controlled: {
          anchorDate: props.anchorDate,
          expandedResourceIds: props.expandedResourceIds,
          focus: props.focus,
          selection: props.selection,
          timeZone: props.timeZone,
          view: props.view,
        },
        // Read once, when the root makes its own store: a later default changes nothing.
        defaults: () =>
          untrack(() =>
            resolveCalendarStoreDefaults<View, TSelection, TFocus, TResourceId>(
              {
                anchorDate: props.anchorDate,
                defaultAnchorDate: props.defaultAnchorDate,
                defaultExpandedResourceIds: props.defaultExpandedResourceIds,
                defaultFocus: props.defaultFocus,
                defaultSelection: props.defaultSelection,
                defaultTimeZone: props.defaultTimeZone,
                defaultView: props.defaultView,
                timeZone: props.timeZone,
                view: props.view,
              },
              config.views,
            ),
          ),
        store: props.store,
      }),
    );
    const source = () => connection().source;
    const state = createStateSelector(source, same);
    const overlay = createStateSelector(runtime.overlay, same);

    // A source's members are called as methods, so a class instance works too.
    const sourcedEvents = createStateSelector<readonly TEvent[] | null, readonly TEvent[] | null>(
      () => {
        const input = props.events;
        if (!isEventSource(input)) return noEventSource;
        return {
          getServerSnapshot: () => input.getServerSnapshot(),
          getSnapshot: () => input.getSnapshot(),
          subscribe: (listener: () => void) => input.subscribe(listener),
        };
      },
      same,
    );
    const events = (): readonly TEvent[] => {
      const input = props.events;
      return isEventSource(input) ? (sourcedEvents() ?? []) : input;
    };

    // `today` follows a clock sampled once a minute: `null` on the server and while hydrating, as
    // the server's time isn't the reader's, unless `now` fixes it.
    const ticker = createMemo(() =>
      createClockTicker(
        clockOf({ clock: props.clock } as CalendarNowSource),
        TODAY_SAMPLE_INTERVAL_MS,
      ),
    );
    const sampled = createStateSelector<Temporal.Instant | null, Temporal.Instant | null>(() => {
      if (props.now !== undefined) return noClock;
      const { getSnapshot, subscribe } = ticker();
      return { getServerSnapshot: () => null, getSnapshot, subscribe };
    }, same);
    const instant = () => props.now ?? sampled();

    const derived = createMemo(() => {
      const inputs: Inputs = {
        annotationSources: props.annotationSources,
        annotations: props.annotations,
        availability: props.availability,
        clock: props.clock,
        connection: connection(),
        direction: props.direction,
        disambiguation: props.disambiguation,
        events: events(),
        handlers: {
          onAnchorDateChange: props.onAnchorDateChange,
          onExpandedResourceIdsChange: props.onExpandedResourceIdsChange,
          onFocusChange: props.onFocusChange,
          onSelectionChange: props.onSelectionChange,
          onTimeZoneChange: props.onTimeZoneChange,
          onViewChange: props.onViewChange,
        },
        instant: instant(),
        locale: props.locale,
        now: props.now,
        onDiagnosticsChange: props.onDiagnosticsChange,
        onEventChange: props.onEventChange,
        onEventChangeResult: props.onEventChangeResult,
        onVisibleRangeChange: props.onVisibleRangeChange,
        overlay: overlay(),
        policies: props.policies,
        resources: props.resources,
        secondaryTimeZones: props.secondaryTimeZones,
        state: state(),
        viewOptions: props.viewOptions,
        weekRules: props.weekRules,
      };
      // Only the inputs are dependencies: an adapter or strategy that reads a signal doesn't
      // make the model depend on it.
      return { inputs, model: untrack(() => runtime.derive(inputs)) };
    });
    const model = (): Model => derived().model;

    // Commands run only after a commit, and every commit publishes its inputs first.
    createRenderEffect(derived, ({ inputs, model: next }) => {
      if (!isServer) runtime.commit(next, inputs);
    });
    // Solid runs an effect's apply whenever its compute runs, equal value or not, so each effect
    // below reads a memo, which notifies only when its value changes: React's dependency arrays.
    const binding = createMemo(() => connection().binding);
    const eventSnapshot = createMemo(() => model().eventSnapshot);
    const diagnostics = createMemo(() => model().diagnostics);
    // Once per binding; the cleanup detaches it before the next one and when the root goes.
    createRenderEffect(binding, (next) => (isServer ? undefined : next.attach()));
    // New events confirm resolved changes, in the same flush, so none shows stale.
    createRenderEffect(eventSnapshot, (next) => {
      if (!isServer) runtime.reconcile(next);
    });
    // An effect's apply runs untracked, so a signal the application's callback reads is its own.
    createEffect(diagnostics, (next) => runtime.reportDiagnostics(next));
    // The runtime reports a range once, however often it hears it, so this one needs no memo.
    createEffect(
      () => model().visibleRange,
      (next) => runtime.reportVisibleRange(next),
    );

    // The merged state: the instance mirrors it and owns nothing.
    const handle = usePrimitive(config.primitive, () => ({
      allowAgentDelete: props.allowAgentDelete,
      formatAgentEventLabel: props.formatAgentEventLabel,
      runtime,
      ...state(),
    }));

    // A part records its element as it renders, inside Solid's render, where writes need opting in.
    const [frame, setFrame] = createSignal<HTMLElement | undefined>(undefined, {
      ownedWrite: true,
    });
    const [title, setTitle] = createSignal<HTMLSpanElement | undefined>(undefined, {
      ownedWrite: true,
    });
    const [toolbar, setToolbar] = createSignal<HTMLElement | undefined>(undefined, {
      ownedWrite: true,
    });
    const [viewport, setViewport] = createSignal<HTMLDivElement | undefined>(undefined, {
      ownedWrite: true,
    });
    const refs = Object.freeze({ frame, title, toolbar, viewport });
    const ids = createMemo(() => createCalendarPartIds(instanceId()));

    const meta = createMemo(
      (): CalendarMeta<TEvent, TResource, TViewDef, TEventId, TResourceId> => {
        const current = model();
        return Object.freeze({
          activeView: current.activeDefinition,
          diagnostics: current.diagnostics,
          environment: current.environment,
          eventSnapshot: current.visibleEvents,
          ids: ids(),
          instanceId: instanceId(),
          label: props.label,
          refs,
          resources: current.resources,
          views: config.views,
        });
      },
      { equals: sameMeta },
    );
    const view = createMemo(() => model().activeView as CalendarActiveView<AnyCalendarView> | null);
    const visibleDates = createMemo(() => view()?.range ?? null, { equals: sameVisibleRange });

    // The same object for the root's lifetime: each command runs the committed model's action,
    // as the primitive's api does, so a handler never holds a stale one.
    const first = untrack(model).actions;
    const actions = {} as Record<string, unknown>;
    for (const key of Object.keys(first)) {
      actions[key] = (...args: unknown[]) =>
        (
          (runtime.committed() ?? untrack(model)).actions as unknown as Record<
            string,
            (...args: unknown[]) => unknown
          >
        )[key]!(...args);
    }

    const value: CalendarRootValue = {
      actions: Object.freeze(actions) as unknown as CalendarRootValue["actions"],
      handle: handle as unknown as CalendarRootValue["handle"],
      meta: meta as unknown as CalendarRootValue["meta"],
      model: model as unknown as CalendarRootValue["model"],
      runtime: runtime as unknown as CalendarRootValue["runtime"],
      setRef: {
        frame: setFrame,
        title: (element) => setTitle(element as HTMLSpanElement | undefined),
        toolbar: setToolbar,
        viewport: (element) => setViewport(element as HTMLDivElement | undefined),
      },
      source: source as unknown as CalendarRootValue["source"],
      state: state as unknown as CalendarRootValue["state"],
      view,
      visibleRange: visibleDates,
    };
    return root.provide(value, () => props.children);
  };
}
