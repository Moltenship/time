/**
 * How overlapping timed events share a day column:
 *
 * - `"columns"`: side by side in lanes, each event widening into lanes free beside it, as Google
 *   Calendar draws them.
 * - `"equal"`: side by side in lanes of equal width, so lanes line up through a busy stretch.
 * - `"stack"`: cascading. Each event is indented past the earlier events it overlaps and drawn on
 *   top of them, so every event keeps a strip at its inline start.
 */
export type OverlapLayout = "columns" | "equal" | "stack";

/** How a time grid lays out overlapping events; the time-grid views take these as options. */
export interface OverlapLayoutOptions {
  /** How overlapping events share a day column; `"columns"` by default. */
  readonly overlapLayout?: OverlapLayout;
  /**
   * Each level's indent under `"stack"`, as a fraction of the column width; 0.15 by default. A
   * deeper stack indents less, so its top event always keeps at least half the width.
   */
  readonly stackIndent?: number;
}

export interface TimedOverlapItem {
  readonly height: number;
  /** Stable identity; breaks ordering ties so equal inputs always produce equal layouts. */
  readonly key: string;
  readonly top: number;
}

export interface TimedOverlapOptions extends OverlapLayoutOptions {
  /** Smallest rendered height, in the same units as `top`; shorter items reserve this much. */
  readonly minHeight?: number;
}

export interface TimedOverlapPlacement<TItem> {
  readonly height: number;
  readonly item: TItem;
  /** Horizontal offset as a fraction of the column width. */
  readonly left: number;
  readonly top: number;
  /** Width as a fraction of the column width. */
  readonly width: number;
}

interface Entry<TItem> {
  readonly bottom: number;
  readonly item: TItem;
  /** The entry's lane, or its depth in a stack. */
  lane: number;
  readonly top: number;
}

type Place<TItem> = (entry: Entry<TItem>, left: number, width: number) => void;

/**
 * Edges this close count as one, so rounding never makes back-to-back items collide: 10/24 + 1/24,
 * an hour from 10:00 as a share of the day, lands a hair past 11/24.
 */
const EDGE_TOLERANCE = 1e-9;
const DEFAULT_STACK_INDENT = 0.15;
/** The furthest a stack indents its deepest item, as a fraction of the column width. */
const MAX_STACK_INSET = 0.5;

function compareEntries<TItem extends TimedOverlapItem>(
  left: Entry<TItem>,
  right: Entry<TItem>,
): number {
  return (
    left.top - right.top ||
    right.bottom - left.bottom ||
    (left.item.key < right.item.key ? -1 : left.item.key > right.item.key ? 1 : 0)
  );
}

/** Whether something ending at `bottom` is clear of `edge`, so an item starting there misses it. */
function endsBy(bottom: number, edge: number): boolean {
  return bottom <= edge + EDGE_TOLERANCE;
}

function overlaps<TItem>(left: Entry<TItem>, right: Entry<TItem>): boolean {
  return !endsBy(left.bottom, right.top) && !endsBy(right.bottom, left.top);
}

/**
 * Whether two placed items share some height, as the layout measures collisions: an item ending
 * where another starts does not.
 */
export function placementsOverlap(
  left: Pick<TimedOverlapItem, "height" | "top">,
  right: Pick<TimedOverlapItem, "height" | "top">,
): boolean {
  return !endsBy(left.top + left.height, right.top) && !endsBy(right.top + right.height, left.top);
}

/** Gives each entry the lowest lane free at its top; returns the entries in each lane. */
function assignLanes<TItem>(group: readonly Entry<TItem>[]): readonly (readonly Entry<TItem>[])[] {
  const lanes: Entry<TItem>[][] = [];
  for (const entry of group) {
    const free = lanes.findIndex((lane) => endsBy(lane.at(-1)!.bottom, entry.top));
    entry.lane = free < 0 ? lanes.length : free;
    (lanes[entry.lane] ??= []).push(entry);
  }
  return lanes;
}

function placeColumns<TItem>(group: readonly Entry<TItem>[], place: Place<TItem>): void {
  const lanes = assignLanes(group);
  for (const entry of group) {
    let span = 1;
    while (
      entry.lane + span < lanes.length &&
      !lanes[entry.lane + span]!.some((other) => overlaps(entry, other))
    ) {
      span += 1;
    }
    place(entry, entry.lane / lanes.length, span / lanes.length);
  }
}

function placeEqual<TItem>(group: readonly Entry<TItem>[], place: Place<TItem>): void {
  const { length } = assignLanes(group);
  for (const entry of group) place(entry, entry.lane / length, 1 / length);
}

function placeStack<TItem>(
  group: readonly Entry<TItem>[],
  place: Place<TItem>,
  indent: number,
): void {
  // Sorted by top, so the earlier entries an entry can overlap are those still open at its top.
  let open: Entry<TItem>[] = [];
  let deepest = 0;
  for (const entry of group) {
    open = open.filter((other) => !endsBy(other.bottom, entry.top));
    entry.lane = open.reduce(
      (depth, other) => (overlaps(entry, other) ? Math.max(depth, other.lane + 1) : depth),
      0,
    );
    open.push(entry);
    deepest = Math.max(deepest, entry.lane);
  }

  const step = deepest === 0 ? 0 : Math.min(indent, MAX_STACK_INSET / deepest);
  for (const entry of group) place(entry, entry.lane * step, 1 - entry.lane * step);
}

function groupPlacer<TItem>(
  options: TimedOverlapOptions,
  place: Place<TItem>,
): (group: readonly Entry<TItem>[]) => void {
  switch (options.overlapLayout ?? "columns") {
    case "columns":
      return (group) => placeColumns(group, place);
    case "equal":
      return (group) => placeEqual(group, place);
    case "stack": {
      const indent = options.stackIndent ?? DEFAULT_STACK_INDENT;
      if (!(indent > 0)) throw new RangeError("invalid-stack-indent");
      return (group) => placeStack(group, place, indent);
    }
    default:
      throw new RangeError("invalid-overlap-layout");
  }
}

/**
 * Lays out vertical items that may overlap, by `options.overlapLayout`. Transitively overlapping
 * items form a collision group, laid out on its own, so a change outside a group never moves its
 * items. Under `"columns"` and `"equal"` each item takes the lowest lane free in its group; under
 * `"stack"` each item sits one level deeper than the deepest earlier item it overlaps. Intervals
 * are half-open, so an item ending where another starts does not collide.
 *
 * Placements are ordered by top, then longer first, then key. That is also their order on top of
 * each other: render them in order, and a stacked item is drawn over the items it overlaps.
 */
export function layoutTimedOverlaps<TItem extends TimedOverlapItem>(
  items: readonly TItem[],
  options: TimedOverlapOptions = {},
): readonly TimedOverlapPlacement<TItem>[] {
  const minHeight = options.minHeight ?? 0;
  const entries = items
    .map((item) => ({
      bottom: item.top + Math.max(item.height, minHeight),
      item,
      lane: 0,
      top: item.top,
    }))
    .sort(compareEntries);
  const placements: TimedOverlapPlacement<TItem>[] = [];
  const placeGroup = groupPlacer<TItem>(options, (entry, left, width) => {
    placements.push(
      Object.freeze({
        height: entry.bottom - entry.top,
        item: entry.item,
        left,
        top: entry.top,
        width,
      }),
    );
  });
  let group: Entry<TItem>[] = [];
  let groupBottom = -Infinity;

  for (const entry of entries) {
    if (endsBy(groupBottom, entry.top)) {
      placeGroup(group);
      group = [];
    }
    group.push(entry);
    groupBottom = Math.max(groupBottom, entry.bottom);
  }
  placeGroup(group);

  return Object.freeze(placements);
}
