import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

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

/** How far a follower moves across the days' whole scroll range, and which way. */
interface Reach {
  readonly distance: number;
  readonly rtl: boolean;
}

/**
 * Moves the header's days with the days scrolling below it, by a transform taken from their
 * scroll position. Where the browser has scroll timelines, the transform is an animation on one,
 * which the browser runs with the scroll itself, off the main thread where it can. Scroll events
 * reach the page later, and Safari renders the page no more than 60 times a second by default
 * while it scrolls at 120, so a header following them trails a swipe. Without scroll timelines it
 * follows the scroll events. Returns the ref for each element that follows the days.
 */
export function useDaysFollower(daysRef: RefObject<HTMLElement | null>, rtl: boolean) {
  const followers = useRef(new Map<HTMLElement, Animation | null>());
  const laidOut = useRef<Reach | null>(null);
  const latestRtl = useRef(rtl);

  /** Lays the followers out for the days' scroll range, which a render or a resize can change. */
  const layout = useCallback(() => {
    const days = daysRef.current;
    if (days === null) return;
    const reach: Reach = {
      distance: Math.max(0, days.scrollWidth - days.clientWidth),
      rtl: latestRtl.current,
    };
    const changed =
      laidOut.current?.distance !== reach.distance || laidOut.current.rtl !== reach.rtl;
    laidOut.current = reach;
    const view = days.ownerDocument.defaultView;
    for (const [element, animation] of followers.current) {
      // RTL `scrollLeft` is negative, so the same negation moves content the right way. A new
      // animation takes over from the next frame, so this places the follower until then.
      element.style.transform = `translateX(${-days.scrollLeft}px)`;
      if (animation === null && view !== null && typeof view.ScrollTimeline === "function") {
        // The timeline runs from the inline start, which is the right in right-to-left layouts.
        const timeline = new view.ScrollTimeline({ axis: "inline", source: days });
        followers.current.set(
          element,
          element.animate(keyframes(reach), { easing: "linear", fill: "both", timeline }),
        );
      } else if (animation !== null && changed) {
        (animation.effect as KeyframeEffect | null)?.setKeyframes(keyframes(reach));
      }
    }
  }, [daysRef]);

  // Each render: it can move the days' canvas, and the followers can be new.
  useLayoutEffect(() => {
    latestRtl.current = rtl;
    layout();
  });
  useLayoutEffect(() => {
    const days = daysRef.current;
    if (days === null) return;
    const view = days.ownerDocument.defaultView;
    // Followers without an animation follow from here, as do new ones until theirs starts.
    const scrolled = () => {
      for (const element of followers.current.keys()) {
        element.style.transform = `translateX(${-days.scrollLeft}px)`;
      }
    };
    days.addEventListener("scroll", scrolled, { passive: true });
    const resize =
      view === null || typeof view.ResizeObserver === "undefined"
        ? undefined
        : new view.ResizeObserver(layout);
    resize?.observe(days);
    if (days.firstElementChild !== null) resize?.observe(days.firstElementChild);
    return () => {
      days.removeEventListener("scroll", scrolled);
      resize?.disconnect();
    };
  }, [daysRef, layout]);

  return useCallback((element: HTMLElement | null) => {
    if (element === null) return;
    // Laid out by the render's layout effect, once the days' element is attached too.
    followers.current.set(element, null);
    return () => {
      followers.current.get(element)?.cancel();
      followers.current.delete(element);
      element.style.transform = "";
    };
  }, []);
}

function keyframes({ distance, rtl }: Reach): Keyframe[] {
  return [
    { transform: "translateX(0px)" },
    { transform: `translateX(${rtl ? distance : -distance}px)` },
  ];
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
