import type { CalendarFocus, CalendarSelection, ResourceId } from "@moltenship/calendar-core";
import { dispatch } from "@ui-sdk/core";

import { sameElements, samePlainDate } from "./equality";
import { createListeners } from "./listeners";
import type {
  CalendarActions,
  CalendarCommandOptions,
  CalendarControlledState,
  CalendarPublicState,
  CalendarStateChangeHandlers,
  CalendarStateSlice,
  CalendarStore,
  CalendarStoreOptions,
} from "./types";

export interface CalendarStoreBinding<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId>;
  readonly handlers: CalendarStateChangeHandlers<TView, TSelection, TFocus, TResourceId>;
}

/** One root's view of a shared store: its controlled slices, handlers, and pending requests. */
export interface CalendarRootStoreBinding<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  /** Commands that honor this root's controlled slices and handlers. */
  readonly actions: CalendarActions<TView, TSelection, TFocus, TResourceId>;
  /** Routes `store.actions` through this root until the cleanup runs; the latest mounted root wins. */
  readonly attach: () => () => void;
  /** Publishes the root's committed props, settling requests for slices whose owner changed them. */
  readonly commit: (binding: CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>) => void;
  /**
   * The latest requested state. A controlled change requested since the last commit is visible
   * here before its owner commits it, so consecutive commands in one event handler compose.
   */
  readonly read: () => CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  /**
   * Calls `listener` with every command, even one that asks for the value a slice already has,
   * as Today does when the view only looks as if it had moved. Returns the unsubscribe function.
   */
  readonly subscribeRequests: (listener: CalendarRequestListener) => () => void;
}

/** A command a root received: the slice it asks to change, and the value it asks for. */
export type CalendarRequestListener = (slice: CalendarStateSlice, value: unknown) => void;

export interface CalendarStoreInternals<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly bind: (
    binding: CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>,
  ) => CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>;
}

const handlerNames = Object.freeze({
  anchorDate: "onAnchorDateChange",
  expandedResourceIds: "onExpandedResourceIdsChange",
  focus: "onFocusChange",
  selection: "onSelectionChange",
  timeZone: "onTimeZoneChange",
  view: "onViewChange",
} satisfies Record<CalendarStateSlice, `on${string}Change`>);

/** The six slices, in a fixed order. */
export const calendarStateSlices = Object.keys(handlerNames) as readonly CalendarStateSlice[];

// oxlint-disable-next-line typescript/no-explicit-any -- the registry stores every store variant.
const storeInternals = new WeakMap<object, CalendarStoreInternals<any, any, any, any>>();

function uniqueResourceIds<TResourceId extends ResourceId>(
  resourceIds: readonly TResourceId[],
): readonly TResourceId[] {
  return Object.freeze([...new Set(resourceIds)]);
}

/** Dates by value and resource lists by element; everything else by identity. */
export function sameSliceValue(
  slice: CalendarStateSlice,
  previous: unknown,
  next: unknown,
): boolean {
  if (slice === "anchorDate") {
    return samePlainDate(previous as Temporal.PlainDate, next as Temporal.PlainDate);
  }
  if (slice === "expandedResourceIds") {
    return sameElements(previous as readonly ResourceId[], next as readonly ResourceId[]);
  }
  return Object.is(previous, next);
}

/** Overlays every defined controlled slice on the uncontrolled state. */
export function mergeControlledState<TState extends CalendarPublicState<string, unknown, unknown>>(
  state: TState,
  controlled: Partial<TState> | undefined,
): TState {
  if (controlled === undefined) return state;
  const overlay = calendarStateSlices.filter((slice) => controlled[slice] !== undefined);
  if (overlay.length === 0) return state;
  const merged = { ...state };
  for (const slice of overlay) Object.assign(merged, { [slice]: controlled[slice] });
  return Object.freeze(merged);
}

export function getCalendarStoreInternals<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  store: CalendarStore<TView, TSelection, TFocus, TResourceId>,
): CalendarStoreInternals<TView, TSelection, TFocus, TResourceId> {
  const internals = storeInternals.get(store);
  if (internals === undefined) {
    throw new TypeError("calendar-store-not-created-by-createCalendarStore");
  }
  return internals;
}

export function createCalendarStore<
  TView extends string = string,
  TSelection = CalendarSelection,
  TFocus = CalendarFocus,
  TResourceId extends ResourceId = ResourceId,
>(
  options: CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>,
): CalendarStore<TView, TSelection, TFocus, TResourceId> {
  type State = CalendarPublicState<TView, TSelection, TFocus, TResourceId>;
  type Binding = CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>;
  type Dispatch = <TSlice extends CalendarStateSlice>(
    slice: TSlice,
    next: State[TSlice],
    options: CalendarCommandOptions | undefined,
  ) => void;

  let state: State = Object.freeze({
    anchorDate: options.defaultAnchorDate,
    expandedResourceIds: uniqueResourceIds(options.defaultExpandedResourceIds ?? []),
    focus: options.defaultFocus ?? null,
    selection: options.defaultSelection ?? null,
    timeZone: options.defaultTimeZone,
    view: options.defaultView,
  });
  const listeners = createListeners();
  const mountedRoots: CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId>[] = [];
  const notify = () => {
    listeners.notify();
  };

  function createActions(run: Dispatch): CalendarActions<TView, TSelection, TFocus, TResourceId> {
    return Object.freeze({
      setAnchorDate: (next, options) => run("anchorDate", next, options),
      setExpandedResourceIds: (next, options) => run("expandedResourceIds", next, options),
      setFocus: (next, options) => run("focus", next, options),
      setSelection: (next, options) => run("selection", next, options),
      setTimeZone: (next, options) => run("timeZone", next, options),
      setView: (next, options) => run("view", next, options),
    });
  }

  function bind(
    initial: Binding,
  ): CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId> {
    let current = initial;
    let pending: Partial<State> | undefined;
    /**
     * Values the owners of controlled slices were told about and have not committed: an owner
     * that defers or declines a change still holds it.
     */
    let unsettled: Partial<State> = {};
    // An entry per subscription, as `createListeners` keeps them.
    const requestListeners = new Set<{ readonly listener: CalendarRequestListener }>();
    // ui-sdk's `dispatch` reads the handler from here when a command reaches it, so it always
    // calls the latest committed one.
    const handlerContext = Object.freeze({ options: () => current.handlers });

    const read = () =>
      mergeControlledState(mergeControlledState(state, current.controlled), pending);

    const run: Dispatch = (slice, requested, options) => {
      const next =
        slice === "expandedResourceIds"
          ? (uniqueResourceIds(requested as readonly TResourceId[]) as typeof requested)
          : requested;
      for (const entry of requestListeners) entry.listener(slice, next);
      const previous = read()[slice];
      const controlled = current.controlled[slice] !== undefined;
      if (sameSliceValue(slice, previous, next)) {
        // Asking for the owner's value again still tells an owner holding another change it
        // was told about, so it can drop that change.
        const told = unsettled[slice];
        if (!controlled || told === undefined || sameSliceValue(slice, told, next)) return;
      }

      const before = state;
      let written: State | undefined;
      if (controlled) {
        if (pending === undefined) queueMicrotask(() => (pending = undefined));
        pending = { ...pending, [slice]: next };
        const settled = sameSliceValue(slice, current.controlled[slice], next);
        unsettled = { ...unsettled, [slice]: settled ? undefined : next };
      } else {
        written = Object.freeze({ ...state, [slice]: next });
        state = written;
        notify();
      }

      // The handler hears the change after it is written, as it always has, so it reads the new
      // state; `cancel()` then puts an uncontrolled slice back, unless the handler moved that
      // slice on. Only that slice: what the handler wrote to the others stays.
      const canceled = dispatch(handlerContext, handlerNames[slice], next, {
        controlled,
        ...(options?.event === undefined ? {} : { event: options.event }),
        previous,
        reason: options?.reason ?? "imperative",
        slice,
        ...(options?.source === undefined ? {} : { source: options.source }),
      });
      if (canceled && written !== undefined && Object.is(state[slice], written[slice])) {
        state = Object.freeze({ ...state, [slice]: before[slice] });
        notify();
      }
    };

    const binding: CalendarRootStoreBinding<TView, TSelection, TFocus, TResourceId> = Object.freeze(
      {
        actions: createActions(run),
        attach: () => {
          mountedRoots.push(binding);
          return () => {
            const index = mountedRoots.lastIndexOf(binding);
            if (index !== -1) mountedRoots.splice(index, 1);
          };
        },
        commit: (next: Binding) => {
          const previous = current;
          current = next;
          // An owner that commits a change, or stops controlling the slice, holds nothing it was told.
          for (const slice of calendarStateSlices) {
            const committed = next.controlled[slice];
            if (
              unsettled[slice] !== undefined &&
              (committed === undefined ||
                !sameSliceValue(slice, previous.controlled[slice], committed))
            ) {
              unsettled = { ...unsettled, [slice]: undefined };
            }
          }
          if (pending === undefined) return;
          // A slice's request is settled once the owner commits a different value for it; commits
          // caused by unrelated updates keep it so later commands in the same task still compose.
          const retained = { ...pending };
          for (const slice of calendarStateSlices) {
            if (retained[slice] === undefined) continue;
            const committed = next.controlled[slice];
            if (
              committed === undefined ||
              !sameSliceValue(slice, previous.controlled[slice], committed)
            ) {
              delete retained[slice];
            }
          }
          pending = calendarStateSlices.some((slice) => retained[slice] !== undefined)
            ? retained
            : undefined;
        },
        read,
        subscribeRequests: (listener: CalendarRequestListener) => {
          const entry = { listener };
          requestListeners.add(entry);
          return () => {
            requestListeners.delete(entry);
          };
        },
      },
    );
    return binding;
  }

  const unbound = bind({ controlled: {}, handlers: {} });
  const owner = () => mountedRoots.at(-1) ?? unbound;
  const store: CalendarStore<TView, TSelection, TFocus, TResourceId> = {
    actions: Object.freeze({
      setAnchorDate: (next, options) => owner().actions.setAnchorDate(next, options),
      setExpandedResourceIds: (next, options) =>
        owner().actions.setExpandedResourceIds(next, options),
      setFocus: (next, options) => owner().actions.setFocus(next, options),
      setSelection: (next, options) => owner().actions.setSelection(next, options),
      setTimeZone: (next, options) => owner().actions.setTimeZone(next, options),
      setView: (next, options) => owner().actions.setView(next, options),
    }),
    getSnapshot: () => state,
    subscribe: listeners.subscribe,
  };

  storeInternals.set(store, { bind });
  return store;
}
