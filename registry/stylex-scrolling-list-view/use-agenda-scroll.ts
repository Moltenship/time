import { useAnchorDateRequests, type PlainDateInterval } from "@moltenship/calendar";
import {
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";

import type { AgendaRow } from "@registry/shared/list-view/agenda-rows";
import {
  createAgendaScroll,
  type AgendaScrollInput,
} from "@registry/shared/list-view/agenda-scroll";
import type { AgendaVirtualizer } from "@registry/stylex-list-view/use-agenda-virtualizer";

export interface AgendaScrollOptions {
  /** Moves the anchor date to the date the user scrolled to. */
  readonly onScroll: (date: Temporal.PlainDate) => void;
  /** The visible dates, from the anchor date, which the list shows on top. */
  readonly range: PlainDateInterval;
  readonly rows: readonly AgendaRow<unknown>[];
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly virtualizer: AgendaVirtualizer;
}

/**
 * The agenda's scrolling (`agenda-scroll.ts`) in a React component: the list's scroll position and
 * the anchor date move together, the anchor following the user's scroll and the list following
 * any other anchor.
 */
export function useAgendaScroll({
  onScroll,
  range,
  rows,
  scrollRef,
  virtualizer,
}: AgendaScrollOptions): void {
  // Read by event handlers, so they see the latest render without subscribing again.
  const latest = useRef<AgendaScrollInput>({ onScroll, range, rows });
  useInsertionEffect(() => {
    latest.current = { onScroll, range, rows };
  });
  const [scroll] = useState(() =>
    createAgendaScroll(
      () => scrollRef.current,
      virtualizer,
      () => latest.current,
    ),
  );

  useLayoutEffect(() => scroll.layout());
  useAnchorDateRequests(scroll.request);
  useEffect(() => scroll.attach(), [scroll]);
}
