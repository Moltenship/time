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
 * A bar title held at the start of the days on screen while its bar's start is scrolled past, as
 * `position: sticky` would hold it in a scrolling element. Offsets are along the days' scroll from
 * their inline start.
 */
interface Pin {
  /** The scroll offset where the title starts to move. */
  readonly from: number;
  /** How far it can move before it reaches its bar's end. */
  readonly room: number;
}

/** Bar titles in a follower, which pin to the start of the days on screen. */
const TITLES = '[data-slot="calendar-event-title"]';

/**
 * Moves the header's days with the days scrolling below it, by a transform taken from their
 * scroll position, and pins the all-day bars' titles to the start of the days on screen. Where the
 * browser has scroll timelines, each transform is an animation on one, which the browser runs
 * with the scroll itself, off the main thread where it can. Scroll events reach the page later,
 * and Safari renders the page no more than 60 times a second by default while it scrolls at 120,
 * so a header following them trails a swipe. Without scroll timelines it follows the scroll
 * events. Returns the ref for each element that follows the days.
 */
export function useDaysFollower(daysRef: RefObject<HTMLElement | null>, rtl: boolean) {
  const followers = useRef(new Map<HTMLElement, Animation | null>());
  const pins = useRef(new Map<HTMLElement, { animation: Animation | null; pin: Pin }>());
  const laidOut = useRef<Reach | null>(null);
  const latestRtl = useRef(rtl);

  /** Lays the followers out for the days' scroll range, which a render or a resize can change. */
  const layout = useCallback(() => {
    const days = daysRef.current;
    if (days === null) return;
    // Every measurement before any write, so a render costs one layout, not one per title.
    const reach: Reach = {
      distance: Math.max(0, days.scrollWidth - days.clientWidth),
      rtl: latestRtl.current,
    };
    const offset = Math.abs(days.scrollLeft);
    const inset = parseFloat(getComputedStyle(days.ownerDocument.documentElement).fontSize) / 2;
    const measured = new Map<HTMLElement, Pin>();
    for (const element of followers.current.keys()) {
      for (const title of element.querySelectorAll<HTMLElement>(TITLES)) {
        const pin = pinned(title, element, reach.rtl, inset);
        if (pin !== null) measured.set(title, pin);
      }
    }

    const changed =
      laidOut.current?.distance !== reach.distance || laidOut.current.rtl !== reach.rtl;
    laidOut.current = reach;
    const view = days.ownerDocument.defaultView;
    let shared: ScrollTimeline | undefined;
    const timeline =
      view === null || typeof view.ScrollTimeline !== "function"
        ? undefined
        : () => (shared ??= new view.ScrollTimeline({ axis: "inline", source: days }));
    for (const [element, animation] of followers.current) {
      // RTL `scrollLeft` is negative, so the same negation moves content the right way. A new
      // animation takes over from the next frame, so this places the follower until then.
      element.style.transform = `translateX(${-days.scrollLeft}px)`;
      if (animation === null && timeline !== undefined) {
        followers.current.set(
          element,
          element.animate(keyframes(reach), {
            easing: "linear",
            fill: "both",
            timeline: timeline(),
          }),
        );
      } else if (animation !== null && changed) {
        (animation.effect as KeyframeEffect | null)?.setKeyframes(keyframes(reach));
      }
    }

    // A running pin stays as long as its title and bar haven't moved: a new animation takes a
    // frame to start, in which a pinned title would slide with its bar.
    for (const [title, { animation, pin }] of pins.current) {
      const now = measured.get(title);
      if (now !== undefined && !changed && samePin(now, pin)) {
        measured.delete(title);
        continue;
      }
      animation?.cancel();
      title.style.transform = "";
      pins.current.delete(title);
    }
    const sign = reach.rtl ? -1 : 1;
    for (const [title, pin] of measured) {
      title.style.transform = `translateX(${sign * shiftAt(pin, offset)}px)`;
      const animation =
        timeline === undefined || reach.distance <= 0
          ? null
          : title.animate(pinKeyframes(pin, reach), {
              easing: "linear",
              fill: "both",
              timeline: timeline(),
            });
      pins.current.set(title, { animation, pin });
    }
  }, [daysRef]);

  // Each render: it can move the days' canvas and the bars, and the followers can be new.
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
      const offset = Math.abs(days.scrollLeft);
      const sign = latestRtl.current ? -1 : 1;
      for (const [title, { pin }] of pins.current) {
        title.style.transform = `translateX(${sign * shiftAt(pin, offset)}px)`;
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
      for (const [title, { animation }] of pins.current) {
        if (!element.contains(title)) continue;
        animation?.cancel();
        pins.current.delete(title);
      }
    };
  }, []);
}

function keyframes({ distance, rtl }: Reach): Keyframe[] {
  return [
    { transform: "translateX(0px)" },
    { transform: `translateX(${rtl ? distance : -distance}px)` },
  ];
}

/**
 * Where `title` starts to move along its bar, as a scroll offset from the days' inline start, and
 * how far it can: it stays put while the bar's start is on screen, then moves with the scroll,
 * `inset` in from the start of the days, until it reaches the bar's end. `null` for a title with no
 * room to move. Positions are along the inline axis from the start of `track`, the follower the
 * bar is in.
 */
function pinned(title: HTMLElement, track: HTMLElement, rtl: boolean, inset: number): Pin | null {
  const bar = title.parentElement;
  if (bar === null) return null;
  // The bar's box, and the title's place in it from layout, which its own shift doesn't move.
  const box = track.getBoundingClientRect();
  const barBox = bar.getBoundingClientRect();
  const left = barBox.left + bar.clientLeft + title.offsetLeft;
  const right = left + title.offsetWidth;
  const padding = parseFloat(
    rtl ? getComputedStyle(bar).paddingLeft : getComputedStyle(bar).paddingRight,
  );
  const text = rtl
    ? { end: box.right - left, start: box.right - right }
    : { end: right - box.left, start: left - box.left };
  const barEnd = (rtl ? box.right - barBox.left : barBox.right - box.left) - padding;
  const room = barEnd - text.end;
  if (room <= 0) return null;
  return { from: text.start - inset, room };
}

/** Whether a title's pin is where it was, within half a pixel. */
function samePin(a: Pin, b: Pin): boolean {
  return Math.abs(a.from - b.from) < 0.5 && Math.abs(a.room - b.room) < 0.5;
}

/** How far a pinned title has moved at a scroll offset. */
function shiftAt({ from, room }: Pin, offset: number): number {
  return Math.min(room, Math.max(0, offset - from));
}

/**
 * A pin as keyframes over the days' scroll range. It's linear between the offsets where the title
 * starts and stops moving, so keyframes at those offsets trace it exactly.
 */
function pinKeyframes(pin: Pin, { distance, rtl }: Reach): Keyframe[] {
  const sign = rtl ? -1 : 1;
  const clamp = (offset: number) => Math.min(distance, Math.max(0, offset));
  const offsets = [0, clamp(pin.from), clamp(pin.from + pin.room), distance];
  return offsets
    .filter((offset, index) => index === 0 || offset > offsets[index - 1]!)
    .map((offset) => ({
      offset: offset / distance,
      transform: `translateX(${sign * shiftAt(pin, offset)}px)`,
    }));
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
