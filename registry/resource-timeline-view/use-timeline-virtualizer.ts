import type { CalendarDirection } from "@moltenship/calendar";
import {
  defaultRangeExtractor,
  useVirtualizer,
  type Range,
  type Rect,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * The viewport's size until the browser measures one. The server render and hydration both lay
 * out against it, so their markup matches; environments that report `0 × 0`, such as jsdom, keep it.
 */
const INITIAL_VIEWPORT: Rect = Object.freeze({ height: 640, width: 1024 });

/** Below this viewport width the resource column narrows. */
const NARROW_VIEWPORT = 640;

/**
 * Pixel widths of the sticky resource column and of each slot. Slots share whatever width the
 * column leaves, but never shrink below `minSlotWidth`; past that the timeline scrolls sideways.
 * Whole pixels keep every grid line on the pixel grid.
 */
export function timelineColumns(
  viewportWidth: number,
  slotCount: number,
  minSlotWidth: number,
): { readonly columnWidth: number; readonly slotWidth: number } {
  const columnWidth = viewportWidth < NARROW_VIEWPORT ? 128 : 208;
  const fill = Math.floor((viewportWidth - columnWidth) / Math.max(1, slotCount));
  return { columnWidth, slotWidth: Math.max(minSlotWidth, fill) };
}

type TimelineAxis = Virtualizer<HTMLDivElement, HTMLDivElement>;

/** The items in view, plus the pinned ones wherever they are, such as the focused row and slot. */
function rangeWith(pinned: readonly number[]) {
  return (range: Range) => {
    const indexes = defaultRangeExtractor(range);
    // The entry and the focus can pin the same index; each renders once.
    const missing = [...new Set(pinned)].filter(
      (index) => index >= 0 && index < range.count && !indexes.includes(index),
    );
    return missing.length === 0
      ? indexes
      : [...indexes, ...missing].sort((left, right) => left - right);
  };
}

export interface TimelineVirtualizerOptions {
  readonly direction: CalendarDirection;
  /** Height of the sticky header above the first row. */
  readonly headerHeight: number;
  /**
   * Rows: a stable key and a height for each index. New functions re-read every row, so keep
   * them stable until the rows change.
   */
  readonly rows: {
    readonly count: number;
    readonly key: (index: number) => string;
    readonly height: (index: number) => number;
    /** Rows that render even out of view, such as the focused one. */
    readonly pinned: readonly number[];
  };
  /** Columns: a stable key for each index; their width comes from `timelineColumns`. */
  readonly slots: {
    readonly count: number;
    readonly key: (index: number) => string;
    readonly minWidth: number;
    /** Slots that render even out of view, such as the focused one. */
    readonly pinned: readonly number[];
  };
}

/**
 * Resource rows and time slots as two virtualizers over one native scroll viewport (ADR 0020).
 * Only the rows and slots in view, plus a few beyond and the pinned ones, render. Both axes key items by stable IDs,
 * lay out against `INITIAL_VIEWPORT` until the browser measures the viewport, and never force
 * synchronous React updates, so server markup hydrates as is. The time axis follows the
 * calendar's direction; switching it keeps the same logical time in view.
 */
export function useTimelineVirtualizer({
  direction,
  headerHeight,
  rows,
  slots,
}: TimelineVirtualizerOptions) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(INITIAL_VIEWPORT.width);
  const { columnWidth, slotWidth } = timelineColumns(viewportWidth, slots.count, slots.minWidth);

  const getScrollElement = useCallback(() => viewportRef.current, []);
  // The client box, without scrollbars; `0 × 0` until the browser lays the viewport out.
  const observeViewport = useCallback((axis: TimelineAxis, publish: (rect: Rect) => void) => {
    const viewport = axis.scrollElement;
    const view = axis.targetWindow;
    if (viewport === null || view === null) return;
    const measure = () => {
      const width = viewport.clientWidth || INITIAL_VIEWPORT.width;
      publish({ height: viewport.clientHeight || INITIAL_VIEWPORT.height, width });
      setViewportWidth(width);
    };
    measure();
    const observer = new view.ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);
  const slotSize = useCallback(() => slotWidth, [slotWidth]);
  const rowRange = useMemo(() => rangeWith(rows.pinned), [rows.pinned]);
  const slotRange = useMemo(() => rangeWith(slots.pinned), [slots.pinned]);
  const isRtl = direction === "rtl";
  // TanStack Virtual scrolls to a positive `left`, but RTL offsets run negative from the start.
  const scrollAlong = useCallback(
    (
      offset: number,
      { adjustments = 0, behavior }: { adjustments?: number; behavior?: ScrollBehavior },
      axis: TimelineAxis,
    ) =>
      axis.scrollElement?.scrollTo?.({ behavior, left: (offset + adjustments) * (isRtl ? -1 : 1) }),
    [isRtl],
  );

  const rowAxis = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: rows.count,
    estimateSize: rows.height,
    getItemKey: rows.key,
    getScrollElement,
    initialOffset: 0,
    initialRect: INITIAL_VIEWPORT,
    observeElementRect: observeViewport,
    overscan: 4,
    paddingStart: headerHeight,
    rangeExtractor: rowRange,
    scrollPaddingStart: headerHeight,
    useFlushSync: false,
  });
  const timeAxis = useVirtualizer<HTMLDivElement, HTMLDivElement>({
    count: slots.count,
    estimateSize: slotSize,
    getItemKey: slots.key,
    getScrollElement,
    horizontal: true,
    initialOffset: 0,
    initialRect: INITIAL_VIEWPORT,
    isRtl,
    observeElementRect: observeViewport,
    overscan: 2,
    paddingStart: columnWidth,
    rangeExtractor: slotRange,
    scrollPaddingStart: columnWidth,
    scrollToFn: scrollAlong,
    useFlushSync: false,
  });

  // Sizes are estimates the axes cache; a new slot width replaces them before the browser paints.
  const measuredSlotWidth = useRef(slotWidth);
  useLayoutEffect(() => {
    if (measuredSlotWidth.current === slotWidth) return;
    measuredSlotWidth.current = slotWidth;
    timeAxis.measure();
  }, [slotWidth, timeAxis]);

  // Native `scrollLeft` counts from the other edge in RTL. Put the same logical offset, which the
  // time axis read before the switch, back in view, and let the axis read the new convention now.
  const appliedDirection = useRef(direction);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (appliedDirection.current === direction || viewport === null) return;
    appliedDirection.current = direction;
    const offset = timeAxis.scrollOffset ?? 0;
    viewport.scrollLeft = direction === "rtl" ? -offset : offset;
    viewport.dispatchEvent(new Event("scroll"));
  }, [direction, timeAxis]);

  return {
    columnWidth,
    rowAxis,
    slotWidth,
    timeAxis,
    viewportRef,
  };
}
