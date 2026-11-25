export type Axis = "x" | "y";

/**
 * Keeps the grid's fixed parts in step with its scrolling body: the resource headers and the
 * all-day row follow its sideways scroll, the hour gutter its vertical scroll. They sit beside the
 * body rather than over it, so a drag never targets a column hidden under them. Each follower
 * moves by transform inside an `overflow: clip` parent, which focus cannot scroll out of step.
 *
 * Each framework binds it in a hook: `follow` each moving element as it mounts, and `sync` on the
 * body's scroll events.
 */
export function createAxisSync(getBody: () => HTMLElement | null) {
  const followers = new Map<HTMLElement, Axis>();

  const sync = () => {
    const body = getBody();
    if (body === null) return;
    for (const [element, axis] of followers) {
      // RTL `scrollLeft` is negative, so the same negation moves content the right way.
      element.style.transform =
        axis === "x" ? `translateX(${-body.scrollLeft}px)` : `translateY(${-body.scrollTop}px)`;
    }
  };

  return {
    /** Moves `element` with the body's scroll on `axis`; returns what stops it. */
    follow(element: HTMLElement, axis: Axis): () => void {
      followers.set(element, axis);
      sync();
      return () => {
        followers.delete(element);
      };
    },
    sync,
  };
}

export type AxisSync = ReturnType<typeof createAxisSync>;
