import { useCalendarFocus, type ResourceColumn } from "@moltenship/calendar-solid";
import { createEffect, untrack, type Accessor } from "solid-js";

import type { ColumnVirtualizer } from "@registry/shared/resource-columns-view/column-virtualizer";
import {
  focusedColumn,
  sameColumn,
  showFocusedColumn,
} from "@registry/shared/resource-columns-view/focused-column";

export interface FocusedColumnOptions {
  /** The body, which scrolls the columns; the header and all-day row follow it. */
  readonly body: () => HTMLElement | undefined;
  readonly resources: Accessor<readonly ResourceColumn<unknown>[]>;
  readonly rtl: Accessor<boolean>;
  readonly virtualizer: ColumnVirtualizer;
}

/**
 * Keeps the focused day column in view (`focused-column.ts`): only a change of focus scrolls; new
 * events or the user's own scrolling leave the position alone.
 */
export function useFocusedColumnInView(options: FocusedColumnOptions): void {
  const focused = useCalendarFocus(focusedColumn, { isEqual: sameColumn });
  createEffect(focused, (column) => {
    const body = options.body();
    if (column === null || body === undefined) return;
    untrack(() =>
      showFocusedColumn({
        body,
        focused: column,
        resources: options.resources(),
        rtl: options.rtl(),
        virtualizer: options.virtualizer,
      }),
    );
  });
}
