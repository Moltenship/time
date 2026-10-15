const EDGE = 48;
const MAXIMUM_STEP = 18;

/** Pixels to scroll this frame along one axis: faster the deeper the pointer is in an edge band. */
function step(position: number, start: number, end: number): number {
  if (position < start + EDGE) return -MAXIMUM_STEP * Math.min(1, (start + EDGE - position) / EDGE);
  if (position > end - EDGE) return MAXIMUM_STEP * Math.min(1, (position - (end - EDGE)) / EDGE);
  return 0;
}

export function scrollableAncestor(element: Element): Element {
  for (let current: Element | null = element; current !== null; current = current.parentElement) {
    const { overflowX, overflowY } = getComputedStyle(current);
    const scrollsY =
      /auto|scroll|overlay/.test(overflowY) && current.scrollHeight > current.clientHeight;
    const scrollsX =
      /auto|scroll|overlay/.test(overflowX) && current.scrollWidth > current.clientWidth;
    if (scrollsY || scrollsX) return current;
  }
  return document.scrollingElement ?? document.documentElement;
}

function bounds(container: Element) {
  const viewport =
    container === document.scrollingElement || container === document.documentElement;
  return viewport
    ? { bottom: innerHeight, left: 0, right: innerWidth, top: 0 }
    : container.getBoundingClientRect();
}

/** Whether a viewport point is inside `container` and clear of the bands that scroll it. */
export function clearOfEdges(container: Element, x: number, y: number): boolean {
  const rect = bounds(container);
  return (
    x >= rect.left &&
    x <= rect.right &&
    y >= rect.top &&
    y <= rect.bottom &&
    step(x, rect.left, rect.right) === 0 &&
    step(y, rect.top, rect.bottom) === 0
  );
}

/** How long a point rests in an edge band before that edge scrolls. */
const ENTRY_DWELL_MS = 250;

/** Whether a viewport point is inside `container`, in a band near one of its edges. */
function inEdgeBand(container: Element, x: number, y: number): boolean {
  const rect = bounds(container);
  const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  return inside && (step(x, rect.left, rect.right) !== 0 || step(y, rect.top, rect.bottom) !== 0);
}

/**
 * Whether a view's edges may scroll it, for a drag that came into the view from outside it: once
 * the point has been clear of them, or has rested in one of their bands for a moment. So a drag
 * that crosses an edge on its way in doesn't scroll the view, nor one that rests over a part of the
 * view outside its scroller, such as a header; one held at an edge still does.
 */
export class EdgeArming {
  #armed: boolean;
  #since: number | undefined;

  constructor(armed: boolean) {
    this.#armed = armed;
  }

  get armed(): boolean {
    return this.#armed;
  }

  /** The drag left the view: its edges wait again. */
  disarm(): void {
    this.#armed = false;
    this.#since = undefined;
  }

  /** Takes the point's place at `time`, from `performance.now()`; returns whether edges scroll. */
  update(container: Element, x: number, y: number, time: number): boolean {
    if (this.#armed) return true;
    if (clearOfEdges(container, x, y)) {
      this.#armed = true;
    } else if (inEdgeBand(container, x, y)) {
      this.#since ??= time;
      this.#armed = time - this.#since >= ENTRY_DWELL_MS;
    } else {
      this.#since = undefined;
    }
    return this.#armed;
  }
}

/**
 * Scrolls `container` when a viewport point sits near its edges, and `sideways` in its place at
 * the left and right edges: a scroller nested in it that scrolls sideways. Returns whether either
 * moved, so the caller re-reads geometry only after a scroll.
 */
export function autoScroll(
  container: Element,
  x: number,
  y: number,
  sideways: Element = container,
): boolean {
  const rect = bounds(container);
  const { scrollTop } = container;
  const { scrollLeft } = sideways;
  container.scrollTop += step(y, rect.top, rect.bottom);
  sideways.scrollLeft += step(x, rect.left, rect.right);
  return container.scrollTop !== scrollTop || sideways.scrollLeft !== scrollLeft;
}
