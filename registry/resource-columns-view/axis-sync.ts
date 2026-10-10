import { useCallback, useRef, type RefObject } from "react";

type Axis = "x" | "y";

/**
 * Keeps the grid's fixed parts in step with its scrolling body: the resource headers and the
 * all-day row follow its sideways scroll, the hour gutter its vertical scroll. They sit beside the
 * body rather than over it, so a drag never targets a column hidden under them. Each follower
 * moves by transform inside an `overflow: clip` parent, which focus cannot scroll out of step.
 *
 * Attach `followX` or `followY` as the ref of each moving element and call `sync` on the body's
 * scroll events.
 */
export function useAxisSync(bodyRef: RefObject<HTMLElement | null>) {
  const followers = useRef(new Map<HTMLElement, Axis>());

  const sync = useCallback(() => {
    const body = bodyRef.current;
    if (body === null) return;
    for (const [element, axis] of followers.current) {
      // RTL `scrollLeft` is negative, so the same negation moves content the right way.
      element.style.transform =
        axis === "x" ? `translateX(${-body.scrollLeft}px)` : `translateY(${-body.scrollTop}px)`;
    }
  }, [bodyRef]);

  const follow = useCallback(
    (element: HTMLElement, axis: Axis) => {
      followers.current.set(element, axis);
      sync();
      return () => {
        followers.current.delete(element);
      };
    },
    [sync],
  );
  const followX = useCallback(
    (element: HTMLElement | null) => (element === null ? undefined : follow(element, "x")),
    [follow],
  );
  const followY = useCallback(
    (element: HTMLElement | null) => (element === null ? undefined : follow(element, "y")),
    [follow],
  );

  return { followX, followY, sync };
}
