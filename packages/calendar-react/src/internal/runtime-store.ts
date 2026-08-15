import type { ResourceId } from "@moltenship/calendar-core";
import {
  atom,
  createStore as createJotaiStore,
  type Atom,
  type PrimitiveAtom,
  type WritableAtom,
} from "jotai/vanilla";
import type { Store as JotaiStore } from "jotai/vanilla/store";

import type {
  CalendarActions,
  CalendarControlledState,
  CalendarPublicState,
  CalendarStateChangeDetail,
  CalendarStateChangeHandlers,
  CalendarStateSlice,
  CalendarStateSource,
  CalendarStore,
  CalendarStoreOptions,
} from "../types";

const stateSlices = Object.freeze([
  "view",
  "anchorDate",
  "selection",
  "focus",
  "timeZone",
  "expandedResourceIds",
] satisfies readonly CalendarStateSlice[]);

interface StateAtoms<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly anchorDate: PrimitiveAtom<Temporal.PlainDate>;
  readonly expandedResourceIds: PrimitiveAtom<readonly TResourceId[]>;
  readonly focus: PrimitiveAtom<TFocus | null>;
  readonly selection: PrimitiveAtom<TSelection | null>;
  readonly timeZone: PrimitiveAtom<string>;
  readonly view: PrimitiveAtom<TView>;
}

interface ActionContext<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> {
  readonly handlers: CalendarStateChangeHandlers<TView, TSelection, TFocus, TResourceId>;
  readonly source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>;
}

type CalendarCommand<TView extends string, TSelection, TFocus, TResourceId extends ResourceId> = {
  [TSlice in CalendarStateSlice]: {
    readonly context: ActionContext<TView, TSelection, TFocus, TResourceId>;
    readonly next: CalendarPublicState<TView, TSelection, TFocus, TResourceId>[TSlice];
    readonly slice: TSlice;
  };
}[CalendarStateSlice];

interface CalendarSourceRuntime<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly jotaiStore: JotaiStore;
  readonly owner: object;
  readonly snapshotAtom: Atom<CalendarPublicState<TView, TSelection, TFocus, TResourceId>>;
}

interface CalendarRuntime<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> {
  readonly commandAtom: WritableAtom<
    null,
    [CalendarCommand<TView, TSelection, TFocus, TResourceId>],
    void
  >;
  readonly jotaiStore: JotaiStore;
  readonly owner: object;
}

const sourceRuntimeSymbol: unique symbol = Symbol("calendar-source-runtime");
const storeRuntimeSymbol: unique symbol = Symbol("calendar-store-runtime");

type InternalCalendarStateSource<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> = CalendarStateSource<TView, TSelection, TFocus, TResourceId> & {
  readonly [sourceRuntimeSymbol]: CalendarSourceRuntime<TView, TSelection, TFocus, TResourceId>;
};

type InternalCalendarStore<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> = CalendarStore<TView, TSelection, TFocus, TResourceId> &
  InternalCalendarStateSource<TView, TSelection, TFocus, TResourceId> & {
    readonly [storeRuntimeSymbol]: CalendarRuntime<TView, TSelection, TFocus, TResourceId>;
  };

function sameValue<T>(left: T, right: T): boolean {
  return Object.is(left, right);
}

function samePlainDate(left: Temporal.PlainDate, right: Temporal.PlainDate): boolean {
  return left.equals(right);
}

function sameResourceIds<TResourceId extends ResourceId>(
  left: readonly TResourceId[],
  right: readonly TResourceId[],
): boolean {
  return (
    left.length === right.length &&
    left.every((resourceId, index) => sameValue(resourceId, right[index]))
  );
}

function freezeResourceIds<TResourceId extends ResourceId>(
  resourceIds: readonly TResourceId[],
): readonly TResourceId[] {
  return Object.freeze([...new Set(resourceIds)]);
}

function changeDetail<TValue, TSlice extends CalendarStateSlice>(
  previous: TValue,
  slice: TSlice,
  controlled: boolean,
): CalendarStateChangeDetail<TValue, TSlice> {
  return Object.freeze({ controlled, previous, slice, source: "action" });
}

function isInternalCalendarStateSource<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>,
): source is InternalCalendarStateSource<TView, TSelection, TFocus, TResourceId> {
  return sourceRuntimeSymbol in source;
}

function isInternalCalendarStore<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  store: CalendarStore<TView, TSelection, TFocus, TResourceId>,
): store is InternalCalendarStore<TView, TSelection, TFocus, TResourceId> {
  return storeRuntimeSymbol in store && sourceRuntimeSymbol in store;
}

export function getCalendarSourceRuntime<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>,
): CalendarSourceRuntime<TView, TSelection, TFocus, TResourceId> {
  if (!isInternalCalendarStateSource(source)) {
    throw new TypeError("calendar-state-source-not-created-by-createCalendarStore");
  }
  return source[sourceRuntimeSymbol];
}

export function getCalendarRuntime<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  store: CalendarStore<TView, TSelection, TFocus, TResourceId>,
): CalendarRuntime<TView, TSelection, TFocus, TResourceId> {
  if (!isInternalCalendarStore(store)) {
    throw new TypeError("calendar-store-not-created-by-createCalendarStore");
  }
  return store[storeRuntimeSymbol];
}

type DispatchCalendarCommand<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
> = (command: CalendarCommand<TView, TSelection, TFocus, TResourceId>) => void;

export function createCalendarActions<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  dispatch: DispatchCalendarCommand<TView, TSelection, TFocus, TResourceId>,
  getContext: () => ActionContext<TView, TSelection, TFocus, TResourceId>,
): CalendarActions<TView, TSelection, TFocus, TResourceId> {
  return Object.freeze({
    setAnchorDate: (next) => dispatch({ context: getContext(), next, slice: "anchorDate" }),
    setExpandedResourceIds: (next) =>
      dispatch({ context: getContext(), next, slice: "expandedResourceIds" }),
    setFocus: (next) => dispatch({ context: getContext(), next, slice: "focus" }),
    setSelection: (next) => dispatch({ context: getContext(), next, slice: "selection" }),
    setTimeZone: (next) => dispatch({ context: getContext(), next, slice: "timeZone" }),
    setView: (next) => dispatch({ context: getContext(), next, slice: "view" }),
  });
}

export function createCalendarStore<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
>(
  options: CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>,
): CalendarStore<TView, TSelection, TFocus, TResourceId> {
  const jotaiStore = createJotaiStore();
  const atoms: StateAtoms<TView, TSelection, TFocus, TResourceId> = {
    anchorDate: atom(options.defaultAnchorDate),
    expandedResourceIds: atom(freezeResourceIds(options.defaultExpandedResourceIds ?? [])),
    focus: atom<TFocus | null>(options.defaultFocus === undefined ? null : options.defaultFocus),
    selection: atom<TSelection | null>(
      options.defaultSelection === undefined ? null : options.defaultSelection,
    ),
    timeZone: atom(options.defaultTimeZone),
    view: atom(options.defaultView),
  };
  const owner = Object.freeze({});
  let destroyed = false;

  function assertActive(): void {
    if (destroyed) throw new Error("calendar-store-destroyed");
  }

  function createStateSource(
    controlled: CalendarControlledState<TView, TSelection, TFocus, TResourceId> = {},
  ): InternalCalendarStateSource<TView, TSelection, TFocus, TResourceId> {
    assertActive();
    const controlledValues = Object.freeze({
      ...controlled,
      expandedResourceIds:
        controlled.expandedResourceIds === undefined
          ? undefined
          : freezeResourceIds(controlled.expandedResourceIds),
    });
    const controlledSlices = Object.freeze(
      stateSlices.filter((slice) => controlledValues[slice] !== undefined),
    );
    const controlledSet = new Set<CalendarStateSlice>(controlledSlices);
    const snapshotAtom = atom((get) =>
      Object.freeze({
        anchorDate: controlledValues.anchorDate ?? get(atoms.anchorDate),
        expandedResourceIds: controlledValues.expandedResourceIds ?? get(atoms.expandedResourceIds),
        focus: controlledValues.focus === undefined ? get(atoms.focus) : controlledValues.focus,
        selection:
          controlledValues.selection === undefined
            ? get(atoms.selection)
            : controlledValues.selection,
        timeZone: controlledValues.timeZone ?? get(atoms.timeZone),
        view: controlledValues.view ?? get(atoms.view),
      }),
    );
    const sourceRuntime = Object.freeze({ jotaiStore, owner, snapshotAtom });
    const read = () => jotaiStore.get(snapshotAtom);

    return Object.freeze({
      [sourceRuntimeSymbol]: sourceRuntime,
      controlledSlices,
      getServerSnapshot: read,
      getSnapshot: read,
      isControlled: (slice: CalendarStateSlice) => controlledSet.has(slice),
    });
  }

  function getOwnedSourceRuntime(
    source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>,
  ): CalendarSourceRuntime<TView, TSelection, TFocus, TResourceId> {
    if (!isInternalCalendarStateSource(source) || source[sourceRuntimeSymbol].owner !== owner) {
      throw new TypeError("calendar-state-source-belongs-to-another-store");
    }
    return source[sourceRuntimeSymbol];
  }

  const commandAtom = atom(
    null,
    (get, set, command: CalendarCommand<TView, TSelection, TFocus, TResourceId>) => {
      assertActive();
      const { context, next, slice } = command;
      const sourceRuntime = getOwnedSourceRuntime(context.source);
      const previousState = get(sourceRuntime.snapshotAtom);
      const controlled = context.source.isControlled(slice);

      switch (slice) {
        case "anchorDate": {
          const previous = previousState.anchorDate;
          if (samePlainDate(previous, next)) return;
          if (!controlled) set(atoms.anchorDate, next);
          context.handlers.onAnchorDateChange?.(
            next,
            changeDetail(previous, "anchorDate", controlled),
          );
          return;
        }
        case "expandedResourceIds": {
          const normalized = freezeResourceIds(next);
          const previous = previousState.expandedResourceIds;
          if (sameResourceIds(previous, normalized)) return;
          if (!controlled) set(atoms.expandedResourceIds, normalized);
          context.handlers.onExpandedResourceIdsChange?.(
            normalized,
            changeDetail(previous, "expandedResourceIds", controlled),
          );
          return;
        }
        case "focus": {
          const previous = previousState.focus;
          if (sameValue(previous, next)) return;
          if (!controlled) set(atoms.focus, next);
          context.handlers.onFocusChange?.(next, changeDetail(previous, "focus", controlled));
          return;
        }
        case "selection": {
          const previous = previousState.selection;
          if (sameValue(previous, next)) return;
          if (!controlled) set(atoms.selection, next);
          context.handlers.onSelectionChange?.(
            next,
            changeDetail(previous, "selection", controlled),
          );
          return;
        }
        case "timeZone": {
          const previous = previousState.timeZone;
          if (sameValue(previous, next)) return;
          if (!controlled) set(atoms.timeZone, next);
          context.handlers.onTimeZoneChange?.(next, changeDetail(previous, "timeZone", controlled));
          return;
        }
        case "view": {
          const previous = previousState.view;
          if (sameValue(previous, next)) return;
          if (!controlled) set(atoms.view, next);
          context.handlers.onViewChange?.(next, changeDetail(previous, "view", controlled));
        }
      }
    },
  );
  const runtime = Object.freeze({ commandAtom, jotaiStore, owner });
  const defaultSource = createStateSource();
  const dispatch: DispatchCalendarCommand<TView, TSelection, TFocus, TResourceId> = (command) =>
    jotaiStore.set(commandAtom, command);
  const actions = createCalendarActions(dispatch, () => ({ handlers: {}, source: defaultSource }));
  const meta = Object.freeze({
    get destroyed() {
      return destroyed;
    },
  });
  const store: InternalCalendarStore<TView, TSelection, TFocus, TResourceId> = {
    [sourceRuntimeSymbol]: defaultSource[sourceRuntimeSymbol],
    [storeRuntimeSymbol]: runtime,
    actions,
    controlledSlices: defaultSource.controlledSlices,
    createActions(source, handlers = {}) {
      return createCalendarActions(dispatch, () => ({ handlers, source }));
    },
    createStateSource,
    destroy() {
      destroyed = true;
    },
    getServerSnapshot: () => defaultSource.getServerSnapshot(),
    getSnapshot: () => defaultSource.getSnapshot(),
    isControlled: (slice) => defaultSource.isControlled(slice),
    meta,
  };
  return Object.freeze(store);
}
