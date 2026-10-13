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

/**
 * Scrolls `container` when a viewport point sits near its edges. Returns whether it moved, so the
 * caller re-reads geometry only after a scroll.
 */
export function autoScroll(container: Element, x: number, y: number): boolean {
  const rect = bounds(container);
  const { scrollLeft, scrollTop } = container;
  container.scrollTop += step(y, rect.top, rect.bottom);
  container.scrollLeft += step(x, rect.left, rect.right);
  return container.scrollTop !== scrollTop || container.scrollLeft !== scrollLeft;
}
