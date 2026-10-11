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
   * Moves the calendar to show `first` first, once the user has scrolled there: at rest, or every
   * half page during a long swipe or a drag, so the loaded pages keep up with it. A controlled
   * anchor may accept the latest of these later; until it changes, the view stays where the user
   * scrolled, and any other anchor moves the view to it.
   */
  readonly onScroll: (first: number) => void;
  /** Items the calendar shows at once: its days or weeks. */
  readonly page: number;
  /** Whether the inline axis runs right to left. */
  readonly rtl: boolean;
  /**
   * Whether the view comes to rest on an item, as the time grid does on a day. Pair it with
   * `ScrollSnapPoints` and a mandatory snap type on the scrolling element. Without it the view
   * rests wherever the user leaves it, as the month does, and the item nearest the start is the
   * range's first.
   */
  readonly snap: boolean;
}

export interface ScrollingAxis {
  /** The number of the canvas's first item; item `n` sits `n - base` items from its start. */
  readonly base: number;
  /** Items the canvas holds from `base`. */
  readonly count: number;
  /**
   * Without `snap`, the items any part of which shows once the view rests where the range is,
   * `end` exclusive: one more than the range's own where it rests between two. `null` with
   * `snap`, and from a new range until the view comes to rest on it.
   */
  readonly inView: { readonly end: number; readonly start: number } | null;
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
 * long, of which the view renders only those near the calendar's range. The user scrolls freely,
 * coming to rest on an item with `snap`, and each settled position becomes the calendar's range
 * through `onScroll`. When the range changes otherwise, as Today and Next do, the axis
 * scrolls there: smoothly over a page or two, at once further away, from the keyboard, or with
 * reduced motion. Scroll positions are never React state, so scrolling renders only when the
 * range moves, or, without `snap`, when the view comes to rest showing other items.
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
  snap,
}: ScrollingAxisOptions): ScrollingAxis {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(first);
  const count = 2 * REACH + page;
  /** Where a free view last came to rest: the item it showed first, and the items in view. */
  const [rest, setRest] = useState<{ end: number; first: number; start: number } | null>(null);

  // Read by event handlers, so they see the latest render without re-subscribing.
  const latest = useRef({ base, first, onScroll, page, snap });
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
  /**
   * Where the view is, in items with their fraction, for the item size it was laid out for: a
   * resize can clamp the scroll offset before `place` sees it.
   */
  const position = useRef<number | null>(null);

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
    const { base, first, page, snap } = latest.current;
    // A new item size moves every item, as switching between a week and a day or resizing the
    // window does; a fraction of a pixel per item adds up across the canvas, so measure the move.
    if ((drift(itemSize) >= 0.5 || laidOutRtl.current !== rtl) && shown.current !== null) {
      // Browsers also reset `scrollLeft` when the direction flips: put the shown item back. A free
      // view keeps the part of an item it rests past, unless a scroll is on its way to an item.
      const at =
        !snap && heading.current === null && laidOutRtl.current === rtl && position.current !== null
          ? position.current
          : shown.current;
      heading.current = null;
      scrollTo(element, (at - base) * itemSize, "instant");
      position.current = at;
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
    latest.current = { base, first, onScroll, page, snap };
    place();
  });

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const view = element.ownerDocument.defaultView;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let waiting: MutationObserver | undefined;

    /** The item nearest the start of the view. */
    const nearest = () => {
      const itemSize = size();
      return itemSize <= 0 ? null : latest.current.base + Math.round(offset(element) / itemSize);
    };
    /** Without snapping, the view can rest between items: note which of them show. */
    const measure = () => {
      const itemSize = size();
      if (latest.current.snap || itemSize <= 0 || shown.current === null) return;
      const at = offset(element) / itemSize;
      const length = (axis === "inline" ? element.clientWidth : element.clientHeight) / itemSize;
      // A pixel either way is layout rounding, not a sliver of an item.
      const pixel = 1 / itemSize;
      const next = {
        end: latest.current.base + Math.ceil(at + length - pixel),
        first: shown.current,
        start: latest.current.base + Math.floor(at + pixel),
      };
      setRest((current) =>
        current?.end === next.end && current.first === next.first && current.start === next.start
          ? current
          : next,
      );
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

    /** The item size changed and `place` hasn't laid it out, so the offset is about to move. */
    const unplaced = () => drift(size()) >= 0.5;

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
      if (latest.current.snap && Math.abs(offset(element) - target) > 1) {
        // Snapping normally leaves the view on an item; where the browser didn't, finish the job.
        heading.current = item;
        scrollTo(element, target, prefersReducedMotion(element) ? "instant" : "smooth");
      }
      if (item !== shown.current) show(item);
      measure();
    };

    const onScrollEvent = () => {
      // A scroll the resize made, clamping the offset, is no position of the user's.
      if (unplaced()) return;
      const itemSize = size();
      if (itemSize > 0) position.current = latest.current.base + offset(element) / itemSize;
      const item = nearest();
      const { page } = latest.current;
      // During a long swipe, or a drag scrolling the view, keep the loaded pages ahead of what
      // comes into view.
      if (
        item !== null &&
        heading.current === null &&
        shown.current !== null &&
        Math.abs(item - shown.current) >= Math.max(1, Math.floor(page / 2))
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
            measure();
          });

    const inputs = ["pointerdown", "touchstart", "wheel"] as const;
    element.addEventListener("scroll", onScrollEvent, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);
    for (const type of inputs) element.addEventListener(type, onInput, { passive: true });
    resize?.observe(element);
    return () => {
      element.removeEventListener("scroll", onScrollEvent);
      element.removeEventListener("scrollend", onScrollEnd);
      for (const type of inputs) element.removeEventListener(type, onInput);
      resize?.disconnect();
      waiting?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [axis, drift, offset, place, scrollTo, size]);

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

  const inView =
    rest !== null && rest.first === first ? { end: rest.end, start: rest.start } : null;
  return { base, count, inView, request, scrollRef, trackRef };
}

export interface ScrollSnapPointsProps {
  readonly axis: "block" | "inline";
  readonly base: number;
  /** The first item the calendar shows. */
  readonly first: number;
  /** Items the calendar shows at once. */
  readonly page: number;
  /** Stop at every item, so a fling moves one page, as a day view's does. */
  readonly stop?: boolean;
  /** One item's length on the axis, as CSS. */
  readonly size: string;
}

/**
 * One snap point per item for a few pages either way, so a fling comes to rest on a day or week
 * even past the items rendered so far. Place it in the element the items are positioned in.
 */
export function ScrollSnapPoints({ axis, base, first, page, size, stop }: ScrollSnapPointsProps) {
  const reach = 4 * page + 8;
  const points = Array.from({ length: 2 * reach + page }, (_, index) => first - reach + index);
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {points.map((item) => (
        <div
          key={item}
          // Each point spans the other axis, so it stays in view however far that axis scrolls:
          // browsers skip snap points out of view, which let a fling pass days in a day view
          // scrolled down to the evening.
          className={cn(
            "absolute snap-start",
            axis === "inline" ? "inset-y-0 w-px" : "inset-x-0 h-px",
            stop === true && "snap-always",
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
