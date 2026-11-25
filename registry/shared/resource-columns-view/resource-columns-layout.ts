import type { ResourceColumn, ResourceId, VisibleResource } from "@moltenship/calendar";

import { resourceTitle } from "./resource-columns-labels";

/*
 * The resource columns' sizes and grid positions, one place for every framework's markup.
 */

/** Pointer and keyboard both step by these slots, so they reach the same times. */
export const resourceColumnsSnap = { increment: 15, smallestUnit: "minute" } as const;
/** The narrowest a resource's day gets before the columns scroll sideways, in pixels. */
export const MIN_DAY_WIDTH = 128;
/** Height of one hierarchy level, in rem. */
export const LEVEL = 2;
/** A name row with room for the status badge under the name, in rem. */
export const STATUS_ROW = 2.75;

/** The narrowest a resource's column gets: a day's narrowest, for each of its days. */
export function resourceMinWidth(days: number): number {
  return MIN_DAY_WIDTH * Math.max(1, days);
}

/** The `aria-colindex` of a resource's first day column, after the gutter's. */
export function resourceColIndex(index: number, days: number): number {
  return 2 + index * days;
}

/** The hierarchy's depth among the visible resources: one header level each. */
export function headerLevels(resources: readonly ResourceColumn<unknown>[]): number {
  return resources.reduce((deepest, { resource }) => Math.max(deepest, resource.depth + 1), 1);
}

/** The header row's height, in rem: a band per level above, then the name row. */
export function headerRowHeight(levels: number, status: boolean): string {
  return `${(levels - 1) * LEVEL + (status ? STATUS_ROW : LEVEL)}rem`;
}

/** A group's band, in rem. */
export const groupBandHeight = `${LEVEL}rem`;

/**
 * A name row's height, in rem. Groups show no status, so their name row keeps the height their
 * members' bands have.
 */
export function nameRowHeight(status: boolean, hasChildren: boolean): string {
  return `${status && !hasChildren ? STATUS_ROW : LEVEL}rem`;
}

/** The space under a resource that sits higher than the deepest one, in rem. */
export function headerFillHeight(levels: number, depth: number): string {
  return `${(levels - depth - 1) * LEVEL}rem`;
}

/**
 * The names of the groups each resource sits in, outermost first. A visible resource's parents
 * are visible too, so its groups are found among the columns.
 */
export function resourceGroupsOf(resources: readonly ResourceColumn<unknown>[]) {
  const byId = new Map<ResourceId | null, VisibleResource>(
    resources.map(({ resource }) => [resource.id, resource] as const),
  );
  return (resource: VisibleResource): readonly string[] => {
    const groups: string[] = [];
    for (let parentId = resource.parentId; parentId !== null;) {
      const parent = byId.get(parentId);
      if (parent === undefined) break;
      groups.unshift(resourceTitle(parent));
      parentId = parent.parentId;
    }
    return groups;
  };
}
