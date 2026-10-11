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
/** How far a finger moves past an end of the list before the swipe moves the calendar on. */
const SWIPE_PX = 24;
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
 * other anchor, from mounting, Today, Next, or a picked date, jumps the list to put that date, or
 * the next one with events, on top, and holds it there while rows load in, until the user
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
  // Read by event handlers, so they see the latest render without subscribing again.
  const latest = useRef({ anchor, onScroll, range, rows });
  useInsertionEffect(() => {
    latest.current = { anchor, onScroll, range, rows };
  });

  /**
   * Scrolls the target's row to the top, at once: a jump, as Google Calendar's agenda makes, which
   * motion settings needn't tone down and data arriving on the way can't stop short.
   */
  const show = useCallback(() => {
    const element = scrollRef.current;
    const date = target.current;
    if (element === null || date === null) return;
    const index = rowFrom(latest.current.rows, date);
    const offset = virtualizer.getOffsetForIndex(index, "start")?.[0];
    if (offset === undefined || Math.abs(offset - element.scrollTop) < 1) return;
    virtualizer.scrollToIndex(index, { align: "start", behavior: "auto" });
  }, [scrollRef, virtualizer]);

  useLayoutEffect(() => {
    if (!sameRange(shown.current, range)) {
      shown.current = range;
      // An anchor that caught up with the user's latest scroll leaves the list where it is; any
      // other is navigation, which the list follows.
      if (proposed.current === null || !proposed.current.equals(anchor)) target.current = anchor;
      proposed.current = null;
    }
    // Rows that load in, or are measured, move the target's row: put it back on top.
    show();
  });

  // Today can ask for the anchor the list already has, as when a controlled anchor didn't follow
  // the user's scroll: the range stays, so no render follows. Show it now.
  useAnchorDateRequests((date, requested) => {
    if (proposing.current) return;
    // Focus moves to the next event and scrolls it into view: the list is where it should be.
    // From the empty state there's no event to follow, so the list holds the date as days load.
    if (keying.current) {
      proposed.current = date;
      const rows = latest.current.rows;
      if (rows.some((row) => row.kind === "empty" || (row.kind === "end" && row.shown))) {
        target.current = date;
      }
      return;
    }
    proposed.current = null;
    if (requested === null || !sameRange(requested, shown.current)) return;
    target.current = date;
    show();
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    /** Whether the user has scrolled since the list last came to rest. */
    let touched = false;
    /** Whether a finger or mouse button is down, so a pause doesn't end the user's scroll. */
    let touching = false;
    let pressing = false;
    /** Set during a wheel gesture that has moved the calendar on past an end, and which way. */
    let wheeledOn: ReturnType<typeof setTimeout> | undefined;
    let wheeledLater = true;
    /** Where the finger was when it last moved the list, and whether its swipe moved past an end. */
    let fingerY: number | null = null;
    let swipedOn = false;

    const moveTo = (date: Temporal.PlainDate) => {
      proposed.current = date;
      proposing.current = true;
      try {
        latest.current.onScroll(date);
      } finally {
        proposing.current = false;
      }
    };

    /** The end row, when the list is at its end and can't scroll on to later days. */
    const endOnTop = () => {
      const item = virtualizer.getVirtualItemForOffset(element.scrollTop);
      const row = item === undefined ? undefined : latest.current.rows[item.index];
      const atEnd = element.scrollTop >= element.scrollHeight - element.clientHeight - 1;
      return row?.kind === "end" && atEnd ? row : undefined;
    };
    /** Whether the list can't scroll on that way: past its last day, or to before its first. */
    const atEnd = (later: boolean) => (later ? endOnTop() !== undefined : element.scrollTop <= 0);

    /**
     * At either end of the loaded days the list can't scroll on, so scrolling on moves the calendar
     * a page that way instead: the list crosses weeks without events. Days that load in above wait
     * there; past the last day, the list holds the date it moved to on top as days load in.
     * Returns whether it moved.
     */
    const pastEnd = (later: boolean): boolean => {
      if (!atEnd(later)) return false;
      // This move, not the scroll that reached the end, says where the calendar is.
      clearTimeout(timer);
      touched = false;
      const { anchor, range } = latest.current;
      const row = endOnTop();
      if (later && row !== undefined) {
        const date = Temporal.PlainDate.compare(row.from, anchor) > 0 ? row.from : range.end;
        moveTo(date);
        target.current = date;
      } else {
        moveTo(anchor.subtract(anchor.until(range.end)));
      }
      return true;
    };

    const propose = (settled: boolean) => {
      if (!touched || target.current !== null) return;
      const item = virtualizer.getVirtualItemForOffset(element.scrollTop);
      const { anchor, range, rows } = latest.current;
      const row = item === undefined ? undefined : rows[item.index];
      if (item === undefined || row === undefined) return;
      // The anchor's own row on top, the first from its date, is where the list should be. Back
      // there at rest, the list says so, so an owner still holding an earlier scroll drops it.
      if (item.index === rowFrom(rows, anchor)) {
        if (settled && proposed.current !== null && !proposed.current.equals(anchor)) {
          moveTo(anchor);
        }
        return;
      }
      const date = rowDate(row);
      const away = Math.abs(anchor.until(date).days);
      const half = anchor.until(range.end).days / 2;
      if ((!settled && away < half) || proposed.current?.equals(date) === true) return;
      moveTo(date);
      // Scrolled past the last day: the days after it come in above the end row, which stays put,
      // so bring the first of them to the top.
      if (row.kind === "end") target.current = date;
    };
    const settle = () => {
      timer = undefined;
      propose(true);
      // A finger or the scrollbar held still is the same scroll, which goes on when it moves.
      if (!touching && !pressing) touched = false;
    };
    const onScrollEvent = () => {
      propose(false);
      clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    const onScrollEnd = () => {
      clearTimeout(timer);
      settle();
    };
    const onInput = (event: Event) => {
      if (event instanceof WheelEvent && wheeledOn !== undefined) {
        // The rest of a wheel gesture that moved past an end, which holds the date it moved to
        // while it pushes on against that end. Turning back, or scrolling on through days that
        // have loaded, is the user's own scroll again.
        clearTimeout(wheeledOn);
        wheeledOn = undefined;
        if (event.deltaY !== 0 && event.deltaY > 0 === wheeledLater && atEnd(wheeledLater)) {
          wheeledOn = setTimeout(() => {
            wheeledOn = undefined;
          }, SETTLE_MS);
          return;
        }
      }
      target.current = null;
      touched = true;
      // Once per wheel gesture, which ends when the wheel has been still a moment.
      if (event instanceof WheelEvent && event.deltaY !== 0 && pastEnd(event.deltaY > 0)) {
        wheeledLater = event.deltaY > 0;
        wheeledOn = setTimeout(() => {
          wheeledOn = undefined;
        }, SETTLE_MS);
      }
      // Desktop Safari has no `TouchEvent` to test against.
      if (event.type === "touchstart") {
        touching = true;
        swipedOn = false;
        fingerY = (event as TouchEvent).touches[0]?.clientY ?? null;
      }
      if (event.type === "pointerdown" && (event as PointerEvent).pointerType === "mouse") {
        pressing = true;
      }
      if (event instanceof KeyboardEvent && NAVIGATION_KEYS.has(event.key)) {
        // The calendar handles the key as it bubbles on, then the flag clears. Browsers run
        // microtasks between listeners, so only a task waits for the calendar's.
        keying.current = true;
        setTimeout(() => {
          keying.current = false;
        });
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      touched = true;
      const y = event.touches[0]?.clientY;
      if (y === undefined || fingerY === null || Math.abs(fingerY - y) < SWIPE_PX) return;
      // A finger moving up scrolls toward later days; a swipe moves past an end once.
      if (!swipedOn) swipedOn = pastEnd(y < fingerY);
      fingerY = y;
    };
    const onTouchEnd = () => {
      touching = false;
    };
    const onPointerUp = () => {
      pressing = false;
    };
    const view = element.ownerDocument.defaultView;

    element.addEventListener("scroll", onScrollEvent, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    for (const type of ["touchend", "touchcancel"]) element.addEventListener(type, onTouchEnd);
    // The button can come up anywhere, as after dragging the scrollbar off the list.
    for (const type of ["pointerup", "pointercancel"]) view?.addEventListener(type, onPointerUp);
    for (const type of INPUTS) element.addEventListener(type, onInput, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScrollEvent);
      element.removeEventListener("scrollend", onScrollEnd);
      element.removeEventListener("touchmove", onTouchMove);
      for (const type of ["touchend", "touchcancel"]) element.removeEventListener(type, onTouchEnd);
      for (const type of ["pointerup", "pointercancel"]) {
        view?.removeEventListener(type, onPointerUp);
      }
      for (const type of INPUTS) element.removeEventListener(type, onInput);
      clearTimeout(timer);
      clearTimeout(wheeledOn);
    };
  }, [scrollRef, virtualizer]);
}
