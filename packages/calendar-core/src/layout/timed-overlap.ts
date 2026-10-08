export interface TimedOverlapItem {
  readonly height: number;
  /** Stable identity; breaks ordering ties so equal inputs always produce equal layouts. */
  readonly key: string;
  readonly top: number;
}

export interface TimedOverlapOptions {
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
  lane: number;
  readonly top: number;
}

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

function overlaps<TItem>(left: Entry<TItem>, right: Entry<TItem>): boolean {
  return left.top < right.bottom && right.top < left.bottom;
}

function placeGroup<TItem>(
  group: readonly Entry<TItem>[],
  placements: TimedOverlapPlacement<TItem>[],
): void {
  const lanes: Entry<TItem>[][] = [];

  for (const entry of group) {
    const free = lanes.findIndex((lane) => lane.at(-1)!.bottom <= entry.top);
    entry.lane = free < 0 ? lanes.length : free;
    (lanes[entry.lane] ??= []).push(entry);
  }

  for (const entry of group) {
    let span = 1;
    while (
      entry.lane + span < lanes.length &&
      !lanes[entry.lane + span]!.some((other) => overlaps(entry, other))
    ) {
      span += 1;
    }

    placements.push(
      Object.freeze({
        height: entry.bottom - entry.top,
        item: entry.item,
        left: entry.lane / lanes.length,
        top: entry.top,
        width: span / lanes.length,
      }),
    );
  }
}

/**
 * Lays out vertical items side by side. Transitively overlapping items form a collision group;
 * each item takes the lowest free lane in its group and then expands right across lanes it does
 * not overlap. Intervals are half-open, so an item ending where another starts does not collide.
 * Placements are ordered by top, then longer first, then key.
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
  let group: Entry<TItem>[] = [];
  let groupBottom = -Infinity;

  for (const entry of entries) {
    if (entry.top >= groupBottom) {
      placeGroup(group, placements);
      group = [];
    }
    group.push(entry);
    groupBottom = Math.max(groupBottom, entry.bottom);
  }
  placeGroup(group, placements);

  return Object.freeze(placements);
}
