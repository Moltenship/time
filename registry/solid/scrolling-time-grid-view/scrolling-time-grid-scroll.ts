import { createEffect, onCleanup, onSettled, untrack, type Accessor } from "solid-js";

import {
  attachStickyHeaderPadding,
  createDaysFollower,
  scrollToOpeningTime,
} from "@registry/shared/scrolling-time-grid-view/time-grid-scroll";

/**
 * Keeps `--calendar-header-height` on the scrolling element at the sticky header's height, so its
 * `scroll-padding-top` clears the header and focus never scrolls a slot in beneath it.
 */
export function useStickyHeaderPadding(
  scroller: () => HTMLElement | undefined,
  header: () => HTMLElement | undefined,
): void {
  onSettled(() => {
    const scrollElement = scroller();
    const headerElement = header();
    if (scrollElement === undefined || headerElement === undefined) return;
    return attachStickyHeaderPadding(scrollElement, headerElement);
  });
}

/**
 * Moves the header's days with the days scrolling below it, and pins the all-day bars' titles to
 * the start of the days on screen; see `createDaysFollower`. `rendered` reads what moves the
 * days' canvas and the bars, such as the projection and the canvas's base: the followers are
 * laid out again after each change of it. Returns the ref for each element that follows the
 * days.
 */
export function useDaysFollower(
  days: () => HTMLElement | undefined,
  rtl: Accessor<boolean>,
  rendered: () => unknown,
): (element: HTMLElement) => void {
  const follower = createDaysFollower(days, () => untrack(rtl));
  const stops: (() => void)[] = [];
  onCleanup(() => {
    for (const stop of stops.splice(0)) stop();
  });
  createEffect(
    () => {
      rendered();
      return rtl();
    },
    () => follower.layout(),
  );
  onSettled(() => follower.attach());

  return (element) => {
    stops.push(follower.follow(element));
  };
}

export interface OpeningTimeOptions {
  /** The 24-hour row below the header. */
  readonly body: () => HTMLElement | undefined;
  readonly header: () => HTMLElement | undefined;
  readonly now: Accessor<Temporal.Instant | null>;
  /** The current time's position down a day, when a rendered day shows it. */
  readonly nowTop: Accessor<number | null>;
  /** The element that scrolls the hours. */
  readonly scroller: () => HTMLElement | undefined;
}

/**
 * Once the first clock sample arrives (after hydration, `now` starts as null), scrolls the hours
 * to the current time, a third of the way down the space below the sticky header, or to 08:00
 * when no rendered day shows it. Later ticks and scrolling keep the user's position.
 */
export function useOpeningTime(options: OpeningTimeOptions): void {
  let opened = false;
  createEffect(
    () => ({ now: options.now(), top: options.nowTop() }),
    ({ now, top }) => {
      const scroller = options.scroller();
      const body = options.body();
      if (opened || scroller === undefined || body === undefined || now === null) return;
      opened = true;
      scrollToOpeningTime({ body, header: options.header(), scroller }, top);
    },
  );
}
