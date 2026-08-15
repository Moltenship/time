import { atom, createStore } from "jotai/vanilla";

import type { CalendarPublicState } from "./types";

interface RuntimeStoreOptions {
  readonly defaultView: string;
  readonly defaultAnchorDate: string;
}

export interface ControlledStateInput {
  readonly view: string | undefined;
  readonly anchorDate: string | undefined;
}

export interface SnapshotReader {
  readonly getSnapshot: () => CalendarPublicState;
  readonly getServerSnapshot: () => CalendarPublicState;
}

export interface CalendarRuntimeStore {
  readonly subscribe: (listener: () => void) => () => void;
  readonly createSnapshotReader: (controlled: ControlledStateInput) => SnapshotReader;
  readonly setUncontrolledView: (next: string) => void;
  readonly setUncontrolledAnchorDate: (next: string) => void;
}

export function createCalendarRuntimeStore(options: RuntimeStoreOptions): CalendarRuntimeStore {
  const viewAtom = atom(options.defaultView);
  const anchorDateAtom = atom(options.defaultAnchorDate);
  const jotaiStore = createStore();
  let revision = 0;

  const subscribe = (listener: () => void) => {
    const unsubscribeView = jotaiStore.sub(viewAtom, listener);
    const unsubscribeAnchorDate = jotaiStore.sub(anchorDateAtom, listener);

    return () => {
      unsubscribeView();
      unsubscribeAnchorDate();
    };
  };

  const createSnapshotReader = (controlled: ControlledStateInput): SnapshotReader => {
    let cachedRevision = -1;
    let cachedSnapshot: CalendarPublicState | undefined;

    const read = () => {
      if (cachedSnapshot !== undefined && cachedRevision === revision) {
        return cachedSnapshot;
      }

      cachedRevision = revision;
      cachedSnapshot = Object.freeze({
        view: controlled.view ?? jotaiStore.get(viewAtom),
        anchorDate: controlled.anchorDate ?? jotaiStore.get(anchorDateAtom),
      });
      return cachedSnapshot;
    };

    return Object.freeze({
      getSnapshot: read,
      getServerSnapshot: read,
    });
  };

  const setUncontrolledView = (next: string) => {
    if (jotaiStore.get(viewAtom) === next) {
      return;
    }

    revision += 1;
    jotaiStore.set(viewAtom, next);
  };

  const setUncontrolledAnchorDate = (next: string) => {
    if (jotaiStore.get(anchorDateAtom) === next) {
      return;
    }

    revision += 1;
    jotaiStore.set(anchorDateAtom, next);
  };

  return Object.freeze({
    subscribe,
    createSnapshotReader,
    setUncontrolledView,
    setUncontrolledAnchorDate,
  });
}
