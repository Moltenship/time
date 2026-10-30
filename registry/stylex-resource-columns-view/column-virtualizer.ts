import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Rect,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * The scroll element's size until the browser measures it. The server and the first client render
 * both use it, so hydration matches, and jsdom, which measures everything as 0 × 0, keeps it.
 */
const INITIAL_RECT: Rect = { height: 720, width: 960 };
/** Columns rendered beyond each side of the visible ones, so a fast scroll rarely shows a gap. */
const OVERSCAN = 2;

type ColumnVirtualizer = Virtualizer<HTMLDivElement, Element>;

interface Viewport {
  readonly rect: Rect;
  /** Width of the vertical scrollbar, which parts aligned with the columns leave free. */
  readonly scrollbar: number;
}

/** Reports the element's visible size, scrollbars excluded, keeping `INITIAL_RECT` while it is 0. */
function observeViewport(element: HTMLElement, callback: (viewport: Viewport) => void) {
  const publish = () =>
    callback({
      rect: {
        height: element.clientHeight || INITIAL_RECT.height,
        width: element.clientWidth || INITIAL_RECT.width,
      },
      scrollbar: element.offsetWidth - element.clientWidth,
    });
  publish();
  if (typeof ResizeObserver === "undefined") return undefined;
  const observer = new ResizeObserver(publish);
  observer.observe(element);
  return () => observer.disconnect();
}

export interface ColumnVirtualizerOptions {
  /** A stable key per column, such as its resource ID. */
  readonly keys: readonly string[];
  /** The narrowest a column gets, in pixels, before the columns scroll sideways. */
  readonly minWidth: number;
  /** A column that renders even out of view, such as the one keyboard focus is in; `-1` for none. */
  readonly pinned: number;
  readonly rtl: boolean;
}

/**
 * Horizontal virtualization for a row of equal columns in one scroll element: only the columns in
 * view, plus a few either side and the pinned one, render. Columns share the visible width until they reach
 * `minWidth`, and whole-pixel widths keep their edges sharp. Pass `scrollRef` to the element that
 * scrolls, place each virtual item at `start` with `size` on the inline axis, and leave
 * `scrollbarWidth` free at the inline end of anything aligned with the columns outside it.
 */
export function useColumnVirtualizer({ keys, minWidth, pinned, rtl }: ColumnVirtualizerOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<Viewport>({ rect: INITIAL_RECT, scrollbar: 0 });
  const width = Math.max(minWidth, Math.floor(viewport.rect.width / Math.max(1, keys.length)));

  // TanStack recomputes every position when a callback changes, so callbacks change only with
  // the keys or the column width, not whenever the caller builds a new array.
  const signature = JSON.stringify(keys);
  const getItemKey = useMemo(() => {
    const stable = JSON.parse(signature) as readonly string[];
    return (index: number) => stable[index]!;
  }, [signature]);
  const estimateSize = useCallback(() => width, [width]);
  const getScrollElement = useCallback(() => scrollRef.current, []);
  // The pinned column joins the visible ones, so focus moving there finds its element in the same
  // commit, and focus stays on it while the user scrolls away.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      return pinned === -1 || indexes.includes(pinned)
        ? indexes
        : [...indexes, pinned].sort((left, right) => left - right);
    },
    [pinned],
  );
  const observeElementRect = useCallback(
    (instance: ColumnVirtualizer, callback: (rect: Rect) => void) =>
      instance.scrollElement === null
        ? undefined
        : observeViewport(instance.scrollElement, (next) => {
            setViewport((current) =>
              current.rect.width === next.rect.width && current.scrollbar === next.scrollbar
                ? current
                : next,
            );
            callback(next.rect);
          }),
    [],
  );

  const virtualizer = useVirtualizer<HTMLDivElement, Element>({
    count: keys.length,
    estimateSize,
    getItemKey,
    getScrollElement,
    horizontal: true,
    initialOffset: 0,
    initialRect: INITIAL_RECT,
    isRtl: rtl,
    observeElementRect,
    overscan: OVERSCAN,
    rangeExtractor,
    // Scroll updates render in the next frame instead of forcing a synchronous React render.
    useFlushSync: false,
  });

  // Positions are cached per size, so a new column width has to be measured again.
  const measuredWidth = useRef(width);
  useLayoutEffect(() => {
    if (measuredWidth.current === width) return;
    measuredWidth.current = width;
    virtualizer.measure();
  }, [virtualizer, width]);

  return { scrollbarWidth: viewport.scrollbar, scrollRef, virtualizer };
}
