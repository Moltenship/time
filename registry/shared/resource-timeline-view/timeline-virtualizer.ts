import type { CalendarDirection } from "@moltenship/calendar";
import {
  defaultRangeExtractor,
  elementScroll,
  observeElementOffset,
  Virtualizer,
  type Range,
  type Rect,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";

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

export type TimelineAxis = Virtualizer<HTMLDivElement, HTMLDivElement>;

/** What the timeline's virtualizer follows as its view renders. */
export interface TimelineVirtualizerInput {
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

export interface TimelineVirtualizerSetup extends TimelineVirtualizerInput {
  /** The element that scrolls both axes, once it exists. */
  readonly getScrollElement: () => HTMLDivElement | null;
  /**
   * The rows or slots to render, or their widths, changed: render again. `sync` is set when it
   * comes from a scroll.
   */
  readonly onChange: (sync: boolean) => void;
}

const sameIndexes = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((index, at) => index === right[at]);

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

/**
 * Resource rows and time slots as two virtualizers over one native scroll viewport (ADR 0020), on
 * TanStack Virtual's framework-free engine. Only the rows and slots in view, plus a few beyond and
 * the pinned ones, render. Both axes key items by stable IDs and lay out against
 * `INITIAL_VIEWPORT` until the browser measures the viewport, so server markup hydrates as is.
 * The time axis follows the calendar's direction; switching it keeps the same logical time in
 * view.
 *
 * Each framework binds it in a hook: `update` with each render's input, `mount` once the viewport
 * is in the document, `afterRender` after each render, and `onChange` renders again.
 */
export function createTimelineVirtualizer({
  getScrollElement,
  onChange,
  ...initial
}: TimelineVirtualizerSetup) {
  let input: TimelineVirtualizerInput = initial;
  let viewportWidth = INITIAL_VIEWPORT.width;
  const columns = () => timelineColumns(viewportWidth, input.slots.count, input.slots.minWidth);

  // The client box, without scrollbars; `0 × 0` until the browser lays the viewport out.
  const observeElementRect = (axis: TimelineAxis, publish: (rect: Rect) => void) => {
    const viewport = axis.scrollElement;
    const view = axis.targetWindow;
    if (viewport === null || view === null) return undefined;
    const measure = () => {
      const width = viewport.clientWidth || INITIAL_VIEWPORT.width;
      publish({ height: viewport.clientHeight || INITIAL_VIEWPORT.height, width });
      // The resource column and the slots' width follow the viewport's.
      if (width !== viewportWidth) {
        viewportWidth = width;
        onChange(false);
      }
    };
    measure();
    if (typeof view.ResizeObserver === "undefined") return undefined;
    const observer = new view.ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  };
  // TanStack Virtual scrolls to a positive `left`, but RTL offsets run negative from the start.
  const scrollAlong = (
    offset: number,
    { adjustments = 0, behavior }: { adjustments?: number; behavior?: ScrollBehavior },
    axis: TimelineAxis,
  ) =>
    axis.scrollElement?.scrollTo?.({
      behavior,
      left: (offset + adjustments) * (input.direction === "rtl" ? -1 : 1),
    });
  const slotSize = () => columns().slotWidth;

  let applied = { rows: input.rows.pinned, slots: input.slots.pinned };
  let rowRange = rangeWith(applied.rows);
  let slotRange = rangeWith(applied.slots);

  const shared = {
    getScrollElement,
    initialOffset: 0,
    initialRect: INITIAL_VIEWPORT,
    observeElementOffset,
    observeElementRect,
    onChange: (_axis: TimelineAxis, sync: boolean) => onChange(sync),
  };
  const rowOptions = (): VirtualizerOptions<HTMLDivElement, HTMLDivElement> => ({
    ...shared,
    count: input.rows.count,
    estimateSize: input.rows.height,
    getItemKey: input.rows.key,
    overscan: 4,
    paddingStart: input.headerHeight,
    rangeExtractor: rowRange,
    scrollPaddingStart: input.headerHeight,
    scrollToFn: elementScroll,
  });
  const slotOptions = (): VirtualizerOptions<HTMLDivElement, HTMLDivElement> => {
    const { columnWidth } = columns();
    return {
      ...shared,
      count: input.slots.count,
      estimateSize: slotSize,
      getItemKey: input.slots.key,
      horizontal: true,
      isRtl: input.direction === "rtl",
      overscan: 2,
      paddingStart: columnWidth,
      rangeExtractor: slotRange,
      scrollPaddingStart: columnWidth,
      scrollToFn: scrollAlong,
    };
  };
  const rowAxis: TimelineAxis = new Virtualizer(rowOptions());
  const timeAxis: TimelineAxis = new Virtualizer(slotOptions());

  let measuredSlotWidth = columns().slotWidth;
  let appliedDirection = input.direction;

  return {
    rowAxis,
    timeAxis,
    /** The resource column's width and each slot's, in pixels, for the viewport's width now. */
    columns,
    /** Takes a render's input, before the render reads the virtual items. */
    update(next: TimelineVirtualizerInput) {
      input = next;
      if (!sameIndexes(next.rows.pinned, applied.rows)) rowRange = rangeWith(next.rows.pinned);
      if (!sameIndexes(next.slots.pinned, applied.slots)) slotRange = rangeWith(next.slots.pinned);
      applied = { rows: next.rows.pinned, slots: next.slots.pinned };
      rowAxis.setOptions(rowOptions());
      timeAxis.setOptions(slotOptions());
    },
    /** Starts both axes once the viewport is in the document; returns what stops them. */
    mount(): () => void {
      const rows = rowAxis._didMount();
      const slots = timeAxis._didMount();
      return () => {
        rows();
        slots();
      };
    },
    /** Picks up the viewport and what changed after each render, before the browser paints. */
    afterRender() {
      rowAxis._willUpdate();
      timeAxis._willUpdate();
      // Sizes are estimates the axes cache; a new slot width replaces them.
      const { slotWidth } = columns();
      if (measuredSlotWidth !== slotWidth) {
        measuredSlotWidth = slotWidth;
        timeAxis.measure();
      }
      // Native `scrollLeft` counts from the other edge in RTL. Put the same logical offset, which
      // the time axis read before the switch, back in view, and let the axis read the new
      // convention now.
      const viewport = getScrollElement();
      if (appliedDirection === input.direction || viewport === null) return;
      appliedDirection = input.direction;
      const offset = timeAxis.scrollOffset ?? 0;
      viewport.scrollLeft = input.direction === "rtl" ? -offset : offset;
      viewport.dispatchEvent(new Event("scroll"));
    },
  };
}

export type TimelineVirtualizerController = ReturnType<typeof createTimelineVirtualizer>;
