import { createEffect, createMemo, For, untrack, type Accessor } from "solid-js";

import {
  createScrollingAxis,
  scrollingAxisBase,
  scrollingAxisCount,
  scrollingAxisRebase,
  snapPointOffset,
  type ScrollingAxisInput,
  type ScrollingAxisOptions,
} from "@registry/shared/calendar/scrolling-axis-controller";
import {
  scrollSnapPointClass,
  scrollSnapPointsClass,
} from "@registry/shared/calendar/scrolling-axis.styles";

export { epochDay, fromEpochDay } from "@registry/shared/calendar/scrolling-axis-controller";
export type { ScrollingAxisOptions };

export interface ScrollingAxis {
  /** The number of the canvas's first item; item `n` sits `n - base` items from its start. */
  readonly base: Accessor<number>;
  /** Items the canvas holds from `base`. */
  readonly count: Accessor<number>;
  /**
   * Tells the axis the calendar was asked to show `first` first, as Today and Next ask: pass it
   * each `useAnchorDateRequests` date. A request ends any scroll still waiting for the range, and
   * one for the range the calendar already has scrolls the view back to it.
   */
  readonly request: (first: number) => void;
  /** The scrolling element, once it exists. */
  readonly scrollElement: () => HTMLDivElement | undefined;
  /** The ref of the scrolling element. */
  readonly scrollRef: (element: HTMLDivElement) => void;
  /**
   * The ref of an element `count` items long on the axis, where the items are positioned. Its
   * length sizes them: one item's own length is rounded to layout units, an error that would grow
   * a thousandfold across the canvas.
   */
  readonly trackRef: (element: HTMLDivElement) => void;
}

/**
 * The scrolling axis (`scrolling-axis-controller.ts`) in a Solid component: a scroll axis that
 * never ends, whose settled position becomes the calendar's range, and which scrolls to any other
 * range. Scroll positions are never signals, so scrolling renders only when the range moves.
 */
export function useScrollingAxis(options: Accessor<ScrollingAxisOptions>): ScrollingAxis {
  let scrollElement: HTMLDivElement | undefined;
  let trackElement: HTMLDivElement | undefined;
  // The canvas starts with the range in its middle, and recentres as the range nears either end,
  // in the same flush as the range that moves it, so the axis never corrects it after a render.
  const base = createMemo<number>((previous) => {
    const { first, page } = options();
    return previous === undefined
      ? scrollingAxisBase(first)
      : scrollingAxisRebase(previous, first, page);
  });
  const setBase = () => {};
  // What the controller reads: the options and base as last rendered.
  let latest: ScrollingAxisInput = { ...untrack(options), base: untrack(base), setBase };
  const axis = createScrollingAxis(
    { scroll: () => scrollElement, track: () => trackElement },
    () => latest,
  );

  // After each render: the canvas and the range as rendered, which the scroll position follows.
  createEffect(
    () => ({ ...options(), base: base() }),
    (input) => {
      latest = { ...input, setBase };
      axis.place();
    },
  );
  // Listens again only when the axis, the page, or the direction changes.
  const shape = createMemo(() => {
    const { axis: direction, page, rtl } = options();
    return `${direction} ${page} ${rtl}`;
  });
  createEffect(shape, () => axis.attach());

  return {
    base,
    count: () => scrollingAxisCount(options().page),
    request: axis.request,
    scrollElement: () => scrollElement,
    scrollRef: (element) => {
      scrollElement = element;
    },
    trackRef: (element) => {
      trackElement = element;
    },
  };
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
export function ScrollSnapPoints(props: ScrollSnapPointsProps) {
  return (
    <div aria-hidden="true" class={scrollSnapPointsClass}>
      <For each={props.points}>
        {(item) => (
          <div
            class={scrollSnapPointClass(props.axis)}
            style={
              props.axis === "inline"
                ? { "inset-inline-start": snapPointOffset(item, props.base, props.size) }
                : { top: snapPointOffset(item, props.base, props.size) }
            }
          />
        )}
      </For>
    </div>
  );
}
