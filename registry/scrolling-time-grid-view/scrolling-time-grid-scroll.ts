import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  attachStickyHeaderPadding,
  createDaysFollower,
  scrollToOpeningTime,
} from "@registry/shared/scrolling-time-grid-view/time-grid-scroll";

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
    return attachStickyHeaderPadding(scroller, header);
  }, [scrollRef]);
  return headerRef;
}

/**
 * Moves the header's days with the days scrolling below it, and pins the all-day bars' titles to
 * the start of the days on screen; see `createDaysFollower`. Returns the ref for each element
 * that follows the days.
 */
export function useDaysFollower(daysRef: RefObject<HTMLElement | null>, rtl: boolean) {
  const latestRtl = useRef(rtl);
  const [follower] = useState(() =>
    createDaysFollower(
      () => daysRef.current,
      () => latestRtl.current,
    ),
  );

  // Each render: it can move the days' canvas and the bars, and the followers can be new.
  useLayoutEffect(() => {
    latestRtl.current = rtl;
    follower.layout();
  });
  useLayoutEffect(() => follower.attach(), [follower]);

  return useCallback(
    (element: HTMLElement | null) => (element === null ? undefined : follower.follow(element)),
    [follower],
  );
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
    scrollToOpeningTime({ body, header: headerRef.current, scroller }, nowTop);
  }, [bodyRef, headerRef, now, nowTop, scrollRef]);
}
