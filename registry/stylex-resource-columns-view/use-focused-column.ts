import { useCalendarFocus, type ResourceColumn } from "@moltenship/calendar";
import { useInsertionEffect, useLayoutEffect, useRef, type RefObject } from "react";

import type { ColumnVirtualizer } from "@registry/shared/resource-columns-view/column-virtualizer";
import {
  focusedColumn,
  sameColumn,
  showFocusedColumn,
} from "@registry/shared/resource-columns-view/focused-column";

export interface FocusedColumnOptions {
  readonly resources: readonly ResourceColumn<unknown>[];
  readonly rtl: boolean;
  /** The body, which scrolls the columns; the header and all-day row follow it. */
  readonly scrollRef: RefObject<HTMLElement | null>;
  readonly virtualizer: ColumnVirtualizer;
}

/**
 * Keeps the focused day column in view (`focused-column.ts`): only a change of focus scrolls; new
 * events or the user's own scrolling leave the position alone.
 */
export function useFocusedColumnInView({
  resources,
  rtl,
  scrollRef,
  virtualizer,
}: FocusedColumnOptions): void {
  const focused = useCalendarFocus(focusedColumn, { isEqual: sameColumn });
  const latest = useRef({ resources, rtl });
  useInsertionEffect(() => {
    latest.current = { resources, rtl };
  });

  useLayoutEffect(() => {
    const body = scrollRef.current;
    if (focused === null || body === null) return;
    showFocusedColumn({ body, focused, ...latest.current, virtualizer });
  }, [focused, scrollRef, virtualizer]);
}
