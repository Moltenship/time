import {
  defaultRangeExtractor,
  elementScroll,
  measureElement,
  observeElementOffset,
  Virtualizer,
  type Range,
  type Rect,
  type VirtualizerOptions,
} from "@tanstack/virtual-core";

import { estimateRowHeight, placeKey, rowDate, rowFrom, type AgendaRow } from "./agenda-rows";

/**
 * The viewport's size until the browser measures it. The server and the first client render both
 * use it, so hydration matches, and jsdom, which measures everything as 0 × 0, keeps it.
 */
const INITIAL_RECT: Rect = { height: 640, width: 960 };
/** Rows rendered beyond each end of the visible ones, so a fast scroll rarely shows a gap. */
const OVERSCAN = 3;

export type AgendaVirtualizer = Virtualizer<HTMLDivElement, HTMLElement>;

/** What the agenda's virtualizer follows as its view renders. */
export interface AgendaVirtualizerInput {
  /** Rows that render even out of view, such as the focused day and the agenda's entry. */
  readonly pinned: readonly number[];
  readonly rows: readonly AgendaRow<unknown>[];
}

export interface AgendaVirtualizerSetup extends AgendaVirtualizerInput {
  /** The element that scrolls the rows, once it exists. */
  readonly getScrollElement: () => HTMLDivElement | null;
  /** The row on top when the list first renders, as the anchor date's. */
  readonly initialRow: number;
  /**
   * The rows to render changed: render again. `sync` is set when it comes from a scroll, which
   * renders the rows coming into view before the browser paints, so a jump to a date never shows
   * an empty viewport first.
   */
  readonly onChange: (sync: boolean) => void;
}

const sameRows = (left: readonly number[], right: readonly number[]) =>
  left.length === right.length && left.every((index, at) => index === right[at]);

/**
 * Vertical virtualization for the agenda's rows in one scroll element, on TanStack Virtual's
 * framework-free engine: only the rows in view, a few beyond, and the pinned ones render. Days are
 * measured once rendered, as their events wrap; until then their height is estimated from their
 * event count. Rows load in above or below without moving what's on screen: `keepTop` keeps the
 * row on top where it is, by key, whatever changed.
 *
 * Each framework binds it in a hook: `update` with each render's rows, `mount` and `keepTop` from
 * layout effects, and `onChange` renders again.
 */
export function createAgendaVirtualizer({
  getScrollElement,
  initialRow,
  onChange,
  pinned: initialPinned,
  rows: initialRows,
}: AgendaVirtualizerSetup) {
  let viewportHeight = INITIAL_RECT.height;
  let input: AgendaVirtualizerInput = { pinned: initialPinned, rows: initialRows };

  // TanStack recomputes every position when the count or `getItemKey` changes, so the key
  // changes only with the rows. The estimates follow the viewport's height too, but rows already
  // placed keep theirs until the rows change: a resize doesn't move what's on screen.
  const keyed = (rows: readonly AgendaRow<unknown>[]) => (index: number) => rows[index]!.key;
  const sized = (rows: readonly AgendaRow<unknown>[], height: number) => {
    const estimateSize = (index: number) => estimateRowHeight(rows[index]!, height);
    return {
      estimateSize,
      // A row that measures nothing hasn't been laid out, as in jsdom: keep its estimate.
      measureElement: (
        element: HTMLElement,
        entry: ResizeObserverEntry | undefined,
        instance: AgendaVirtualizer,
      ) =>
        measureElement(element, entry, instance) ||
        estimateSize(instance.indexFromElement(element)),
    };
  };
  // Pinned rows join the visible ones, so focus moving there finds its element in the same
  // commit, and focus stays on it while the user scrolls away.
  const extractor = (pinned: readonly number[]) => (range: Range) => {
    const indexes = defaultRangeExtractor(range);
    const missing = [...new Set(pinned)].filter(
      (index) => index >= 0 && index < range.count && !indexes.includes(index),
    );
    return missing.length === 0
      ? indexes
      : [...indexes, ...missing].sort((left, right) => left - right);
  };
  // The client box, without a scrollbar; the initial size until the browser lays it out.
  const observeElementRect = (instance: AgendaVirtualizer, publish: (rect: Rect) => void) => {
    const element = instance.scrollElement;
    const view = instance.targetWindow;
    if (element === null) return undefined;
    const measure = () => {
      const rect = {
        height: element.clientHeight || INITIAL_RECT.height,
        width: element.clientWidth || INITIAL_RECT.width,
      };
      const resized = rect.height !== viewportHeight;
      viewportHeight = rect.height;
      publish(rect);
      // The estimates and the end row follow the height.
      if (resized) onChange(false);
    };
    measure();
    if (view === null || typeof view.ResizeObserver === "undefined") return undefined;
    const observer = new view.ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  };

  let applied = { height: viewportHeight, pinned: input.pinned, rows: input.rows };
  let getItemKey = keyed(input.rows);
  let callbacks = sized(input.rows, viewportHeight);
  let rangeExtractor = extractor(input.pinned);

  // The first render places the initial row on top by the estimated heights above it, so it
  // shows the rows there before anything is measured.
  const initialOffset = initialRows
    .slice(0, initialRow)
    .reduce((offset, row) => offset + estimateRowHeight(row, INITIAL_RECT.height), 0);

  const options = (): VirtualizerOptions<HTMLDivElement, HTMLElement> => ({
    // Keeps the item on top in place when rows come or go at either end, not only at the end.
    anchorTo: "end",
    count: input.rows.length,
    ...callbacks,
    getItemKey,
    getScrollElement,
    initialOffset,
    initialRect: INITIAL_RECT,
    observeElementOffset,
    observeElementRect,
    onChange: (_instance, sync) => onChange(sync),
    overscan: OVERSCAN,
    rangeExtractor,
    scrollToFn: elementScroll,
  });
  const virtualizer: AgendaVirtualizer = new Virtualizer(options());

  // TanStack keeps the row on top only when rows come or go at the ends. Days can also change in
  // between, as when one event moves to a day above the view and another leaves a day below it,
  // and the empty state can move from the end into the days: keep what is on top, and how far into
  // it the view is, whatever changed.
  let onTop: {
    readonly date: Temporal.PlainDate;
    readonly into: number;
    readonly key: string;
  } | null = null;
  let laidOut = input.rows;
  /**
   * The rows the virtualizer had when focus last scrolled the list, and where it scrolled to.
   * Focus that moves once rows are rendered but before `keepTop` sees them, as Solid's focus
   * does, scrolled the focused row into view where those rows are: that's the place to keep, not
   * what was on top, nor where TanStack moves the list from the offset its last `scroll` event
   * left, before that focus.
   */
  let focusedIn: { readonly rows: readonly AgendaRow<unknown>[]; readonly top: number } | null =
    null;

  return {
    virtualizer,
    /** The viewport's height, which the end row fills. */
    viewportHeight: () => viewportHeight,
    /** Takes a render's rows and pinned rows, before the render reads the virtual items. */
    update(next: AgendaVirtualizerInput) {
      input = next;
      if (next.rows !== applied.rows) getItemKey = keyed(next.rows);
      if (next.rows !== applied.rows || viewportHeight !== applied.height) {
        callbacks = sized(next.rows, viewportHeight);
      }
      if (!sameRows(next.pinned, applied.pinned)) rangeExtractor = extractor(next.pinned);
      applied = { height: viewportHeight, pinned: next.pinned, rows: next.rows };
      virtualizer.setOptions(options());
    },
    /**
     * Keeps the row on top in place after the rows were laid out, and remembers it as the list
     * scrolls or focus moves; returns what stops listening. Call it once the scroll element is
     * in the document, and again each time the rows change.
     */
    keepTop(element: HTMLDivElement): () => void {
      const { rows } = input;
      let scrolledTo = element.scrollTop;
      const remember = () => {
        scrolledTo = element.scrollTop;
        const item = virtualizer.getVirtualItemForOffset(element.scrollTop);
        const row = item === undefined ? undefined : rows[item.index];
        onTop =
          item === undefined || row === undefined
            ? null
            : { date: rowDate(row), into: element.scrollTop - item.start, key: placeKey(row) };
      };
      const top = onTop;
      const focused = laidOut !== rows && focusedIn?.rows === rows ? focusedIn.top : null;
      if (focused !== null) {
        if (Math.abs(focused - element.scrollTop) >= 1) virtualizer.scrollToOffset(focused);
      } else if (laidOut !== rows && top !== null) {
        // What was on top went away, as an empty state when its dates get events or a day when
        // its last event goes: the first row from its date takes its place, from the top.
        const kept = rows.findIndex((row) => placeKey(row) === top.key);
        const index = kept === -1 ? rowFrom(rows, top.date) : kept;
        const into = kept === -1 ? 0 : top.into;
        const start = virtualizer.measurementsCache[index]?.start;
        if (start !== undefined && Math.abs(start + into - element.scrollTop) >= 1) {
          virtualizer.scrollToOffset(start + into);
        }
      }
      laidOut = rows;
      remember();
      // A script's `focus()` scrolls the focused row into view at once, but the `scroll` event
      // comes a frame later: rows that change before then, as when keys page past the range,
      // would put back what was on top before focus moved. The focus events come before that
      // scroll, so look again once the script is done.
      let live = true;
      const rememberFocus = () => {
        // Focus that moves without scrolling, as with `preventScroll`, leaves what's on top.
        if (element.scrollTop !== scrolledTo) {
          focusedIn = { rows: input.rows, top: element.scrollTop };
        }
        queueMicrotask(() => {
          if (live) remember();
        });
      };
      element.addEventListener("scroll", remember, { passive: true });
      element.addEventListener("focusin", rememberFocus);
      return () => {
        live = false;
        element.removeEventListener("scroll", remember);
        element.removeEventListener("focusin", rememberFocus);
      };
    },
  };
}

export type AgendaVirtualizerController = ReturnType<typeof createAgendaVirtualizer>;
