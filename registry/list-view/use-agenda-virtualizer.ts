import {
  defaultRangeExtractor,
  measureElement,
  useVirtualizer,
  type Range,
  type Rect,
  type Virtualizer,
} from "@tanstack/react-virtual";
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { estimateRowHeight, placeKey, rowDate, rowFrom, type AgendaRow } from "./agenda-rows";

/**
 * The viewport's size until the browser measures it. The server and the first client render both
 * use it, so hydration matches, and jsdom, which measures everything as 0 × 0, keeps it.
 */
const INITIAL_RECT: Rect = { height: 640, width: 960 };
/** Rows rendered beyond each end of the visible ones, so a fast scroll rarely shows a gap. */
const OVERSCAN = 3;

export type AgendaVirtualizer = Virtualizer<HTMLDivElement, HTMLElement>;

export interface AgendaVirtualizerOptions {
  /** The row on top when the list first renders, as the anchor date's. */
  readonly initialRow: number;
  /** Rows that render even out of view, such as the focused day and the agenda's entry. */
  readonly pinned: readonly number[];
  readonly rows: readonly AgendaRow<unknown>[];
  /** The element that scrolls the rows. */
  readonly scrollRef: RefObject<HTMLDivElement | null>;
}

/**
 * Vertical virtualization for the agenda's rows in one scroll element: only the rows in view, a
 * few beyond, and the pinned ones render. Days are measured once rendered, as their events wrap;
 * until then their height is estimated from their event count. Rows load in above or below
 * without moving what's on screen: the virtualizer keeps the row on top where it is, by key.
 */
export function useAgendaVirtualizer({
  initialRow,
  pinned,
  rows,
  scrollRef,
}: AgendaVirtualizerOptions) {
  const [viewportHeight, setViewportHeight] = useState(INITIAL_RECT.height);

  // TanStack recomputes every position when a callback changes, so callbacks change only with
  // the rows, the viewport's height, or the pinned rows.
  const getItemKey = useCallback((index: number) => rows[index]!.key, [rows]);
  const estimateSize = useCallback(
    (index: number) => estimateRowHeight(rows[index]!, viewportHeight),
    [rows, viewportHeight],
  );
  const getScrollElement = useCallback(() => scrollRef.current, [scrollRef]);
  // Pinned rows join the visible ones, so focus moving there finds its element in the same
  // commit, and focus stays on it while the user scrolls away.
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const missing = [...new Set(pinned)].filter(
        (index) => index >= 0 && index < range.count && !indexes.includes(index),
      );
      return missing.length === 0
        ? indexes
        : [...indexes, ...missing].sort((left, right) => left - right);
    },
    [pinned],
  );
  // The client box, without a scrollbar; the initial size until the browser lays it out.
  const observeElementRect = useCallback(
    (instance: AgendaVirtualizer, publish: (rect: Rect) => void) => {
      const element = instance.scrollElement;
      const view = instance.targetWindow;
      if (element === null) return undefined;
      const measure = () => {
        const rect = {
          height: element.clientHeight || INITIAL_RECT.height,
          width: element.clientWidth || INITIAL_RECT.width,
        };
        setViewportHeight(rect.height);
        publish(rect);
      };
      measure();
      if (view === null || typeof view.ResizeObserver === "undefined") return undefined;
      const observer = new view.ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    },
    [],
  );
  // A row that measures nothing hasn't been laid out, as in jsdom: keep its estimate.
  const measureRow = useCallback(
    (element: HTMLElement, entry: ResizeObserverEntry | undefined, instance: AgendaVirtualizer) =>
      measureElement(element, entry, instance) || estimateSize(instance.indexFromElement(element)),
    [estimateSize],
  );

  // The first render places the initial row on top by the estimated heights above it, so it shows
  // the rows there before anything is measured.
  const [initialOffset] = useState(() =>
    rows
      .slice(0, initialRow)
      .reduce((offset, row) => offset + estimateRowHeight(row, INITIAL_RECT.height), 0),
  );

  const virtualizer = useVirtualizer<HTMLDivElement, HTMLElement>({
    // Keeps the item on top in place when rows come or go at either end, not only at the end.
    anchorTo: "end",
    count: rows.length,
    estimateSize,
    getItemKey,
    getScrollElement,
    initialOffset,
    initialRect: INITIAL_RECT,
    measureElement: measureRow,
    observeElementRect,
    overscan: OVERSCAN,
    rangeExtractor,
    // Scrolling renders the rows coming into view before the browser paints, so a jump to a
    // date never shows an empty viewport first.
    useFlushSync: true,
  });

  // TanStack keeps the row on top only when rows come or go at the ends. Days can also change in
  // between, as when one event moves to a day above the view and another leaves a day below it,
  // and the empty state can move from the end into the days: keep what is on top, and how far into
  // it the view is, whatever changed.
  const onTop = useRef<{
    readonly date: Temporal.PlainDate;
    readonly into: number;
    readonly key: string;
  } | null>(null);
  const laidOut = useRef(rows);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element === null) return;
    const remember = () => {
      const item = virtualizer.getVirtualItemForOffset(element.scrollTop);
      const row = item === undefined ? undefined : rows[item.index];
      onTop.current =
        item === undefined || row === undefined
          ? null
          : { date: rowDate(row), into: element.scrollTop - item.start, key: placeKey(row) };
    };
    const top = onTop.current;
    if (laidOut.current !== rows && top !== null) {
      // What was on top went away, as an empty state when its dates get events or a day when its
      // last event goes: the first row from its date takes its place, from the top.
      const kept = rows.findIndex((row) => placeKey(row) === top.key);
      const index = kept === -1 ? rowFrom(rows, top.date) : kept;
      const into = kept === -1 ? 0 : top.into;
      const start = virtualizer.measurementsCache[index]?.start;
      if (start !== undefined && Math.abs(start + into - element.scrollTop) >= 1) {
        virtualizer.scrollToOffset(start + into);
      }
    }
    laidOut.current = rows;
    remember();
    element.addEventListener("scroll", remember, { passive: true });
    return () => element.removeEventListener("scroll", remember);
  }, [rows, scrollRef, virtualizer]);

  return { viewportHeight, virtualizer };
}
