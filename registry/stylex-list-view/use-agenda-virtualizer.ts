import { useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

import type { AgendaRow } from "@registry/shared/list-view/agenda-rows";
import {
  createAgendaVirtualizer,
  type AgendaVirtualizer,
} from "@registry/shared/list-view/agenda-virtualizer";

export type { AgendaVirtualizer };

export interface AgendaVirtualizerOptions {
  /** The row on top when the list first renders, as the anchor date's. */
  readonly initialRow: number;
  /** Rows that render even out of view, such as the focused day and the agenda's entry. */
  readonly pinned: readonly number[];
  readonly rows: readonly AgendaRow<unknown>[];
  /** The element that scrolls the rows. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * The agenda's virtualizer (`agenda-virtualizer.ts`) in a React component: only the rows in view,
 * a few beyond, and the pinned ones render, and the row on top stays in place as rows change.
 */
export function useAgendaVirtualizer({
  initialRow,
  pinned,
  rows,
  scrollRef,
}: AgendaVirtualizerOptions) {
  const rerender = useReducer((count: number) => count + 1, 0)[1];
  // A row measured from its ref renders again without `flushSync`, which React refuses there.
  const measuring = useRef(false);
  const [agenda] = useState(() => {
    const created = createAgendaVirtualizer({
      getScrollElement: () => scrollRef.current,
      initialRow,
      onChange: (sync) => (sync && !measuring.current ? flushSync(rerender) : rerender()),
      pinned,
      rows,
    });
    const { virtualizer } = created;
    const measureElement = virtualizer.measureElement;
    virtualizer.measureElement = (node) => {
      measuring.current = true;
      try {
        measureElement(node);
      } finally {
        measuring.current = false;
      }
    };
    return created;
  });
  agenda.update({ pinned, rows });

  useLayoutEffect(() => agenda.virtualizer._didMount(), [agenda]);
  useLayoutEffect(() => agenda.virtualizer._willUpdate());
  useLayoutEffect(() => {
    const element = scrollRef.current;
    return element === null ? undefined : agenda.keepTop(element);
  }, [agenda, rows, scrollRef]);

  return { viewportHeight: agenda.viewportHeight(), virtualizer: agenda.virtualizer };
}
