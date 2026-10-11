import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { cn } from "cn";

/** Items the canvas holds on each side of the view: years of days, far past any swipe. */
const REACH = 1000;
/** Without `scrollend`, a scroll has settled once it has been still this long. */
const SETTLE_MS = 120;

/** `1970-01-01`, from which days and weeks are numbered. */
const EPOCH = Temporal.PlainDate.from("1970-01-01");

/** A date's number of days from 1970-01-01, which places it on a scrolling axis of days. */
export function epochDay(date: Temporal.PlainDate): number {
  return EPOCH.until(date).days;
}

export function fromEpochDay(day: number): Temporal.PlainDate {
  return EPOCH.add({ days: day });
}

export interface ScrollingAxisOptions {
  /** Which way the items run: days across the inline axis, or weeks down the block axis. */
  readonly axis: "block" | "inline";
  /** The number of the first item the calendar's range shows, such as `epochDay(range.start)`. */
  readonly first: number;
  /**
   * Moves the calendar to show `first` first, once the user has scrolled there: at rest, or as a
   * long swipe or a drag passes halfway to another page, so the loaded pages keep up with it. A
   * controlled anchor may accept the latest of these later; until it changes, the view stays
   * where the user scrolled, and any other anchor moves the view to it.
   */
  readonly onScroll: (first: number) => void;
  /** Items the calendar shows at once: its days or weeks. */
  readonly page: number;
  /** Whether the inline axis runs right to left. */
  readonly rtl: boolean;
  /**
   * The item a page starts at nearest `item`, a position that can fall between two items: where
   * the view comes to rest, and the first item it moves the calendar to. A week's pages are whole
   * weeks from its range, a month's the weeks that hold each month's first day. Render
   * `ScrollSnapPoints` at the same items, on a scrolling element with a mandatory snap type.
   */
  readonly snapTo: (item: number) => number;
}

export interface ScrollingAxis {
  /** The number of the canvas's first item; item `n` sits `n - base` items from its start. */
  readonly base: number;
  /** Items the canvas holds from `base`. */
  readonly count: number;
  /**
   * Tells the axis the calendar was asked to show `first` first, as Today and Next ask: pass it
   * each `useAnchorDateRequests` date. A request ends any scroll still waiting for the range, and
   * one for the range the calendar already has scrolls the view back to it.
   */
  readonly request: (first: number) => void;
  /** The scrolling element. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  /**
   * An element `count` items long on the axis, where the items are positioned. Its length sizes
   * them: one item's own length is rounded to layout units, an error that would grow a
   * thousandfold across the canvas.
   */
  readonly trackRef: RefObject<HTMLDivElement | null>;
}

function prefersReducedMotion(element: Element): boolean {
  return (
    element.ownerDocument.defaultView?.matchMedia?.("(prefers-reduced-motion: reduce)").matches ===
    true
  );
}

/**
 * A scroll axis that never ends: numbered items, such as days, on a canvas `2 × REACH` items
 * long, of which the view renders only those near the calendar's range. The user swipes a page
 * at a time, coming to rest where `snapTo` says a page starts, and each settled position becomes
 * the calendar's range through `onScroll`. When the range changes otherwise, as Today and Next do,
 * the axis scrolls there: smoothly over a page or two, at once further away, from the keyboard, or
 * with reduced motion. Scroll positions are never React state, so scrolling renders only when the
 * range moves.
 *
 * Server markup and the first render put the range at the canvas's start, so the page shows it
 * before scripts run. Once laid out, the canvas extends before it and the scroll position follows
 * before paint. It recentres the same way when the range nears either end.
 */
export function useScrollingAxis({
  axis,
  first,
  onScroll,
  page,
  rtl,
  snapTo,
}: ScrollingAxisOptions): ScrollingAxis {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(first);
  const count = 2 * REACH + page;

  // Read by event handlers, so they see the latest render without re-subscribing.
  const latest = useRef({ base, first, onScroll, page, snapTo });
  /** The base, direction, and item size the scroll position was last laid out for. */
  const laidOut = useRef(base);
  const laidOutRtl = useRef(rtl);
  const laidOutSize = useRef(0);
  /** The first item the scroll position shows: the range's, or one the user scrolled to. */
  const shown = useRef<number | null>(null);
  /** The range's first item when the axis last laid it out. */
  const committed = useRef<number | null>(null);
  /**
   * The last item the user scrolled to, until the calendar's range catches up with it: a
   * controlled anchor can commit after other renders. Only the latest counts, so any other range,
   * however it came about, is navigation the view follows.
   */
  const proposed = useRef<number | null>(null);
  /** Where a scroll this hook started is heading; the user's own input clears it. */
  const heading = useRef<number | null>(null);
  /** Set while `onScroll` runs, so the requests it makes aren't taken for navigation. */
  const proposing = useRef(false);

  const size = useCallback(() => {
    const rect = trackRef.current?.getBoundingClientRect();
    return ((axis === "inline" ? rect?.width : rect?.height) ?? 0) / count;
  }, [axis, count]);
  const offset = useCallback(
    (element: HTMLElement) =>
      axis === "inline" ? Math.abs(element.scrollLeft) : element.scrollTop,
    [axis],
  );
  /** How far a new item size moves the shown item: a resize `place` has yet to lay out. */
  const drift = useCallback(
    (itemSize: number) =>
      shown.current === null || laidOutSize.current === 0
        ? 0
        : (shown.current - latest.current.base) * Math.abs(itemSize - laidOutSize.current),
    [],
  );
  const scrollTo = useCallback(
    (element: HTMLElement, position: number, behavior: ScrollBehavior) => {
      // `scrollLeft` counts down from zero in right-to-left layouts.
      const options = axis === "inline" ? { left: rtl ? -position : position } : { top: position };
      if (typeof element.scrollTo === "function") element.scrollTo({ ...options, behavior });
      else if (axis === "inline") element.scrollLeft = options.left!;
      else element.scrollTop = options.top!;
    },
    [axis, rtl],
  );

  /**
   * Lays the scroll position out for the current base and range: follows a canvas that moved,
   * recentres it near its ends, and scrolls to a range the user didn't scroll to.
   */
  const place = useCallback(() => {
    const element = scrollRef.current;
    const itemSize = size();
    if (element === null || itemSize <= 0) return;
    const { base, first, page } = latest.current;
    // A new item size moves every item, as switching between a week and a day or resizing the
    // window does; a fraction of a pixel per item adds up across the canvas, so measure the move.
    if ((drift(itemSize) >= 0.5 || laidOutRtl.current !== rtl) && shown.current !== null) {
      // Browsers also reset `scrollLeft` when the direction flips: put the shown item back.
      heading.current = null;
      scrollTo(element, (shown.current - base) * itemSize, "instant");
      laidOutSize.current = itemSize;
    } else if (laidOut.current !== base) {
      // The canvas moved by whole items; keep what is on screen where it is.
      scrollTo(element, offset(element) + (laidOut.current - base) * itemSize, "instant");
    }
    laidOut.current = base;
    laidOutRtl.current = rtl;
    // Only the size the offset was laid out for, so small changes can't add up unnoticed.
    if (laidOutSize.current === 0) laidOutSize.current = itemSize;
    if (first - base < 2 * page || base + count - first < 3 * page) {
      setBase(first - REACH);
      return;
    }
    if (committed.current === first) return;
    committed.current = first;
    // The range caught up with the user's scroll.
    if (proposed.current === first) {
      proposed.current = null;
      return;
    }
    // Anything else moved the range, such as Today: show it, in place of any scroll on its way.
    proposed.current = null;
    const replacing = heading.current !== null;
    heading.current = null;
    const from = shown.current;
    shown.current = first;
    const target = (first - base) * itemSize;
    if (Math.abs(offset(element) - target) < 1) {
      // Already there, as when Next is undone before its scroll moves: stop that scroll.
      if (replacing) scrollTo(element, target, "instant");
      return;
    }
    // Keys move focus as they scroll, so they jump; so does anything more than two pages away, and
    // anything during a drag, whose auto-scroll would cut an animation short every frame.
    const smooth =
      from !== null &&
      Math.abs(first - from) <= 2 * page &&
      !prefersReducedMotion(element) &&
      !element.contains(element.ownerDocument.activeElement) &&
      element.closest("[data-interaction]") === null;
    // A smooth scroll passes other items on its way, which must not move the calendar there.
    if (smooth) heading.current = first;
    scrollTo(element, target, smooth ? "smooth" : "instant");
  }, [count, drift, offset, rtl, scrollTo, size]);

  useLayoutEffect(() => {
    latest.current = { base, first, onScroll, page, snapTo };
    place();
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const view = element.ownerDocument.defaultView;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waiting: MutationObserver | undefined;

    /** The item the page nearest the start of the view starts at. */
    const nearest = () => {
      const itemSize = size();
      if (itemSize <= 0) return null;
      const { base, snapTo } = latest.current;
      return snapTo(base + offset(element) / itemSize);
    };
    /** A pointer drag, resize, or create is in progress, which snapping must not move. */
    const interacting = () => element.closest("[data-interaction]");
    const show = (item: number) => {
      shown.current = item;
      proposed.current = item;
      proposing.current = true;
      try {
        latest.current.onScroll(item);
      } finally {
        proposing.current = false;
      }
    };
    /**
     * The item size changed and `place` hasn't laid it out, so the offset is about to move: lay
     * it out now, since the size can change without anything observed resizing.
     */
    const unplaced = () => {
      if (drift(size()) < 0.5) return false;
      place();
      return true;
    };

    const settle = (stopped: boolean) => {
      timer = undefined;
      if (unplaced()) return;
      if (heading.current !== null) {
        const target = (heading.current - latest.current.base) * size();
        if (Math.abs(offset(element) - target) > 1) {
          // A scroll this hook started is still on its way, as a pause left over from an earlier
          // scroll can fire mid-way; or it stopped short, as when something else scrolled: finish it.
          if (stopped) scrollTo(element, target, "instant");
          return;
        }
      }
      heading.current = null;
      const region = interacting();
      if (region !== null) {
        // Settle once the gesture ends and the snap points return.
        if (waiting === undefined && view !== null) {
          waiting = new view.MutationObserver(() => {
            if (interacting() !== null) return;
            waiting?.disconnect();
            waiting = undefined;
            settle(true);
          });
          waiting.observe(region, { attributeFilter: ["data-interaction"] });
        }
        return;
      }
      const item = nearest();
      if (item === null) return;
      const target = (item - latest.current.base) * size();
      if (Math.abs(offset(element) - target) > 1) {
        // Snapping normally leaves the view on a page; where the browser didn't, finish the job.
        heading.current = item;
        scrollTo(element, target, prefersReducedMotion(element) ? "instant" : "smooth");
      }
      if (item !== shown.current) show(item);
    };

    const onScrollEvent = () => {
      // A scroll the resize made, clamping the offset, is no position of the user's; the scroll
      // that lays the resize out reports where the view is.
      if (unplaced()) return;
      const item = nearest();
      // Past halfway to another page, during a long swipe or a drag scrolling the view: keep the
      // loaded pages ahead of what comes into view.
      if (
        item !== null &&
        heading.current === null &&
        shown.current !== null &&
        item !== shown.current
      ) {
        show(item);
      }
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS, false);
    };
    const onScrollEnd = () => {
      if (timer !== undefined) clearTimeout(timer);
      settle(true);
    };
    // The user taking over ends a scroll this hook started, so their scroll moves the range.
    const onInput = () => {
      heading.current = null;
    };
    // A new item size moves every item, which `place` puts back once the move is visible. Other
    // resizes, such as the all-day row growing, leave a scroll in progress alone.
    const resize =
      view === null || typeof view.ResizeObserver === "undefined"
        ? undefined
        : new view.ResizeObserver(() => {
            if (size() !== laidOutSize.current) place();
          });

    const inputs = ["pointerdown", "touchstart", "wheel"] as const;
    element.addEventListener("scroll", onScrollEvent, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);
    for (const type of inputs) element.addEventListener(type, onInput, { passive: true });
    resize?.observe(element);
    // The items can resize alone, as when the time grid's gutter widens.
    if (trackRef.current !== null) resize?.observe(trackRef.current);
    return () => {
      element.removeEventListener("scroll", onScrollEvent);
      element.removeEventListener("scrollend", onScrollEnd);
      for (const type of inputs) element.removeEventListener(type, onInput);
      resize?.disconnect();
      waiting?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [drift, offset, place, scrollTo, size]);

  const request = useCallback(
    (item: number) => {
      if (proposing.current) return;
      proposed.current = null;
      if (item !== committed.current) return;
      // The range doesn't change, so no render follows: show it now if the view has moved off it,
      // even mid-scroll, before the scroll has reported where it went. Scrolling there stops the
      // user's scroll, so it can't come to rest elsewhere.
      const element = scrollRef.current;
      const itemSize = size();
      const moved =
        element !== null &&
        itemSize > 0 &&
        Math.abs(offset(element) - (item - latest.current.base) * itemSize) >= 1;
      if (shown.current !== item || moved) {
        committed.current = null;
        place();
      }
    },
    [offset, place, size],
  );

  return { base, count, request, scrollRef, trackRef };
}

export interface ScrollSnapPointsProps {
  readonly axis: "block" | "inline";
  readonly base: number;
  /**
   * The items pages start at, the axis's `snapTo` stops: a few pages either way of the range,
   * past any a swipe reaches before the view renders again.
   */
  readonly points: readonly number[];
  /** One item's length on the axis, as CSS. */
  readonly size: string;
}

/**
 * A snap point where each page starts, so a swipe comes to rest on the next page, as a week does
 * on the next week. Each point stops a fling, so a swipe moves one page. Place it in the element
 * the items are positioned in.
 */
export function ScrollSnapPoints({ axis, base, points, size }: ScrollSnapPointsProps) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {points.map((item) => (
        <div
          key={item}
          // Each point spans the other axis, so it stays in view however far that axis scrolls:
          // browsers skip snap points out of view, which let a fling pass days in a day view
          // scrolled down to the evening.
          className={cn(
            "absolute snap-start snap-always",
            axis === "inline" ? "inset-y-0 w-px" : "inset-x-0 h-px",
          )}
          style={
            axis === "inline"
              ? { insetInlineStart: `calc(${item - base} * ${size})` }
              : { top: `calc(${item - base} * ${size})` }
          }
        />
      ))}
    </div>
  );
}
