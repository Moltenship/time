import { useInsertionEffect, useMemo, useRef, useSyncExternalStore } from "react";

import type { CalendarStateSource } from "./context";
import type { CalendarStateSelector, CalendarStateSelectorOptions } from "./types";

/** Subscribes once per source; inline selectors and `isEqual` callbacks are read per render. */
export function useStateSelector<TState, TSelected>(
  source: CalendarStateSource<TState>,
  selector: CalendarStateSelector<TState, TSelected>,
  { isEqual = Object.is }: CalendarStateSelectorOptions<TSelected> = {},
): TSelected {
  const committed = useRef<{ readonly selected: TSelected } | null>(null);
  const [getSelection, getServerSelection] = useMemo(() => {
    // One memo for both reads, so the same state selects the same value on the server snapshot
    // and the client's, and hydration doesn't render again for a new but equal selection.
    let memo: { readonly selected: TSelected; readonly state: TState } | undefined;
    const select = (state: TState) => {
      if (memo !== undefined && memo.state === state) return memo.selected;
      const next = selector(state);
      const previous = memo ?? committed.current;
      const selected =
        previous !== null && isEqual(previous.selected, next) ? previous.selected : next;
      memo = { selected, state };
      return selected;
    };
    const client = () => select(source.getSnapshot());
    const server = source.getServerSnapshot;
    return [client, server === undefined ? client : () => select(server())];
  }, [isEqual, selector, source]);
  const selected = useSyncExternalStore(source.subscribe, getSelection, getServerSelection);
  useInsertionEffect(() => {
    committed.current = { selected };
  });
  return selected;
}
