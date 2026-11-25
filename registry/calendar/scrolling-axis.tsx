"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import {
  scrollSnapPointClass,
  scrollSnapPointsClass,
} from "@registry/shared/calendar/scrolling-axis.styles";
import {
  createScrollingAxis,
  scrollingAxisCount,
  snapPointOffset,
  type ScrollingAxisInput,
  type ScrollingAxisOptions,
} from "@registry/shared/calendar/scrolling-axis-controller";

export { epochDay, fromEpochDay } from "@registry/shared/calendar/scrolling-axis-controller";
export type { ScrollingAxisOptions };

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

/**
 * The scrolling axis (`scrolling-axis-controller.ts`) in a React component: a scroll axis that
 * never ends, whose settled position becomes the calendar's range, and which scrolls to any other
 * range. Scroll positions are never React state, so scrolling renders only when the range moves.
 */
export function useScrollingAxis(options: ScrollingAxisOptions): ScrollingAxis {
  const scrollRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [base, setBase] = useState(options.first);
  // Read by the controller's handlers, so they see the latest render without re-subscribing.
  const latest = useRef<ScrollingAxisInput>({ ...options, base, setBase });
  const [axis] = useState(() =>
    createScrollingAxis(
      { scroll: () => scrollRef.current, track: () => trackRef.current },
      () => latest.current,
    ),
  );

  useLayoutEffect(() => {
    latest.current = { ...options, base, setBase };
    axis.place();
  });
  useLayoutEffect(() => axis.attach(), [axis, options.axis, options.page, options.rtl]);

  return {
    base,
    count: scrollingAxisCount(options.page),
    request: axis.request,
    scrollRef,
    trackRef,
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
export function ScrollSnapPoints({ axis, base, points, size }: ScrollSnapPointsProps) {
  return (
    <div aria-hidden className={scrollSnapPointsClass}>
      {points.map((item) => (
        <div
          key={item}
          className={scrollSnapPointClass(axis)}
          style={
            axis === "inline"
              ? { insetInlineStart: snapPointOffset(item, base, size) }
              : { top: snapPointOffset(item, base, size) }
          }
        />
      ))}
    </div>
  );
}
