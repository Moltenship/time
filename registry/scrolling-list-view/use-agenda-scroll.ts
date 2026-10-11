import { useAnchorDateRequests, type PlainDateInterval } from "@moltenship/calendar";
import {
  useCallback,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

import { rowDate, rowFrom, type AgendaRow } from "@registry/list-view/agenda-rows";
import type { AgendaVirtualizer } from "@registry/list-view/use-agenda-virtualizer";

/** Without `scrollend`, a scroll has settled once it has been still this long. */
const SETTLE_MS = 150;
/** Ways the user scrolls the list, or moves focus that scrolls it, which end a scroll it holds. */
const INPUTS = ["keydown", "pointerdown", "touchstart", "wheel"] as const;
/** Keys that move focus through the list, and page the calendar past the range's ends. */
const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "End", "Home", "PageDown", "PageUp"]);

const sameRange = (left: PlainDateInterval, right: PlainDateInterval) =>
  left.start.equals(right.start) && left.end.equals(right.end);

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
 * Keeps the list's scroll position and the anchor date together. When the user scrolls, the
 * anchor moves to the date on top once the scroll comes to rest, and on the way whenever that date
 * is half the range away, so the loaded dates, and the events loaded for them, keep ahead. Any
 * other anchor, from mounting, Today, Next, or a picked date, scrolls the list to put that date,
 * or the next one with events, on top, and holds it there while rows load in, until the user
 * scrolls. Keys that page past the range move focus instead, which scrolls the list as far as the
 * next event. A controlled anchor may take the latest scroll later: until it changes, the list
 * stays where it was scrolled, and any other anchor moves the list to it.
 */
export function useAgendaScroll({
  onScroll,
  range,
  rows,
  scrollRef,
  virtualizer,
}: AgendaScrollOptions): void {
  const anchor = range.start;
  /** The date the list holds on top until the user scrolls. */
  const target = useRef<Temporal.PlainDate | null>(anchor);
  /** The latest date the user scrolled to, until the anchor catches up with it. */
  const proposed = useRef<Temporal.PlainDate | null>(null);
  /** Set while `onScroll` runs, so the requests it makes aren't taken for navigation. */
  const proposing = useRef(false);
  /** Set while the list handles a navigation key, whose requests page the calendar for focus. */
  const keying = useRef(false);
  /** The range the list last laid out. */
  const shown = useRef(range);
  /** Where a smooth scroll to the target is heading; the user's own input ends it. */
  const heading = useRef<number | null>(null);
  // Read by event handlers, so they see the latest render without subscribing again.
  const latest = useRef({ anchor, onScroll, range, rows });
  useInsertionEffect(() => {
    latest.current = { anchor, onScroll, range, rows };
  });

  /**
   * Scrolls the target's row to the top: for navigation, smoothly when it's within two screens and
   * the system doesn't ask for reduced motion, and at once otherwise, as the scrolling views do.
   */
  const show = useCallback(
    (navigation = false) => {
      const element = scrollRef.current;
      const date = target.current;
      if (element === null || date === null) return;
      const index = rowFrom(latest.current.rows, date);
      const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
      if (offset === undefined) return;
      const distance = Math.abs(offset - element.scrollTop);
      if (distance < 1) {
        heading.current = null;
        return;
      }
      // Already gliding there.
      if (heading.current !== null && Math.abs(heading.current - offset) < 1) return;
      const smooth =
        (navigation || heading.current !== null) &&
        distance <= 2 * element.clientHeight &&
        element.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)")
          .matches !== true;
      heading.current = smooth ? offset : null;
      virtualizer.scrollToOffset(offset, { behavior: smooth ? "smooth" : "auto" });
    },
    [scrollRef, virtualizer],
  );

  useLayoutEffect(() => {
    let navigation = false;
    if (!sameRange(shown.current, range)) {
      shown.current = range;
      // An anchor that caught up with the user's latest scroll leaves the list where it is; any
      // other is navigation, which the list follows.
      navigation = proposed.current === null || !proposed.current.equals(anchor);
      if (navigation) target.current = anchor;
      proposed.current = null;
    }
    // Rows that load in, or are measured, move the target's row: put it back on top.
    show(navigation);
  });

  // Today can ask for the anchor the list already has, as when a controlled anchor didn't follow
  // the user's scroll: the range stays, so no render follows. Show it now.
  useAnchorDateRequests((date, requested) => {
    if (proposing.current) return;
    // Focus moves to the next event and scrolls it into view: the list is where it should be.
    if (keying.current) {
      proposed.current = date;
      return;
    }
    proposed.current = null;
    if (requested === null || !sameRange(requested, shown.current)) return;
    target.current = date;
    show(true);
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Whether the user has scrolled since the list last came to rest. */
    let touched = false;

    const propose = (settled: boolean) => {
      if (!touched || target.current !== null) return;
      const item = virtualizer.getVirtualItemForOffset(element.scrollTop);
      const row = item === undefined ? undefined : latest.current.rows[item.index];
      if (row === undefined) return;
      const date = rowDate(row);
      const { anchor, range } = latest.current;
      const away = Math.abs(anchor.until(date).days);
      const half = anchor.until(range.end).days / 2;
      if (away === 0 || (!settled && away < half) || proposed.current?.equals(date) === true) {
        return;
      }
      proposed.current = date;
      proposing.current = true;
      try {
        latest.current.onScroll(date);
      } finally {
        proposing.current = false;
      }
      // Scrolled past the last day: the days after it come in above the end row, which stays put,
      // so bring the first of them to the top.
      if (row.kind === "end") target.current = date;
    };
    const settle = () => {
      timer = undefined;
      propose(true);
      touched = false;
    };
    const onScrollEvent = () => {
      propose(false);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    const onScrollEnd = () => {
      if (timer !== undefined) clearTimeout(timer);
      settle();
    };
    const onInput = (event: Event) => {
      target.current = null;
      heading.current = null;
      touched = true;
      if (event instanceof KeyboardEvent && NAVIGATION_KEYS.has(event.key)) {
        // The calendar handles the key as it bubbles on, then the flag clears. Browsers run
        // microtasks between listeners, so only a task waits for the calendar's.
        keying.current = true;
        setTimeout(() => {
          keying.current = false;
        });
      }
    };

    element.addEventListener("scroll", onScrollEvent, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);
    for (const type of INPUTS) element.addEventListener(type, onInput, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScrollEvent);
      element.removeEventListener("scrollend", onScrollEnd);
      for (const type of INPUTS) element.removeEventListener(type, onInput);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [scrollRef, virtualizer]);
}
