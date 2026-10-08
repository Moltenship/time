import type { ResourceId } from "@moltenship/calendar-core";
import { useInsertionEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CalendarStateSource } from "./context";
import { sameElements, samePlainDate } from "./equality";
import {
  createCalendarStore,
  getCalendarStoreInternals,
  mergeControlledState,
  type CalendarStoreBinding,
} from "./store";
import type {
  CalendarControlledState,
  CalendarPublicState,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStore,
  CalendarStoreOptions,
} from "./types";
import { useStableValue } from "./use-stable-value";

const uncommittedBinding = Object.freeze({ controlled: {}, handlers: {} });

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

function createStateSource<TState extends CalendarPublicState<string, unknown, unknown>>(
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

/**
 * Binds a store to a root's controlled slices and handlers. Controlled values are read during
 * render, so they are current in the first render that receives them, and Temporal or array values
 * that are recreated inline keep their identity while they stay equal.
 */
export function useCalendarStateBinding<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
>(
  injectedStore: CalendarStore<TView, TSelection, TFocus, TResourceId> | undefined,
  defaults: () => CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>,
  {
    controlled: controlledInput,
    handlers,
  }: CalendarStoreBinding<TView, TSelection, TFocus, TResourceId>,
) {
  const ownedStore = useRef<CalendarStore<TView, TSelection, TFocus, TResourceId>>(null);
  if (injectedStore === undefined) ownedStore.current ??= createCalendarStore(defaults());
  const store = injectedStore ?? ownedStore.current;
  if (store === null) throw new Error("calendar-store-not-created");

  const internals = getCalendarStoreInternals(store);
  const controlled = useStableValue(controlledInput, sameControlledState);
  // Commands run only after a commit, and every commit publishes this render's props first.
  const binding = useMemo(() => internals.bind(uncommittedBinding), [internals]);
  useInsertionEffect(() => binding.commit({ controlled, handlers }));
  useInsertionEffect(() => binding.attach(), [binding]);

  const source = useMemo(() => createStateSource(store, controlled), [controlled, store]);
  const state = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
  return { binding, source, state, store };
}

/** Subscribes once per source; inline selectors and `isEqual` callbacks are read per render. */
export function useStateSelector<TState, TSelected>(
  source: CalendarStateSource<TState>,
  selector: CalendarStateSelector<TState, TSelected>,
  { isEqual = Object.is }: CalendarStateSelectorOptions<TSelected> = {},
): TSelected {
  const committed = useRef<{ readonly selected: TSelected } | null>(null);
  const getSelection = useMemo(() => {
    let memo: { readonly selected: TSelected; readonly state: TState } | undefined;
    return () => {
      const state = source.getSnapshot();
      if (memo !== undefined && memo.state === state) return memo.selected;
      const next = selector(state);
      const previous = memo ?? committed.current;
      const selected =
        previous !== null && isEqual(previous.selected, next) ? previous.selected : next;
      memo = { selected, state };
      return selected;
    };
  }, [isEqual, selector, source]);
  const selected = useSyncExternalStore(source.subscribe, getSelection, getSelection);
  useInsertionEffect(() => {
    committed.current = { selected };
  });
  return selected;
}
