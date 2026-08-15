import { useCallback, useLayoutEffect, useRef, type Dispatch, type RefObject } from "react";

import type { TimelineDirection } from "./browserApi";
import { logicalInlineOffset, nativeInlineOffset, synchronizeAxes } from "./geometry";

interface DirectionTransition {
  readonly direction: TimelineDirection;
  readonly logicalInline: number;
}

interface TimelineDirectionOptions {
  readonly direction: TimelineDirection;
  readonly resourceAxisRef: RefObject<HTMLDivElement | null>;
  readonly setDirection: Dispatch<TimelineDirection>;
  readonly timeAxisRef: RefObject<HTMLDivElement | null>;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
}

export function useTimelineDirection({
  direction,
  resourceAxisRef,
  setDirection,
  timeAxisRef,
  viewportRef,
}: TimelineDirectionOptions) {
  const pendingTransitionRef = useRef<DirectionTransition | null>(null);
  const directionRef = useRef(direction);
  directionRef.current = direction;

  const changeDirection = useCallback(
    (nextDirection: TimelineDirection) => {
      const currentDirection = directionRef.current;
      if (nextDirection === currentDirection) {
        return;
      }

      const viewport = viewportRef.current;
      pendingTransitionRef.current = {
        direction: nextDirection,
        logicalInline: logicalInlineOffset(viewport?.scrollLeft ?? 0, currentDirection),
      };
      setDirection(nextDirection);
    },
    [setDirection, viewportRef],
  );

  useLayoutEffect(() => {
    const transition = pendingTransitionRef.current;
    const viewport = viewportRef.current;
    const timeAxis = timeAxisRef.current;
    const resourceAxis = resourceAxisRef.current;
    if (
      transition === null ||
      transition.direction !== direction ||
      viewport === null ||
      timeAxis === null ||
      resourceAxis === null
    ) {
      return;
    }

    const nativeInline = nativeInlineOffset(transition.logicalInline, direction);
    viewport.scrollLeft = nativeInline;
    synchronizeAxes(
      { timeAxis, resourceAxis },
      { inline: nativeInline, block: viewport.scrollTop },
    );

    // TanStack Virtual reads the new `isRtl` option from this event. Dispatching it here keeps
    // the virtual range and both native surfaces coherent before browser callers observe a frame.
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
    pendingTransitionRef.current = null;
  }, [direction, resourceAxisRef, timeAxisRef, viewportRef]);

  return changeDirection;
}
