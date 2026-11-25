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
 * The scroll element's size until the browser measures it. The server and the first client render
 * both use it, so hydration matches, and jsdom, which measures everything as 0 × 0, keeps it.
 */
const INITIAL_RECT: Rect = { height: 720, width: 960 };
/** Columns rendered beyond each side of the visible ones, so a fast scroll rarely shows a gap. */
const OVERSCAN = 2;

export type ColumnVirtualizer = Virtualizer<HTMLDivElement, Element>;

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

/** What the column virtualizer follows as its view renders. */
export interface ColumnVirtualizerInput {
  /** A stable key per column, such as its resource ID. */
  readonly keys: readonly string[];
  /** The narrowest a column gets, in pixels, before the columns scroll sideways. */
  readonly minWidth: number;
  /** A column that renders even out of view, such as the one keyboard focus is in; `-1` for none. */
  readonly pinned: number;
  readonly rtl: boolean;
}

export interface ColumnVirtualizerSetup extends ColumnVirtualizerInput {
  /** The element that scrolls the columns, once it exists. */
  readonly getScrollElement: () => HTMLDivElement | null;
  /** The columns to render, their width or the scrollbar's changed: render again. */
  readonly onChange: () => void;
}

/**
 * Horizontal virtualization for a row of equal columns in one scroll element, on TanStack
 * Virtual's framework-free engine: only the columns in view, plus a few either side and the pinned
 * one, render. Columns share the visible width until they reach `minWidth`, and whole-pixel widths
 * keep their edges sharp. Place each virtual item at `start` with `size` on the inline axis, and
 * leave `scrollbarWidth` free at the inline end of anything aligned with the columns outside it.
 *
 * Each framework binds it in a hook: `update` with each render's input before the render reads
 * the virtual items, the virtualizer's `_didMount` and `_willUpdate` from layout effects, and
 * `onChange` renders again.
 */
export function createColumnVirtualizer({
  getScrollElement,
  onChange,
  ...initial
}: ColumnVirtualizerSetup) {
  let viewport: Viewport = { rect: INITIAL_RECT, scrollbar: 0 };
  let input: ColumnVirtualizerInput = initial;
  const widthOf = ({ keys, minWidth }: ColumnVirtualizerInput) =>
    Math.max(minWidth, Math.floor(viewport.rect.width / Math.max(1, keys.length)));

  // TanStack recomputes every position when the count or `getItemKey` changes, so the key
  // changes only with the keys or the column width, not whenever the caller builds a new array.
  // Columns are never measured, so a new key function places them all at the new width.
  const keyed = (keys: readonly string[], width: number) => ({
    estimateSize: () => width,
    getItemKey: (index: number) => keys[index]!,
  });
  // The pinned column joins the visible ones, so focus moving there finds its element in the same
  // render, and focus stays on it while the user scrolls away.
  const extractor = (pinned: number) => (range: Range) => {
    const indexes = defaultRangeExtractor(range);
    return pinned === -1 || pinned >= range.count || indexes.includes(pinned)
      ? indexes
      : [...indexes, pinned].sort((left, right) => left - right);
  };
  const observeElementRect = (instance: ColumnVirtualizer, publish: (rect: Rect) => void) =>
    instance.scrollElement === null
      ? undefined
      : observeViewport(instance.scrollElement, (next) => {
          const changed =
            viewport.rect.width !== next.rect.width || viewport.scrollbar !== next.scrollbar;
          viewport = next;
          publish(next.rect);
          // The column width and the space left for the scrollbar follow the viewport.
          if (changed) onChange();
        });

  let applied = {
    pinned: input.pinned,
    signature: JSON.stringify(input.keys),
    width: widthOf(input),
  };
  let sizing = keyed(input.keys, applied.width);
  let rangeExtractor = extractor(input.pinned);

  const options = (): VirtualizerOptions<HTMLDivElement, Element> => ({
    count: input.keys.length,
    ...sizing,
    getScrollElement,
    horizontal: true,
    initialOffset: 0,
    initialRect: INITIAL_RECT,
    isRtl: input.rtl,
    observeElementOffset,
    observeElementRect,
    onChange: () => onChange(),
    overscan: OVERSCAN,
    rangeExtractor,
    scrollToFn: elementScroll,
  });
  const virtualizer: ColumnVirtualizer = new Virtualizer(options());

  return {
    virtualizer,
    /** Width of the body's vertical scrollbar. */
    scrollbarWidth: () => viewport.scrollbar,
    /** Takes a render's input, before the render reads the virtual items. */
    update(next: ColumnVirtualizerInput) {
      input = next;
      const signature = JSON.stringify(next.keys);
      const width = widthOf(next);
      if (signature !== applied.signature || width !== applied.width) {
        sizing = keyed(next.keys, width);
      }
      if (next.pinned !== applied.pinned) rangeExtractor = extractor(next.pinned);
      applied = { pinned: next.pinned, signature, width };
      virtualizer.setOptions(options());
    },
  };
}

export type ColumnVirtualizerController = ReturnType<typeof createColumnVirtualizer>;
