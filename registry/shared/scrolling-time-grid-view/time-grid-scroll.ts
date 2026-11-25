/**
 * The scrolling week and day's scroll code, for every framework's view: the sticky header's
 * padding, the header and all-day row following the days sideways, and where the hours open.
 * Each framework calls these from its own lifecycle.
 */

/** Without a current time in view, open the day at 08:00. */
const DEFAULT_SCROLL_FRACTION = 8 / 24;

/**
 * Keeps `--calendar-header-height` on `scroller` at `header`'s height, so its `scroll-padding-top`
 * clears the sticky header and focus never scrolls a slot in beneath it. Returns the cleanup.
 */
export function attachStickyHeaderPadding(scroller: HTMLElement, header: HTMLElement): () => void {
  const sync = () =>
    scroller.style.setProperty("--calendar-header-height", `${header.offsetHeight}px`);
  sync();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(sync);
  observer.observe(header);
  return () => observer.disconnect();
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

export interface DaysFollower {
  /**
   * Listens to the days' scroll and size, once their element exists. Returns the cleanup.
   */
  readonly attach: () => () => void;
  /**
   * Follows the days with `element`, as the header's days and the all-day row do, from the next
   * `layout`. Returns what stops it.
   */
  readonly follow: (element: HTMLElement) => () => void;
  /** Lays the followers out for the days' scroll range, which a render or a resize can change. */
  readonly layout: () => void;
}

/**
 * Moves elements with the days scrolling below them, by a transform taken from their scroll
 * position, and pins the all-day bars' titles to the start of the days on screen. Where the
 * browser has scroll timelines, each transform is an animation on one, which the browser runs
 * with the scroll itself, off the main thread where it can. Scroll events reach the page later,
 * and Safari renders the page no more than 60 times a second by default while it scrolls at 120,
 * so a header following them trails a swipe. Without scroll timelines it follows the scroll
 * events. `days` and `rtl` are read when the followers are laid out.
 */
export function createDaysFollower(
  days: () => HTMLElement | null | undefined,
  rtl: () => boolean,
): DaysFollower {
  const followers = new Map<HTMLElement, Animation | null>();
  const pins = new Map<HTMLElement, { animation: Animation | null; pin: Pin }>();
  let laidOut: Reach | null = null;

  const layout = () => {
    const element = days();
    if (element == null) return;
    // Every measurement before any write, so a render costs one layout, not one per title.
    const reach: Reach = {
      distance: Math.max(0, element.scrollWidth - element.clientWidth),
      rtl: rtl(),
    };
    const offset = Math.abs(element.scrollLeft);
    const inset = parseFloat(getComputedStyle(element.ownerDocument.documentElement).fontSize) / 2;
    const measured = new Map<HTMLElement, Pin>();
    for (const follower of followers.keys()) {
      for (const title of follower.querySelectorAll<HTMLElement>(TITLES)) {
        const pin = pinned(title, follower, reach.rtl, inset);
        if (pin !== null) measured.set(title, pin);
      }
    }

    const changed = laidOut?.distance !== reach.distance || laidOut.rtl !== reach.rtl;
    laidOut = reach;
    const view = element.ownerDocument.defaultView;
    let shared: ScrollTimeline | undefined;
    const timeline =
      view === null || typeof view.ScrollTimeline !== "function"
        ? undefined
        : () => (shared ??= new view.ScrollTimeline({ axis: "inline", source: element }));
    for (const [follower, animation] of followers) {
      // RTL `scrollLeft` is negative, so the same negation moves content the right way. A new
      // animation takes over from the next frame, so this places the follower until then.
      follower.style.transform = `translateX(${-element.scrollLeft}px)`;
      if (animation === null && timeline !== undefined) {
        followers.set(
          follower,
          follower.animate(keyframes(reach), {
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
    const sign = reach.rtl ? -1 : 1;
    for (const [title, { animation, pin }] of pins) {
      const now = measured.get(title);
      if (now !== undefined && !changed && samePin(now, pin)) {
        // Without scroll timelines, the transform is all there is, and the days may have moved.
        title.style.transform = `translateX(${sign * shiftAt(pin, offset)}px)`;
        measured.delete(title);
        continue;
      }
      animation?.cancel();
      title.style.transform = "";
      pins.delete(title);
    }
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
      pins.set(title, { animation, pin });
    }
  };

  const attach = () => {
    const element = days();
    if (element == null) return () => {};
    const view = element.ownerDocument.defaultView;
    // Followers without an animation follow from here, as do new ones until theirs starts.
    const scrolled = () => {
      for (const follower of followers.keys()) {
        follower.style.transform = `translateX(${-element.scrollLeft}px)`;
      }
      const offset = Math.abs(element.scrollLeft);
      const sign = rtl() ? -1 : 1;
      for (const [title, { pin }] of pins) {
        title.style.transform = `translateX(${sign * shiftAt(pin, offset)}px)`;
      }
    };
    element.addEventListener("scroll", scrolled, { passive: true });
    const resize =
      view === null || typeof view.ResizeObserver === "undefined"
        ? undefined
        : new view.ResizeObserver(layout);
    resize?.observe(element);
    if (element.firstElementChild !== null) resize?.observe(element.firstElementChild);
    return () => {
      element.removeEventListener("scroll", scrolled);
      resize?.disconnect();
    };
  };

  const follow = (element: HTMLElement) => {
    // Laid out by the next `layout`, once the days' element is attached too.
    followers.set(element, null);
    return () => {
      followers.get(element)?.cancel();
      followers.delete(element);
      element.style.transform = "";
      for (const [title, { animation }] of pins) {
        if (!element.contains(title)) continue;
        animation?.cancel();
        pins.delete(title);
      }
    };
  };

  return { attach, follow, layout };
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

export interface OpeningTimeElements {
  /** The 24-hour row below the header. */
  readonly body: HTMLElement;
  readonly header: HTMLElement | null | undefined;
  /** The element that scrolls the hours. */
  readonly scroller: HTMLElement;
}

/**
 * Scrolls the hours to the current time at `nowTop`, its position down a day, a third of the way
 * down the space below the sticky header, or to 08:00 when no rendered day shows it (`null`).
 */
export function scrollToOpeningTime(
  { body, header, scroller }: OpeningTimeElements,
  nowTop: number | null,
): void {
  const visible = scroller.clientHeight - (header?.offsetHeight ?? 0);
  scroller.scrollTop =
    nowTop === null
      ? DEFAULT_SCROLL_FRACTION * body.offsetHeight
      : Math.max(0, nowTop * body.offsetHeight - visible / 3);
}
