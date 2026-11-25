import {
  createEffect,
  createMemo,
  createSignal,
  flush,
  onCleanup,
  onSettled,
  untrack,
  type Accessor,
} from "solid-js";

import type { AgendaRow } from "@registry/shared/list-view/agenda-rows";
import {
  createAgendaVirtualizer,
  type AgendaVirtualizer,
} from "@registry/shared/list-view/agenda-virtualizer";

export type { AgendaVirtualizer };

export interface AgendaVirtualizerOptions {
  /** The row on top when the list first renders. */
  readonly initialRow: number;
  /** Rows that render even out of view, such as the focused day and the agenda's entry. */
  readonly pinned: Accessor<readonly number[]>;
  readonly rows: Accessor<readonly AgendaRow<unknown>[]>;
  /** The element that scrolls the rows, once it exists. */
  readonly scrollElement: () => HTMLDivElement | undefined;
}

/**
 * The agenda's virtualizer (`agenda-virtualizer.ts`) as Solid accessors: the rows to render, the
 * height of all of them, and the viewport's. `measure` is the ref of each rendered row.
 */
export function useAgendaVirtualizer({
  initialRow,
  pinned,
  rows,
  scrollElement,
}: AgendaVirtualizerOptions) {
  // Bumped whenever the virtualizer says the rows to render changed.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });
  // While the agenda itself calls into the virtualizer, from a ref or an effect, a change renders
  // with the update already running; only a scroll renders at once, before the browser paints.
  let inside = 0;
  const within = <T>(run: () => T): T => {
    inside += 1;
    try {
      return run();
    } finally {
      inside -= 1;
    }
  };
  const agenda = createAgendaVirtualizer({
    getScrollElement: () => scrollElement() ?? null,
    initialRow,
    onChange: (sync) => {
      setVersion((count) => count + 1);
      if (sync && inside === 0) flush();
    },
    pinned: untrack(pinned),
    rows: untrack(rows),
  });
  const { virtualizer } = agenda;

  const items = createMemo(() => {
    version();
    const next = { pinned: pinned(), rows: rows() };
    return untrack(() => {
      agenda.update(next);
      return virtualizer.getVirtualItems();
    });
  });
  const totalSize = createMemo(() => {
    items();
    return untrack(() => virtualizer.getTotalSize());
  });
  // On every change, not just new rows: a resize can leave the rows in view as they were.
  const viewportHeight = createMemo(() => {
    version();
    items();
    return untrack(agenda.viewportHeight);
  });

  onSettled(() => within(() => virtualizer._didMount()));
  // After each render, as TanStack's React binding does: it picks up the scroll element and
  // scrolls to the initial offset once there is one.
  createEffect(items, () => within(() => virtualizer._willUpdate()));
  // Keeps the row on top in place once new rows are laid out.
  createEffect(rows, () => {
    const element = scrollElement();
    return element === undefined ? undefined : within(() => agenda.keepTop(element));
  });

  /**
   * The ref of a rendered row at `index`: it measures the row, and again as it resizes. Call it
   * in the row's body, which owns the row.
   */
  const measure = (index: Accessor<number>) => {
    // Forgets the rows that left the document.
    onCleanup(() => queueMicrotask(() => virtualizer.measureElement(null)));
    return (element: HTMLElement) => {
      // The ref runs before Solid sets the row's attributes; the virtualizer reads its index there.
      element.dataset["index"] = String(untrack(index));
      within(() => virtualizer.measureElement(element));
    };
  };

  return { items, measure, totalSize, viewportHeight, virtualizer };
}
