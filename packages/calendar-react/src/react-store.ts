"use client";

import type { ResourceId } from "@moltenship/calendar-core";
import { useAtomValue, useSetAtom } from "jotai/react";
import { selectAtom } from "jotai/vanilla/utils";
import { useInsertionEffect, useMemo, useRef } from "react";

import {
  createCalendarActions,
  createCalendarStore,
  getCalendarRuntime,
  getCalendarSourceRuntime,
} from "./internal/runtime-store";
import type {
  CalendarPublicState,
  CalendarStateSelector,
  CalendarStateSelectorOptions,
  CalendarStateSource,
  CalendarStore,
  CalendarStoreBinding,
  CalendarStoreOptions,
  UseCalendarStoreBindingOptions,
} from "./types";

function sameValue<T>(left: T, right: T): boolean {
  return Object.is(left, right);
}

export function useCalendarStore<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
>(
  defaults: CalendarStoreOptions<TView, TSelection, TFocus, TResourceId>,
  injectedStore?: CalendarStore<TView, TSelection, TFocus, TResourceId>,
): CalendarStore<TView, TSelection, TFocus, TResourceId> {
  const ownedStoreRef = useRef<CalendarStore<TView, TSelection, TFocus, TResourceId> | null>(null);
  if (injectedStore === undefined && ownedStoreRef.current === null) {
    ownedStoreRef.current = createCalendarStore(defaults);
  }

  const store = injectedStore ?? ownedStoreRef.current;
  if (store === null) throw new Error("calendar-store-not-created");
  if (store.meta.destroyed) throw new Error("calendar-store-destroyed");
  return store;
}

export function useCalendarStoreBinding<
  TView extends string = string,
  TSelection = string,
  TFocus = string,
  TResourceId extends ResourceId = ResourceId,
>(
  store: CalendarStore<TView, TSelection, TFocus, TResourceId>,
  options: UseCalendarStoreBindingOptions<TView, TSelection, TFocus, TResourceId> = {},
): CalendarStoreBinding<TView, TSelection, TFocus, TResourceId> {
  const { controlled, handlers } = options;
  const source = useMemo(
    () => store.createStateSource(controlled),
    [
      controlled?.anchorDate,
      controlled?.expandedResourceIds,
      controlled?.focus,
      controlled?.selection,
      controlled?.timeZone,
      controlled?.view,
      store,
    ],
  );
  const storeRuntime = getCalendarRuntime(store);
  const sourceRuntime = getCalendarSourceRuntime(source);
  const state = useAtomValue(sourceRuntime.snapshotAtom, { store: storeRuntime.jotaiStore });
  const dispatch = useSetAtom(storeRuntime.commandAtom, { store: storeRuntime.jotaiStore });
  const currentContext = useMemo(() => ({ handlers: handlers ?? {}, source }), [handlers, source]);
  const committedContextRef = useRef(currentContext);
  useInsertionEffect(() => {
    committedContextRef.current = currentContext;
  }, [currentContext]);
  const actions = useMemo(
    () => createCalendarActions(dispatch, () => committedContextRef.current),
    [dispatch],
  );
  const meta = useMemo(
    () => Object.freeze({ controlledSlices: source.controlledSlices, source, store }),
    [source, store],
  );

  return useMemo(() => Object.freeze({ actions, meta, state }), [actions, meta, state]);
}

export function useCalendarStoreSelector<
  TView extends string,
  TSelection,
  TFocus,
  TResourceId extends ResourceId,
  TSelected,
>(
  source: CalendarStateSource<TView, TSelection, TFocus, TResourceId>,
  selector: CalendarStateSelector<
    CalendarPublicState<TView, TSelection, TFocus, TResourceId>,
    TSelected
  >,
  options: CalendarStateSelectorOptions<TSelected> = {},
): TSelected {
  const sourceRuntime = getCalendarSourceRuntime(source);
  const selectedAtom = useMemo(
    () => selectAtom(sourceRuntime.snapshotAtom, selector, options.isEqual ?? sameValue),
    [options.isEqual, selector, sourceRuntime.snapshotAtom],
  );
  return useAtomValue(selectedAtom, { store: sourceRuntime.jotaiStore });
}
