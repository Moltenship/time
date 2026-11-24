import {
  applyEventOverlay,
  createAnnotationSnapshot,
  createAvailabilitySnapshot,
  createEventSnapshotCache,
  createEventTransactions,
  createResourceTree,
  readOnlyPolicy,
  resolveSecondaryTimeZones,
  resolveViewInstantRange,
  resolveViewLoadRange,
  type AnnotationSnapshot,
  type AnnotationSnapshotIssue,
  type AvailabilityIssue,
  type AvailabilitySnapshot,
  type CalendarAnnotation,
  type CalendarAnnotationSource,
  type CalendarAvailability,
  type CalendarEnvironment,
  type CalendarEnvironmentBase,
  type CalendarEventChangeHandler,
  type CalendarEventProposal,
  type CalendarFocus,
  type CalendarPendingChanges,
  type CalendarPendingPlacements,
  type CalendarPolicy,
  type CalendarProposalDetail,
  type CalendarProposalOutcome,
  type CalendarResource,
  type CalendarSecondaryTimeZone,
  type CalendarSelection,
  type CalendarTransactionResult,
  type CalendarWeekRules,
  type EventAdapter,
  type EventId,
  type EventSnapshot,
  type EventSnapshotIssue,
  type EventTransactions,
  type InvalidCalendarEventPolicy,
  type ResourceId,
  type ResourceTree,
  type SecondaryTimeZoneIssue,
} from "@moltenship/calendar-core";
import type { CalendarClock, PlainDateInterval } from "@moltenship/calendar-temporal";
import { dispatch, type ChangeSource } from "@ui-sdk/core";

import { createAnnouncerChannel, type AnnouncerChannel } from "./announcer-channel";
import type {
  CalendarDiagnostic,
  CalendarSemanticActions,
  CalendarVisibleRange,
} from "./calendar-types";
import { systemClock } from "./clock";
import { createDraftStore, type DraftStore } from "./draft-store";
import {
  sameAvailability,
  sameElements,
  sameInstant,
  samePlainDate,
  sameRange,
  sameSecondaryTimeZones,
  sameWeekRules,
  shallowEqual,
} from "./equality";
import type { AnyPendingChanges, CalendarInteractionRuntime } from "./interaction";
import { createKeyboardSessionStore, type KeyboardSessionStore } from "./keyboard-store";
import { createMemoCell, createStableCell } from "./memo";
import { reportCallbackError } from "./report-error";
import {
  createCalendarStore,
  getCalendarStoreInternals,
  mergeControlledState,
  type CalendarRootStoreBinding,
} from "./store";
import type {
  AnyCalendarState,
  CalendarControlledState,
  CalendarPublicState,
  CalendarStateChangeHandlers,
  CalendarStateSource,
  CalendarRootStore,
  CalendarStore,
  CalendarStoreOptions,
} from "./types";
import {
  resolveViewOptions,
  type AnyCalendarViewDefinition,
  type CalendarActiveView,
  type CalendarViewOptionsMap,
} from "./views";

/** What a runtime is made from: the factory's adapter, its policy for invalid events, its views. */
export interface CalendarRuntimeConfig<
  TEvent,
  TViewDef extends AnyCalendarViewDefinition,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly eventAdapter: EventAdapter<TEvent, TEventId, TResourceId>;
  readonly invalidEventPolicy?: InvalidCalendarEventPolicy;
  readonly views: readonly TViewDef[];
}

/** The store a root reads its state from, bound to its controlled slices. */
export interface CalendarRuntimeConnection<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly binding: CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>;
  /** The controlled slices, the same object while their values hold. */
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  /** The store's state with the controlled slices laid over it; subscribe and read state here. */
  readonly source: CalendarStateSource<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;
  readonly store: CalendarStore<TView, TSelection, TFocus, TResourceId>;
}

export interface CalendarRuntimeConnectOptions<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  /** The defaults of the store the root owns, read once, when it has no `store` of its own. */
  readonly defaults: () => CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>;
  readonly store?: CalendarRootStore<TView, TSelection, TFocus, TResourceId>;
}

/** What changes at runtime beside the root's state: pending changes and a keyboard preview. */
export interface CalendarRuntimeOverlay<TEventId extends EventId, TResourceId extends ResourceId> {
  readonly pending: CalendarPendingPlacements<TEventId, TResourceId>;
  readonly preview: CalendarPendingPlacements<TEventId, TResourceId>;
}

/** Everything a root derives its model from: its props, and what the adapter subscribed to. */
export interface CalendarRuntimeInputs<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarViewDefinition,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  /** Whether an agent may delete events; without it the engine refuses an agent's delete. */
  readonly allowAgentDelete?: boolean;
  readonly annotationSources?: readonly CalendarAnnotationSource[];
  readonly annotations?: readonly CalendarAnnotation<unknown, TResourceId>[];
  readonly availability?: CalendarAvailability;
  readonly clock?: CalendarClock;
  readonly connection: CalendarRuntimeConnection<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly direction?: CalendarEnvironment["direction"];
  readonly disambiguation?: CalendarEnvironment["disambiguation"];
  /** The application's events as an array; an adapter reads an event source's current one. */
  readonly events: readonly TEvent[];
  readonly handlers: CalendarStateChangeHandlers<TViewDef["name"], TSelection, TFocus, TResourceId>;
  /** The clock's latest sample, for `today`; `null` while server rendering and hydrating. */
  readonly instant: Temporal.Instant | null;
  readonly locale: Intl.Locale | string;
  readonly now?: Temporal.Instant;
  readonly onDiagnosticsChange?: (
    diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[],
  ) => void;
  readonly onEventChange?: CalendarEventChangeHandler<TEvent, TEventId, TResourceId>;
  readonly onEventChangeResult?: (
    result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) => void;
  readonly onVisibleRangeChange?: (range: CalendarVisibleRange<TViewDef["name"]>) => void;
  /** `runtime.overlay`'s snapshot, read where the adapter subscribes to it. */
  readonly overlay: CalendarRuntimeOverlay<TEventId, TResourceId>;
  readonly policies?: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[];
  readonly resources?: readonly TResource[];
  readonly secondaryTimeZones?: readonly (CalendarSecondaryTimeZone | string)[];
  /** `connection.source`'s snapshot, read where the adapter subscribes to it. */
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  readonly viewOptions?: CalendarViewOptionsMap<TViewDef>;
  readonly weekRules: CalendarWeekRules;
}

/** The root's annotations and the sources it shows. */
export interface CalendarAnnotations {
  readonly snapshot: AnnotationSnapshot;
  readonly sources: readonly CalendarAnnotationSource[];
}

/** Everything a root shows, derived from its inputs; each part keeps its identity while it holds. */
export interface CalendarRuntimeModel<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarViewDefinition,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly actions: CalendarSemanticActions<
    TViewDef["name"],
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  /** The active view's definition; `undefined` while the active view is unregistered. */
  readonly activeDefinition: TViewDef | undefined;
  readonly activeView: CalendarActiveView<TViewDef> | null;
  readonly annotations: CalendarAnnotations;
  readonly availability: AvailabilitySnapshot;
  readonly diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[];
  readonly environment: CalendarEnvironment;
  /** The application's events, without pending changes. */
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly interaction: CalendarInteractionRuntime;
  /** The root has no `onEventChange`, so it rejects every change. */
  readonly isReadOnly: boolean;
  readonly resourceTree: ResourceTree;
  readonly resources: readonly TResource[];
  readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
  /** The state source views subscribe to; its identity changes with controlled values. */
  readonly source: CalendarStateSource<
    CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>
  >;
  readonly today: Temporal.PlainDate | null;
  /** The environment views get: `environment` without the clock. */
  readonly viewEnvironment: CalendarEnvironmentBase;
  /** The events views show: the application's, with pending changes and the keyboard's preview. */
  readonly visibleEvents: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly visibleRange: CalendarVisibleRange<TViewDef["name"]> | null;
}

/**
 * One calendar root's behavior without a framework. An adapter creates it once per root, feeds it
 * the latest inputs, and calls its effects at the moments their names give:
 *
 * 1. `connect` and `derive` while rendering; both are pure and return memoized values.
 * 2. `commit(model, inputs)` and `connection.binding.attach()` once a render commits, before
 *    anything can run a command (React: an insertion effect).
 * 3. `reconcile(model.eventSnapshot)` before the commit paints (React: a layout effect).
 * 4. `reportDiagnostics(model.diagnostics)` and `reportVisibleRange(model.visibleRange)` after it
 *    paints, each when its value changes.
 */
export interface CalendarRuntime<
  TEvent,
  TResource,
  TViewDef extends AnyCalendarViewDefinition,
  TSelection,
  TFocus,
  TEventId extends EventId,
  TResourceId extends ResourceId,
> {
  readonly announcements: AnnouncerChannel;
  /** Publishes a committed render: its handlers and controlled slices, its callbacks and model. */
  readonly commit: (
    model: CalendarRuntimeModel<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
    inputs: CalendarRuntimeInputs<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ) => void;
  /** The model of the last committed render, or the first derived one before any commits. */
  readonly committed: () =>
    | CalendarRuntimeModel<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>
    | undefined;
  /** The store the root reads, bound to its controlled slices; the same object while they hold. */
  readonly connect: (
    options: CalendarRuntimeConnectOptions<TViewDef["name"], TSelection, TFocus, TResourceId>,
  ) => CalendarRuntimeConnection<TViewDef["name"], TSelection, TFocus, TResourceId>;
  /** Derives the root's model, synchronously; parts that hold keep their identity. */
  readonly derive: (
    inputs: CalendarRuntimeInputs<
      TEvent,
      TResource,
      TViewDef,
      TSelection,
      TFocus,
      TEventId,
      TResourceId
    >,
  ) => CalendarRuntimeModel<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId>;
  readonly keyboard: KeyboardSessionStore;
  /** Pending changes and the keyboard's preview; the snapshot keeps its identity until either changes. */
  readonly overlay: CalendarStateSource<CalendarRuntimeOverlay<TEventId, TResourceId>>;
  /** The root's pending changes, for an adapter's `useCalendarPendingChanges`. */
  readonly pendingChanges: CalendarStateSource<
    CalendarPendingChanges<TEvent, TEventId, TResourceId>
  >;
  readonly pointerDraft: DraftStore;
  /**
   * The model's `proposeEventChange` from the last commit, returning the outcome itself when it
   * is known at once: a policy's synchronous refusal, a synchronous save, or a proposal that can't
   * apply. Otherwise the pending proposal, whose `result` never rejects. The policies run once and
   * `onEventChangeResult` hears every proposal once, when it settles. An agent's step uses it: the
   * bridge reports a returned promise only as pending, and never sees how it ends.
   */
  readonly proposeNow: (
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail?: CalendarProposalDetail,
  ) => CalendarProposalOutcome<TEvent, TEventId, TResourceId>;
  /**
   * The state the latest commands asked for, with the dates its view covers then, before a
   * framework renders it: what an agent reads back in the step after a command. `undefined` before
   * the first derive; `range` is `null` while the view is unregistered.
   */
  readonly latest: () =>
    | {
        readonly range: PlainDateInterval | null;
        readonly state: CalendarPublicState<TViewDef["name"], TSelection, TFocus, TResourceId>;
      }
    | undefined;
  /** New events confirm resolved changes; call it before the commit that shows them paints. */
  readonly reconcile: (eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>) => void;
  /** Calls the committed `onDiagnosticsChange` with `diagnostics`. */
  readonly reportDiagnostics: (
    diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[],
  ) => void;
  /**
   * Calls the committed `onVisibleRangeChange` once per visible range: calling it again for the
   * same range, as an effect that runs twice does, reports nothing.
   */
  readonly reportVisibleRange: (
    visibleRange: CalendarVisibleRange<TViewDef["name"]> | null,
  ) => void;
  readonly transactions: EventTransactions<TEvent, TEventId, TResourceId>;
  readonly views: readonly TViewDef[];
  readonly viewsByName: ReadonlyMap<string, TViewDef>;
}

type ViewOptionsOverrides = Readonly<Record<string, object | undefined>> | undefined;

type ProposeNow<TEvent, TEventId extends EventId, TResourceId extends ResourceId> = (
  proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
  detail?: CalendarProposalDetail,
) => CalendarProposalOutcome<TEvent, TEventId, TResourceId>;

interface CommittedInputs<TEvent, TEventId extends EventId, TResourceId extends ResourceId> {
  readonly allowAgentDelete: boolean | undefined;
  /** The view on screen. */
  readonly activeView: CalendarActiveView<AnyCalendarViewDefinition> | null;
  readonly availability: AvailabilitySnapshot;
  readonly environment: CalendarEnvironment;
  /** The application's events, without pending changes. */
  readonly eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>;
  readonly onDiagnosticsChange:
    | ((diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) => void)
    | undefined;
  readonly onEventChange: CalendarEventChangeHandler<TEvent, TEventId, TResourceId> | undefined;
  readonly onEventChangeResult:
    | ((
        result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
        detail: CalendarProposalDetail,
      ) => void)
    | undefined;
  readonly onVisibleRangeChange: ((range: CalendarVisibleRange<string>) => void) | undefined;
  readonly policies: readonly CalendarPolicy<TEvent, TEventId, TResourceId>[] | undefined;
  readonly resourceTree: ResourceTree;
  readonly viewOptions: ViewOptionsOverrides;
}

const noResources: readonly never[] = Object.freeze([]);
const noAnnotations: readonly never[] = Object.freeze([]);
const noSecondaryTimeZones: readonly never[] = Object.freeze([]);
/** A root without `onEventChange` is read-only, so its checks reject everything. */
const readOnlyRoot = () => ({ reason: "read-only", type: "reject" }) as const;
/** A read-only root's handler: its check rejects every change first, so this never runs. */
const noHandler = () => {
  throw new TypeError("calendar-root-is-read-only");
};
/** The detail of a proposal made without one, or with something that names no input. */
const apiInput: CalendarProposalDetail = Object.freeze({ input: "api" });
const agentInput: CalendarProposalDetail = Object.freeze({ input: "agent" });
const knownInputs: ReadonlySet<unknown> = new Set(["agent", "api", "keyboard", "pointer"]);

/**
 * The source ui-sdk gives a change made now, read the one way its public entries offer: an event
 * option `dispatch` calls with the details a change would get. While an agent's step runs, such as
 * a press on the application's own button, that is `"agent"`; the state handlers hear the same.
 * The probe is a handler of our own, so nothing else hears it and nothing changes.
 */
let probed: ChangeSource | undefined;
const sourceProbe = Object.freeze({
  options: () => probeOptions,
});
const probeOptions = Object.freeze({
  onSourceProbe: (_value: unknown, details: { readonly source: ChangeSource }) => {
    probed = details.source;
  },
});
function currentSource(): ChangeSource | undefined {
  probed = undefined;
  dispatch(sourceProbe, "onSourceProbe", null, { reason: "imperative" });
  return probed;
}

/**
 * The detail every listener hears. Anything an agent's step causes is the agent's, whatever the
 * caller passed, so a policy that refuses agents can't be stepped around by pressing a button;
 * the rest of the detail, such as a history's `history`, is kept.
 */
function detailOf(detail: CalendarProposalDetail | undefined): CalendarProposalDetail {
  if (detail?.input !== "agent" && currentSource() === "agent") {
    return detail === undefined ? agentInput : Object.freeze({ ...detail, input: "agent" });
  }
  return detail !== undefined && knownInputs.has(detail.input) ? detail : apiInput;
}

/**
 * An agent deletes only where the root allows it with `allowAgentDelete`, however it got there:
 * through the calendar's own action or a button of the application's it pressed. The application
 * hears the refusal like any other, through `onEventChangeResult`.
 */
const noAgentDeletes = ((change, { detail }) =>
  change.cause === "delete" && detail?.input === "agent"
    ? { reason: "agent-delete-not-allowed", type: "reject" }
    : { type: "accept" }) satisfies CalendarPolicy<unknown, EventId, ResourceId>;

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
        case "invalid-secondary-time-zone":
          return (
            other.code === "invalid-secondary-time-zone" &&
            other.issue.index === diagnostic.issue.index &&
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
  secondaryTimeZoneIssues: readonly SecondaryTimeZoneIssue[],
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
  for (const issue of secondaryTimeZoneIssues) {
    diagnostics.push(
      Object.freeze({ code: "invalid-secondary-time-zone", issue, severity: "error" }),
    );
  }
  return Object.freeze(diagnostics);
}

function sameControlledState(
  left: CalendarControlledState<string, unknown, unknown>,
  right: CalendarControlledState<string, unknown, unknown>,
): boolean {
  return (
    samePlainDate(left.anchorDate, right.anchorDate) &&
    (left.expandedResourceIds === right.expandedResourceIds ||
      (left.expandedResourceIds !== undefined &&
        right.expandedResourceIds !== undefined &&
        sameElements(left.expandedResourceIds, right.expandedResourceIds))) &&
    Object.is(left.focus, right.focus) &&
    Object.is(left.selection, right.selection) &&
    left.timeZone === right.timeZone &&
    left.view === right.view
  );
}

function createStateSource<TState extends AnyCalendarState>(
  store: CalendarStateSource<TState>,
  controlled: Partial<TState>,
): CalendarStateSource<TState> {
  let base: TState | undefined;
  let merged: TState | undefined;

  return Object.freeze({
    getSnapshot: () => {
      const next = store.getSnapshot();
      if (next !== base || merged === undefined) {
        base = next;
        merged = mergeControlledState(next, controlled);
      }
      return merged;
    },
    subscribe: store.subscribe,
  });
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
  viewsByName: ReadonlyMap<string, AnyCalendarViewDefinition>,
  committed: { readonly current: CommittedInputs<TEvent, TEventId, TResourceId> },
  transactions: EventTransactions<TEvent, TEventId, TResourceId>,
  readOnly: CalendarPolicy<TEvent, TEventId, TResourceId>,
): {
  readonly actions: CalendarSemanticActions<
    TView,
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  >;
  readonly proposeNow: ProposeNow<TEvent, TEventId, TResourceId>;
} {
  /** The policies every change runs through; a root without `onEventChange` rejects them all. */
  function policiesOf({
    allowAgentDelete,
    onEventChange,
    policies = [],
  }: CommittedInputs<TEvent, TEventId, TResourceId>) {
    if (onEventChange === undefined) return [readOnlyRoot];
    return allowAgentDelete === true
      ? [readOnly, ...policies]
      : [readOnly, noAgentDeletes as CalendarPolicy<TEvent, TEventId, TResourceId>, ...policies];
  }

  type Options = Parameters<typeof actions.setAnchorDate>[1];

  // Every command reads the latest requested state, so consecutive commands in one handler compose.
  function navigate(delta: number, options: Options) {
    const latest = read();
    const view = viewsByName.get(latest.view);
    if (view === undefined) return;
    const viewOptions = resolveViewOptions(view, committed.current.viewOptions?.[latest.view]);
    actions.setAnchorDate(view.strategy.navigate(latest.anchorDate, delta, viewOptions), options);
  }

  /** Proposes a change through the policies once, with the detail every listener hears. */
  function start(
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail: CalendarProposalDetail | undefined,
  ) {
    const { availability, eventSnapshot, onEventChange } = committed.current;
    // The detail as given, so a history knows its own proposals by `history`. Anything that
    // names no known input, as from a caller that passes on an index, is the app's own.
    const reported = detailOf(detail);
    const outcome = transactions.proposeNow(proposal, {
      availability,
      // Policies and the handler hear which input proposed the change, so an agent's is told
      // apart and can be refused in one place.
      detail: reported,
      onEventChange: onEventChange ?? noHandler,
      policies: policiesOf(committed.current),
      snapshot: eventSnapshot,
      timeZone: read().timeZone,
    });
    return { outcome, reported };
  }

  function report(
    result: CalendarTransactionResult<TEvent, TEventId, TResourceId>,
    detail: CalendarProposalDetail,
  ) {
    // The latest render's callback, even after the root unmounts, as the save may outlive it.
    try {
      committed.current.onEventChangeResult?.(result, detail);
    } catch (error) {
      reportCallbackError(error);
    }
    return result;
  }

  /**
   * `proposeEventChange` that answers at once when it can: what an agent's step returns before a
   * framework renders. The result callback hears every proposal once, when it settles.
   */
  function proposeNow(
    proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
    detail?: CalendarProposalDetail,
  ): CalendarProposalOutcome<TEvent, TEventId, TResourceId> {
    const { outcome, reported } = start(proposal, detail);
    if (outcome.status !== "pending") return report(outcome, reported);
    return Object.freeze({
      ...outcome,
      result: outcome.result.then((result) => report(result, reported)),
    });
  }

  const semantic: CalendarSemanticActions<
    TView,
    TSelection,
    TFocus,
    TResourceId,
    TEvent,
    TEventId
  > = Object.freeze({
    ...actions,
    checkEventChange(proposal, detail) {
      const { availability, eventSnapshot } = committed.current;
      return transactions.check(proposal, {
        availability,
        detail: detailOf(detail),
        policies: policiesOf(committed.current),
        snapshot: eventSnapshot,
        timeZone: read().timeZone,
      });
    },
    navigateNext: (options) => navigate(1, options),
    navigatePrevious: (options) => navigate(-1, options),
    navigateToday(options) {
      const { environment } = committed.current;
      const instant = environment.now ?? (environment.clock ?? systemClock).instant();
      actions.setAnchorDate(instant.toZonedDateTimeISO(read().timeZone).toPlainDate(), options);
    },
    proposeEventChange(proposal, detail) {
      const { outcome, reported } = start(proposal, detail);
      // A person's proposal resolves as it always has, after the outcome, which the result
      // callback hears first.
      return (outcome.status === "pending" ? outcome.result : Promise.resolve(outcome)).then(
        (result) => report(result, reported),
      );
    },
  });
  return { actions: semantic, proposeNow };
}

/**
 * The store defaults a root's props give, for `connect`'s `defaults`: a default wins over a
 * controlled value, and the first registered view stands in for a missing one.
 */
export function resolveCalendarStoreDefaults<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  props: {
    readonly anchorDate?: Temporal.PlainDate;
    readonly defaultAnchorDate?: Temporal.PlainDate;
    readonly defaultExpandedResourceIds?: readonly TResourceId[];
    readonly defaultFocus?: TFocus | null;
    readonly defaultSelection?: TSelection | null;
    readonly defaultTimeZone?: string;
    readonly defaultView?: TView;
    readonly timeZone?: string;
    readonly view?: TView;
  },
  views: readonly { readonly name: string }[],
): CalendarStoreOptions<TView, TSelection, TFocus, TResourceId> {
  const initialAnchorDate = props.defaultAnchorDate ?? props.anchorDate;
  const initialTimeZone = props.defaultTimeZone ?? props.timeZone;
  const initialView = props.defaultView ?? props.view ?? (views[0]?.name as TView | undefined);
  if (initialAnchorDate === undefined) throw new TypeError("calendar-root-requires-anchor-date");
  if (initialTimeZone === undefined) throw new TypeError("calendar-root-requires-time-zone");
  if (initialView === undefined) throw new TypeError("calendar-root-requires-view");
  return {
    defaultAnchorDate: initialAnchorDate,
    defaultExpandedResourceIds: props.defaultExpandedResourceIds,
    defaultFocus: props.defaultFocus,
    defaultSelection: props.defaultSelection,
    defaultTimeZone: initialTimeZone,
    defaultView: initialView,
  };
}

export function createCalendarRuntime<
  TEvent,
  TResource = unknown,
  TViewDef extends AnyCalendarViewDefinition = AnyCalendarViewDefinition,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TEventId extends EventId = EventId,
  TResourceId extends ResourceId = ResourceId,
>(
  config: CalendarRuntimeConfig<TEvent, TViewDef, TEventId, TResourceId>,
): CalendarRuntime<TEvent, TResource, TViewDef, TSelection, TFocus, TEventId, TResourceId> {
  type View = TViewDef["name"];
  type State = CalendarPublicState<View, TSelection, TFocus, TResourceId>;
  type Store = CalendarStore<View, TSelection, TFocus, TResourceId>;
  type Binding = CalendarRootStoreBinding<View, TSelection, TFocus, TResourceId>;
  type Connection = CalendarRuntimeConnection<View, TSelection, TFocus, TResourceId>;
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
  type Overlay = CalendarRuntimeOverlay<TEventId, TResourceId>;

  const views = Object.freeze([...config.views]);
  const viewsByName: ReadonlyMap<string, TViewDef> = new Map(
    views.map((view) => [view.name, view]),
  );
  const readOnly = readOnlyPolicy<TEvent, TEventId, TResourceId>();
  const snapshotCache = createEventSnapshotCache(config.eventAdapter, {
    invalidEventPolicy: config.invalidEventPolicy,
  });
  const transactions = createEventTransactions<TEvent, TEventId, TResourceId>();
  const keyboard = createKeyboardSessionStore();
  const pointerDraft = createDraftStore();
  // The server and hydration read the empty map, also when part of the tree hydrates after a
  // change started.
  const noChanges = transactions.getPendingChanges();
  const pendingChanges = Object.freeze({
    getServerSnapshot: () => noChanges,
    getSnapshot: transactions.getPendingChanges,
    subscribe: transactions.subscribe,
  });

  let overlaySnapshot: Overlay = Object.freeze({
    pending: transactions.getPending(),
    preview: keyboard.getPreview() as CalendarPendingPlacements<TEventId, TResourceId>,
  });
  const overlay: CalendarStateSource<Overlay> = Object.freeze({
    getSnapshot: () => {
      const pending = transactions.getPending();
      const preview = keyboard.getPreview() as CalendarPendingPlacements<TEventId, TResourceId>;
      if (pending !== overlaySnapshot.pending || preview !== overlaySnapshot.preview) {
        overlaySnapshot = Object.freeze({ pending, preview });
      }
      return overlaySnapshot;
    },
    subscribe: (listener: () => void) => {
      const stops = [transactions.subscribe(listener), keyboard.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
  });

  /** Each model's actions' `proposeNow`, which the runtime's own reads from the last commit. */
  const proposers = new WeakMap<object, ProposeNow<TEvent, TEventId, TResourceId>>();

  // Callbacks and options are read from the last commit, so inline values need no memoization.
  let committedInputs: { current: CommittedInputs<TEvent, TEventId, TResourceId> } | undefined;
  let committedModel: Model | undefined;
  let reportedRange: CalendarVisibleRange<View> | null = null;
  const announcements = createAnnouncerChannel(
    () => committedInputs!.current.environment,
    () => committedInputs!.current.resourceTree,
  );

  // Connection cells.
  let ownedStore: Store | undefined;
  const bindingCell = createMemoCell<Binding>();
  const controlledCell =
    createStableCell<CalendarControlledState<View, TSelection, TFocus, TResourceId>>(
      sameControlledState,
    );
  const sourceCell = createMemoCell<CalendarStateSource<State>>();
  const connectionCell = createMemoCell<Connection>();
  const uncommittedBinding = Object.freeze({ controlled: {}, handlers: {} });

  // Derivation cells, one per `useMemo` or stable value a component would hold.
  const locale = createStableCell(sameLocale);
  const weekRules = createStableCell(sameWeekRules);
  const now = createStableCell(sameInstant);
  const secondaryInput = createStableCell(sameSecondaryTimeZones);
  const secondaryCell = createMemoCell<ReturnType<typeof resolveSecondaryTimeZones>>();
  const viewEnvironmentCell = createMemoCell<CalendarEnvironmentBase>();
  const environmentCell = createMemoCell<CalendarEnvironment>();
  const eventsInput = createStableCell<readonly TEvent[]>(sameElements);
  const eventSnapshotCell = createMemoCell<EventSnapshot<TEvent, TEventId, TResourceId>>();
  const visibleEventsCell = createMemoCell<EventSnapshot<TEvent, TEventId, TResourceId>>();
  const resourcesInput = createStableCell<readonly TResource[]>(sameElements);
  const resourceTreeCell = createMemoCell<ResourceTree>();
  const expandedInput = createStableCell<readonly TResourceId[]>(sameElements);
  const annotationsInput =
    createStableCell<readonly CalendarAnnotation<unknown, TResourceId>[]>(sameElements);
  const annotationSnapshotCell = createMemoCell<AnnotationSnapshot>();
  const annotationSourcesInput =
    createStableCell<readonly CalendarAnnotationSource[]>(sameElements);
  const annotationsCell = createMemoCell<CalendarAnnotations>();
  const availabilityInput = createStableCell<CalendarAvailability | undefined>(sameAvailability);
  const availabilityCell = createMemoCell<AvailabilitySnapshot>();
  const optionsInput = createStableCell<unknown>(shallowEqual);
  const rangeInput = createStableCell(sameRange);
  const loadRangeInput = createStableCell(sameRange);
  const todayInput = createStableCell<Temporal.PlainDate | null>(samePlainDate);
  const visibleRangeCell = createMemoCell<CalendarVisibleRange<View> | null>();
  const activeViewCell = createMemoCell<CalendarActiveView<TViewDef> | null>();
  const diagnosticsInput = createStableCell<readonly CalendarDiagnostic<TEvent, TEventId>[]>(
    sameDiagnostics as (
      left: readonly CalendarDiagnostic<TEvent, TEventId>[],
      right: readonly CalendarDiagnostic<TEvent, TEventId>[],
    ) => boolean,
  );
  const actionsCell = createMemoCell<Model["actions"]>();
  const interactionCell = createMemoCell<CalendarInteractionRuntime>();
  const modelCell = createMemoCell<Model>();

  function connect({
    controlled: controlledInput,
    defaults,
    store: injected,
  }: CalendarRuntimeConnectOptions<View, TSelection, TFocus, TResourceId>): Connection {
    if (injected === undefined) ownedStore ??= createCalendarStore(defaults());
    // A store with the default resource IDs, on a calendar without resources, never holds one.
    const store =
      (injected as CalendarStore<View, TSelection, TFocus, TResourceId> | undefined) ?? ownedStore!;
    const internals = getCalendarStoreInternals(store);
    const controlled = controlledCell(controlledInput);
    // Commands run only after a commit, and every commit publishes its render's props first.
    const binding = bindingCell([internals], () => internals.bind(uncommittedBinding));
    const source = sourceCell([controlled, store], () => createStateSource(store, controlled));
    return connectionCell([binding, controlled, source, store], () =>
      Object.freeze({ binding, controlled, source, store }),
    );
  }

  function committedOf(
    inputs: Inputs,
    model: Model,
  ): CommittedInputs<TEvent, TEventId, TResourceId> {
    return {
      activeView: model.activeView as CalendarActiveView<AnyCalendarViewDefinition> | null,
      allowAgentDelete: inputs.allowAgentDelete,
      availability: model.availability,
      environment: model.environment,
      eventSnapshot: model.eventSnapshot,
      onDiagnosticsChange: inputs.onDiagnosticsChange,
      onEventChange: inputs.onEventChange,
      onEventChangeResult: inputs.onEventChangeResult,
      onVisibleRangeChange: inputs.onVisibleRangeChange as
        | ((range: CalendarVisibleRange<string>) => void)
        | undefined,
      policies: inputs.policies,
      resourceTree: model.resourceTree,
      viewOptions: inputs.viewOptions as ViewOptionsOverrides,
    };
  }

  function derive(inputs: Inputs): Model {
    const { connection, state } = inputs;
    const stableLocale = locale(inputs.locale);
    const stableWeekRules = weekRules(inputs.weekRules);
    const stableNow = now(inputs.now);
    const stableSecondary = secondaryInput(inputs.secondaryTimeZones ?? noSecondaryTimeZones);
    const secondary = secondaryCell([stableSecondary], () =>
      resolveSecondaryTimeZones(stableSecondary),
    );
    const direction = inputs.direction ?? "ltr";
    const disambiguation = inputs.disambiguation ?? "compatible";
    const viewEnvironment = viewEnvironmentCell(
      [direction, disambiguation, secondary.zones, stableLocale, stableWeekRules, state.timeZone],
      () =>
        Object.freeze({
          direction,
          disambiguation,
          locale: stableLocale,
          secondaryTimeZones: secondary.zones,
          timeZone: state.timeZone,
          weekRules: stableWeekRules,
        }),
    );
    const { clock } = inputs;
    const environment = environmentCell([clock, stableNow, viewEnvironment], () => {
      if (stableNow !== undefined) return Object.freeze({ ...viewEnvironment, now: stableNow });
      if (clock !== undefined) return Object.freeze({ ...viewEnvironment, clock });
      return viewEnvironment;
    });

    // An array and a source share the cache, so switching between them reuses what it can, and
    // pending changes reconcile against the new events as against any others.
    const stableEvents = eventsInput(inputs.events);
    const eventSnapshot = eventSnapshotCell([stableEvents], () =>
      snapshotCache.getSnapshot(stableEvents),
    );
    const { pending, preview } = inputs.overlay;
    // Pending changes and a keyboard gesture's preview patch only their events at query time; the
    // snapshot's indexes are reused.
    const visibleEvents = visibleEventsCell([eventSnapshot, pending, preview], () =>
      applyEventOverlay(applyEventOverlay(eventSnapshot, pending), preview),
    );
    const resources = resourcesInput(inputs.resources ?? noResources);
    // Built once per resource list, so expanding and collapsing reuse it. Resource views read
    // resources as `CalendarResource`s.
    const resourceTree = resourceTreeCell([resources], () =>
      createResourceTree(resources as unknown as readonly CalendarResource[]),
    );
    const expandedResourceIds = expandedInput(state.expandedResourceIds);
    // Annotations get their own snapshot, so they never invalidate event projections.
    const annotationList = annotationsInput(inputs.annotations ?? noAnnotations);
    const annotationSnapshot = annotationSnapshotCell([annotationList], () =>
      createAnnotationSnapshot(annotationList),
    );
    const annotationSources = annotationSourcesInput(inputs.annotationSources ?? noAnnotations);
    const annotations = annotationsCell([annotationSnapshot, annotationSources], () =>
      Object.freeze({ snapshot: annotationSnapshot, sources: annotationSources }),
    );
    // Working hours resolve each date once and cache it, for every view and policy check.
    const availabilityRules = availabilityInput(inputs.availability);
    const availability = availabilityCell([availabilityRules, resources, state.timeZone], () =>
      createAvailabilitySnapshot({
        availability: availabilityRules,
        resources: resources as unknown as readonly CalendarResource[],
        timeZone: state.timeZone,
      }),
    );

    const activeDefinition = viewsByName.get(state.view);
    const viewOverrides = inputs.viewOptions as ViewOptionsOverrides;
    const options = optionsInput(
      activeDefinition === undefined
        ? undefined
        : resolveViewOptions(activeDefinition, viewOverrides?.[state.view]),
    );
    const range = rangeInput(
      activeDefinition?.strategy.getRange(state.anchorDate, viewEnvironment, options),
    );
    const loadRange = loadRangeInput(
      activeDefinition === undefined || range === undefined
        ? undefined
        : resolveViewLoadRange(
            activeDefinition.strategy,
            state.anchorDate,
            viewEnvironment,
            options,
            range,
          ),
    );
    const { instant } = inputs;
    const today = todayInput(
      instant === null ? null : instant.toZonedDateTimeISO(state.timeZone).toPlainDate(),
    );
    // Ranges and their instants change together, so range observers see one value per change.
    const visibleRange = visibleRangeCell(
      [activeDefinition, loadRange, range, viewEnvironment.timeZone],
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
    );
    const activeView = activeViewCell(
      [
        activeDefinition,
        options,
        visibleRange,
        resourceTree,
        expandedResourceIds,
        today,
        viewEnvironment,
        visibleEvents,
      ],
      () => {
        if (activeDefinition === undefined || visibleRange === null) return null;
        const { instantRange, loadInstantRange, loadRange, range } = visibleRange;
        return Object.freeze({
          definition: activeDefinition,
          environment: viewEnvironment,
          events: visibleEvents,
          instantRange,
          loadInstantRange,
          loadRange,
          options,
          projection: activeDefinition.strategy.project({
            environment: viewEnvironment,
            expandedResourceIds,
            instantRange,
            loadRange,
            options,
            range,
            resources: resourceTree,
            snapshot: visibleEvents,
            today,
          }),
          range,
          view: activeDefinition.name,
        }) as unknown as CalendarActiveView<TViewDef>;
      },
    );

    const diagnostics = diagnosticsInput(
      collectDiagnostics(
        state.view,
        activeDefinition !== undefined,
        eventSnapshot.issues,
        annotationSnapshot.issues,
        availability.issues,
        secondary.issues,
      ),
    );

    // The first render's inputs stand in for a commit until one happens, as a ref's initial value.
    committedInputs ??= {
      current: {
        activeView: activeView as CalendarActiveView<AnyCalendarViewDefinition> | null,
        allowAgentDelete: inputs.allowAgentDelete,
        availability,
        environment,
        eventSnapshot,
        onDiagnosticsChange: inputs.onDiagnosticsChange,
        onEventChange: inputs.onEventChange,
        onEventChangeResult: inputs.onEventChangeResult,
        onVisibleRangeChange: inputs.onVisibleRangeChange as
          | ((range: CalendarVisibleRange<string>) => void)
          | undefined,
        policies: inputs.policies,
        resourceTree,
        viewOptions: viewOverrides,
      },
    };
    const committed = committedInputs;
    const { binding, source } = connection;
    const actions = actionsCell([binding], () => {
      const created = createSemanticActions<
        View,
        TSelection,
        TFocus,
        TEvent,
        TEventId,
        TResourceId
      >(binding, viewsByName, committed, transactions, readOnly);
      proposers.set(created.actions, created.proposeNow);
      return created.actions;
    });
    const isReadOnly = inputs.onEventChange === undefined;
    const interaction = interactionCell([actions, binding, isReadOnly, source], () =>
      Object.freeze({
        actions,
        announcements,
        changes: pendingChanges as CalendarStateSource<AnyPendingChanges>,
        isReadOnly,
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
        read: binding.read as () => AnyCalendarState,
        requests: binding.subscribeRequests,
        source: source as CalendarStateSource<AnyCalendarState>,
      }),
    );

    const model = modelCell(
      [
        actions,
        activeDefinition,
        activeView,
        annotations,
        availability,
        diagnostics,
        environment,
        eventSnapshot,
        interaction,
        isReadOnly,
        resourceTree,
        resources,
        source,
        state,
        today,
        viewEnvironment,
        visibleEvents,
        visibleRange,
      ],
      () =>
        Object.freeze({
          actions,
          activeDefinition,
          activeView,
          annotations,
          availability,
          diagnostics,
          environment,
          eventSnapshot,
          interaction,
          isReadOnly,
          resourceTree,
          resources,
          source,
          state,
          today,
          viewEnvironment,
          visibleEvents,
          visibleRange,
        }),
    );
    committedModel ??= model;
    return model;
  }

  return Object.freeze({
    announcements,
    commit(model: Model, inputs: Inputs) {
      inputs.connection.binding.commit({
        controlled: inputs.connection.controlled,
        handlers: inputs.handlers,
      });
      const record = committedOf(inputs, model);
      if (committedInputs === undefined) committedInputs = { current: record };
      else committedInputs.current = record;
      committedModel = model;
    },
    committed: () => committedModel,
    connect,
    derive,
    keyboard,
    overlay,
    pendingChanges,
    pointerDraft,
    proposeNow(
      proposal: CalendarEventProposal<TEventId, TResourceId, TEvent>,
      detail?: CalendarProposalDetail,
    ) {
      const propose =
        committedModel === undefined ? undefined : proposers.get(committedModel.actions);
      if (propose === undefined) throw new Error("calendar-runtime-before-first-derive");
      return propose(proposal, detail);
    },
    latest() {
      const model = committedModel;
      if (model === undefined) return undefined;
      const state = model.interaction.read() as State;
      const definition = viewsByName.get(state.view);
      if (definition === undefined) return Object.freeze({ range: null, state });
      const environment = { ...model.viewEnvironment, timeZone: state.timeZone };
      const options = resolveViewOptions(
        definition,
        committedInputs?.current.viewOptions?.[state.view],
      );
      return Object.freeze({
        range: definition.strategy.getRange(state.anchorDate, environment, options),
        state,
      });
    },
    reconcile: (eventSnapshot: EventSnapshot<TEvent, TEventId, TResourceId>) =>
      transactions.reconcile(eventSnapshot),
    reportDiagnostics(diagnostics: readonly CalendarDiagnostic<TEvent, TEventId>[]) {
      committedInputs?.current.onDiagnosticsChange?.(diagnostics);
    },
    reportVisibleRange(visibleRange: CalendarVisibleRange<View> | null) {
      // After the commit that shows a range, so loading its events never delays it; new events and
      // other updates don't repeat it. Calls again for the same range, as effects that run twice
      // under Strict Mode or when a hidden Activity is revealed, don't report it twice.
      if (visibleRange === null || visibleRange === reportedRange) return;
      reportedRange = visibleRange;
      committedInputs?.current.onVisibleRangeChange?.(visibleRange);
    },
    transactions,
    views,
    viewsByName,
  });
}
