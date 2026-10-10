import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

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
   * half page during a long swipe, so the loaded pages keep up with it.
   */
  readonly onScroll: (first: number) => void;
  /** Items the calendar shows at once: its days or weeks. */
  readonly page: number;
  /** Whether the inline axis runs right to left. */
  readonly rtl: boolean;
}

export interface ScrollingAxis {
  /** The number of the canvas's first item; item `n` sits `n - base` items from its start. */
  readonly base: number;
  /** Items the canvas holds from `base`. */
  readonly count: number;
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
 * long, of which the view renders only those near the calendar's range. The user scrolls freely
 * (snap points come from `ScrollSnapPoints`), and each settled position becomes the calendar's
 * range through `onScroll`. When the range changes otherwise, as Today and Next do, the axis
 * scrolls there: smoothly over a page or two, at once further away, from the keyboard, or with
 * reduced motion. Scroll positions are never React state, so scrolling renders only when the
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
}: ScrollingAxisOptions): ScrollingAxis {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(first);
  const count = 2 * REACH + page;

  // Read by event handlers, so they see the latest render without re-subscribing.
  const latest = useRef({ base, first, onScroll, page });
  /** The base the scroll position was last laid out for. */
  const laidOut = useRef(base);
  /** The first item the scroll position shows, as far as the calendar knows. */
  const shown = useRef<number | null>(null);
  /** Where a scroll this hook started is heading; the user's own scrolling clears it. */
  const heading = useRef<number | null>(null);

  const size = useCallback(() => {
    const rect = trackRef.current?.getBoundingClientRect();
    return ((axis === "inline" ? rect?.width : rect?.height) ?? 0) / count;
  }, [axis, count]);
  const offset = useCallback(
    (element: HTMLElement) =>
      axis === "inline" ? Math.abs(element.scrollLeft) : element.scrollTop,
    [axis],
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
    if (laidOut.current !== base) {
      // The canvas moved by whole items; keep what is on screen where it is.
      scrollTo(element, offset(element) + (laidOut.current - base) * itemSize, "instant");
      laidOut.current = base;
    }
    if (first - base < 2 * page || base + count - first < 3 * page) {
      setBase(first - REACH);
      return;
    }
    if (shown.current === first) return;
    const from = shown.current;
    shown.current = first;
    const target = (first - base) * itemSize;
    if (Math.abs(offset(element) - target) < 1) return;
    // Keys move focus as they scroll, so they jump; so does anything more than two pages away.
    const smooth =
      from !== null &&
      Math.abs(first - from) <= 2 * page &&
      !prefersReducedMotion(element) &&
      !element.contains(element.ownerDocument.activeElement);
    // A smooth scroll passes other items on its way, which must not move the calendar there.
    if (smooth) heading.current = first;
    scrollTo(element, target, smooth ? "smooth" : "instant");
  }, [count, offset, scrollTo, size]);

  useLayoutEffect(() => {
    latest.current = { base, first, onScroll, page };
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
    /** A pointer drag, resize, or create is in progress: its targets must stay put. */
    const interacting = () => element.closest("[data-interaction]");
    const show = (item: number) => {
      shown.current = item;
      latest.current.onScroll(item);
    };

    const settle = () => {
      timer = undefined;
      heading.current = null;
      const region = interacting();
      if (region !== null) {
        // Settle once the gesture ends and the snap points return.
        if (waiting === undefined && view !== null) {
          waiting = new view.MutationObserver(() => {
            if (interacting() !== null) return;
            waiting?.disconnect();
            waiting = undefined;
            settle();
          });
          waiting.observe(region, { attributeFilter: ["data-interaction"] });
        }
        return;
      }
      const item = nearest();
      if (item === null) return;
      // Snapping normally leaves the view on an item; where the browser didn't, finish the job.
      const target = (item - latest.current.base) * size();
      if (Math.abs(offset(element) - target) > 1) {
        heading.current = item;
        scrollTo(element, target, prefersReducedMotion(element) ? "instant" : "smooth");
      }
      if (item !== shown.current) show(item);
    };

    const onScrollEvent = () => {
      const item = nearest();
      const { page } = latest.current;
      // During a long swipe, keep the loaded pages ahead of what comes into view.
      if (
        item !== null &&
        heading.current === null &&
        interacting() === null &&
        shown.current !== null &&
        Math.abs(item - shown.current) >= Math.max(1, Math.floor(page / 2))
      ) {
        show(item);
      }
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    const onScrollEnd = () => {
      if (timer !== undefined) clearTimeout(timer);
      settle();
    };
    // A new item size moves every item; put the shown one back at the start. Other resizes, such
    // as the all-day row growing, leave a scroll in progress alone.
    let measured = size();
    const resize =
      view === null || typeof view.ResizeObserver === "undefined"
        ? undefined
        : new view.ResizeObserver(() => {
            const itemSize = size();
            if (itemSize <= 0 || Math.abs(itemSize - measured) < 0.5) return;
            measured = itemSize;
            if (shown.current === null) {
              place();
              return;
            }
            scrollTo(element, (shown.current - latest.current.base) * itemSize, "instant");
          });

    element.addEventListener("scroll", onScrollEvent, { passive: true });
    element.addEventListener("scrollend", onScrollEnd);
    resize?.observe(element);
    return () => {
      element.removeEventListener("scroll", onScrollEvent);
      element.removeEventListener("scrollend", onScrollEnd);
      resize?.disconnect();
      waiting?.disconnect();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [offset, place, scrollTo, size]);

  return { base, count, scrollRef, trackRef };
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
          className={
            stop === true
              ? "absolute size-px snap-start snap-always"
              : "absolute size-px snap-start"
          }
          style={
            axis === "inline"
              ? { insetInlineStart: `calc(${item - base} * ${size})`, top: 0 }
              : { insetInlineStart: 0, top: `calc(${item - base} * ${size})` }
          }
        />
      ))}
    </div>
  );
}
