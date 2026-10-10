import { useLayoutEffect, useRef, type RefObject } from "react";

/** Without a current time in view, open the day at 08:00. */
const DEFAULT_SCROLL_FRACTION = 8 / 24;

/**
 * Keeps `--calendar-header-height` on the scrolling element at the sticky header's height, so its
 * `scroll-padding-top` clears the header and focus never scrolls a slot in beneath it. Returns
 * the header's ref.
 */
export function useStickyHeaderPadding(scrollRef: RefObject<HTMLElement | null>) {
  const headerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const header = headerRef.current;
    const scroller = scrollRef.current;
    if (header === null || scroller === null) return;
    const sync = () =>
      scroller.style.setProperty("--calendar-header-height", `${header.offsetHeight}px`);
    sync();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    return () => observer.disconnect();
  }, [scrollRef]);
  return headerRef;
}

export interface OpeningTimeOptions {
  /** The 24-hour row below the header. */
  readonly bodyRef: RefObject<HTMLElement | null>;
  readonly headerRef: RefObject<HTMLElement | null>;
  readonly now: Temporal.Instant | null;
  /** The current time's position down a day, when a rendered day shows it. */
  readonly nowTop: number | null;
  readonly scrollRef: RefObject<HTMLElement | null>;
}

/**
 * Once the first clock sample arrives (after hydration, `now` starts as null), scrolls the hours
 * to the current time, a third of the way down the space below the sticky header, or to 08:00
 * when no rendered day shows it. Later ticks and scrolling keep the user's position.
 */
export function useOpeningTime({ bodyRef, headerRef, now, nowTop, scrollRef }: OpeningTimeOptions) {
  const opened = useRef(false);
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const body = bodyRef.current;
    if (opened.current || scroller === null || body === null || now === null) return;
    opened.current = true;
    const visible = scroller.clientHeight - (headerRef.current?.offsetHeight ?? 0);
    scroller.scrollTop =
      nowTop === null
        ? DEFAULT_SCROLL_FRACTION * body.offsetHeight
        : Math.max(0, nowTop * body.offsetHeight - visible / 3);
  }, [bodyRef, headerRef, now, nowTop, scrollRef]);
}
