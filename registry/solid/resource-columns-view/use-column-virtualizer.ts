import { createMemo, createSignal, onCleanup, onSettled, untrack, type Accessor } from "solid-js";

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
  // The virtualizer picks up the body here, once: its width sets the columns', which renders
  // again. React's binding calls `_willUpdate` after every render, but it only acts on a new
  // scroll element, and the body stays the same one; `update` passes a new width or direction on.
  onSettled(() => {
    unmount = virtualizer._didMount();
    virtualizer._willUpdate();
  });
  onCleanup(() => unmount?.());

  return {
    items: () => layout().items,
    scrollbarWidth: () => layout().scrollbarWidth,
    totalSize: () => layout().totalSize,
    virtualizer,
  };
}
