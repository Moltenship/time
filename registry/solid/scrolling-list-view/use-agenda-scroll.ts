import { useAnchorDateRequests, type PlainDateInterval } from "@moltenship/calendar-solid";
import { onSettled, untrack, type Accessor } from "solid-js";

import type { AgendaRow } from "@registry/shared/list-view/agenda-rows";
import {
  createAgendaScroll,
  type AgendaScrollInput,
} from "@registry/shared/list-view/agenda-scroll";
import type { AgendaVirtualizer } from "@registry/list-view/use-agenda-virtualizer";

export interface AgendaScrollOptions {
  /** The list's `afterLayout`: runs its argument after each render, once the list is laid out. */
  readonly afterLayout: (run: () => void) => void;
  /** Moves the anchor date to the date the user scrolled to. */
  readonly onScroll: (date: Temporal.PlainDate) => void;
  /** The visible dates, from the anchor date, which the list shows on top. */
  readonly range: Accessor<PlainDateInterval>;
  readonly rows: Accessor<readonly AgendaRow<unknown>[]>;
  readonly scrollElement: () => HTMLElement | undefined;
  readonly virtualizer: AgendaVirtualizer;
}

/**
 * The agenda's scrolling (`agenda-scroll.ts`) in a Solid component: the list's scroll position and
 * the anchor date move together, the anchor following the user's scroll and the list following
 * any other anchor.
 */
export function useAgendaScroll(options: AgendaScrollOptions): void {
  // What the controller reads: the list as last rendered.
  let latest: AgendaScrollInput = {
    onScroll: options.onScroll,
    range: untrack(options.range),
    rows: untrack(options.rows),
  };
  const scroll = createAgendaScroll(options.scrollElement, options.virtualizer, () => latest);

  // After each render, as rows load in or are measured, and after the list keeps its row on top,
  // as React's layout effects run: the list then follows any new anchor.
  options.afterLayout(() => {
    latest = {
      onScroll: options.onScroll,
      range: untrack(options.range),
      rows: untrack(options.rows),
    };
    scroll.layout();
  });
  useAnchorDateRequests(scroll.request);
  onSettled(() => scroll.attach());
}
