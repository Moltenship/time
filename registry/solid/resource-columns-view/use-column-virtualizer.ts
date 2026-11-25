import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onSettled,
  untrack,
  type Accessor,
} from "solid-js";

import {
  createColumnVirtualizer,
  type ColumnVirtualizerInput,
} from "@registry/shared/resource-columns-view/column-virtualizer";

export type { ColumnVirtualizer } from "@registry/shared/resource-columns-view/column-virtualizer";

/**
 * The column virtualizer (`column-virtualizer.ts`) as Solid accessors: the columns to render, the
 * width of all of them, and the body's scrollbar's. `scrollElement` is the element that scrolls.
 */
export function useColumnVirtualizer(
  input: Accessor<ColumnVirtualizerInput>,
  scrollElement: () => HTMLDivElement | undefined,
) {
  // Bumped whenever the virtualizer says what to render changed.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  const columns = createColumnVirtualizer({
    ...untrack(input),
    getScrollElement: () => scrollElement() ?? null,
    onChange: () => setVersion((count) => count + 1),
  });
  const { virtualizer } = columns;

  const layout = createMemo(() => {
    version();
    const next = input();
    return untrack(() => {
      columns.update(next);
      return {
        items: virtualizer.getVirtualItems(),
        scrollbarWidth: columns.scrollbarWidth(),
        totalSize: virtualizer.getTotalSize(),
      };
    });
  });

  let unmount: (() => void) | undefined;
  onSettled(() => {
    unmount = virtualizer._didMount();
  });
  onCleanup(() => unmount?.());
  // After each render, as TanStack's React binding does: it picks up the scroll element, a new
  // column width and a new direction.
  createEffect(layout, () => {
    virtualizer._willUpdate();
  });

  return {
    items: () => layout().items,
    scrollbarWidth: () => layout().scrollbarWidth,
    totalSize: () => layout().totalSize,
    virtualizer,
  };
}
