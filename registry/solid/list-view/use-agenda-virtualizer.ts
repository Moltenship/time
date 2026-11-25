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

  // What runs after each layout, in the order React's layout effects run.
  const laidOut: (() => void)[] = [];
  let kept: { readonly rows: readonly AgendaRow<unknown>[]; readonly stop: () => void } | undefined;
  // As TanStack's React binding does after each render: it picks up the scroll element and
  // scrolls to the initial offset once there is one, and keeps the item on top as rows come and
  // go at the ends. Then it keeps the row on top in place once new rows are laid out, and then
  // runs `afterLayout`'s.
  const layOut = (next: readonly AgendaRow<unknown>[]) => {
    within(() => virtualizer._willUpdate());
    const element = scrollElement();
    if (element !== undefined && kept?.rows !== next) {
      kept?.stop();
      kept = { rows: next, stop: within(() => agenda.keepTop(element)) };
    }
    for (const run of laidOut) run();
  };
  // The first layout scrolls to the initial row, which changes the rows to render: once mounted,
  // so no effect has to render again for its own write.
  let mounted = false;
  onSettled(() => {
    const stop = within(() => virtualizer._didMount());
    mounted = true;
    layOut(untrack(rows));
    return stop;
  });
  // Then after each render. One effect, as Solid orders effects by their sources, not as created.
  createEffect(
    () => ({ items: items(), rows: rows() }),
    ({ rows: next }) => {
      if (mounted) layOut(next);
    },
  );
  onCleanup(() => kept?.stop());

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

  /**
   * Runs `run` after each render once the list is laid out and its row on top kept, as a scroll
   * that follows the anchor date must.
   */
  const afterLayout = (run: () => void) => {
    laidOut.push(run);
  };

  return { afterLayout, items, measure, totalSize, viewportHeight, virtualizer };
}
