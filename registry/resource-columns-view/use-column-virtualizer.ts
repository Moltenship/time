import { useLayoutEffect, useReducer, useRef, useState } from "react";

import {
  createColumnVirtualizer,
  type ColumnVirtualizerInput,
} from "@registry/shared/resource-columns-view/column-virtualizer";

export type { ColumnVirtualizer } from "@registry/shared/resource-columns-view/column-virtualizer";

/**
 * The column virtualizer (`column-virtualizer.ts`) in a React component: only the columns in view,
 * a few either side and the pinned one render. Pass `scrollRef` to the element that scrolls.
 */
export function useColumnVirtualizer(input: ColumnVirtualizerInput) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // Scroll updates render in the next frame instead of forcing a synchronous React render.
  const rerender = useReducer((count: number) => count + 1, 0)[1];
  const [columns] = useState(() =>
    createColumnVirtualizer({
      ...input,
      getScrollElement: () => scrollRef.current,
      onChange: rerender,
    }),
  );
  columns.update(input);

  useLayoutEffect(() => columns.virtualizer._didMount(), [columns]);
  useLayoutEffect(() => columns.virtualizer._willUpdate());

  return { scrollbarWidth: columns.scrollbarWidth(), scrollRef, virtualizer: columns.virtualizer };
}
