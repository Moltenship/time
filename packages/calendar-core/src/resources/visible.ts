import type { ResourceId } from "../ids";
import type { CalendarResource } from "../resources";
import type { ResourceTree, ResourceTreeNode } from "./tree";

/**
 * A resource a view shows, as a column or a row, in display order. The same resource keeps the
 * same object while its expansion does not change, so memoized rows skip re-rendering.
 */
export interface VisibleResource<TResource = CalendarResource<unknown, ResourceId>> {
  readonly depth: number;
  /** Whether its children show. Always `false` without children. */
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  /** `null` for the unassigned bucket. */
  readonly id: ResourceId | null;
  /** Unique among visible resources, for React keys and element IDs. */
  readonly key: string;
  readonly parentId: ResourceId | null;
  /** `null` for the unassigned bucket. */
  readonly resource: TResource | null;
}

export interface ResourceVisibilityOptions {
  /**
   * Events without resources: `"hide"` them (the default), or show them in a `"bucket"` after the
   * resources, a visible resource whose `id` is `null`.
   */
  readonly unassigned?: "bucket" | "hide";
}

const UNASSIGNED: VisibleResource<never> = Object.freeze({
  depth: 0,
  expanded: false,
  hasChildren: false,
  id: null,
  key: "unassigned",
  parentId: null,
  resource: null,
});

// Each node's collapsed and expanded rows, so unchanged rows keep their identity across toggles.
const rows = new WeakMap<ResourceTreeNode<unknown>, VisibleResource<unknown>[]>();

function rowOf<TResource>(
  node: ResourceTreeNode<TResource>,
  expanded: boolean,
): VisibleResource<TResource> {
  let cached = rows.get(node);
  if (cached === undefined) rows.set(node, (cached = []));
  const { id } = node;
  return (cached[Number(expanded)] ??= Object.freeze({
    depth: node.depth,
    expanded,
    hasChildren: node.children.length > 0,
    id,
    // `1` and `"1"` are distinct IDs, so the type is part of the key.
    key: `resource:${typeof id}:${id}`,
    parentId: node.parentId,
    resource: node.resource,
  })) as VisibleResource<TResource>;
}

/**
 * Flattens a resource tree into what a view shows, depth first: a resource's children follow it
 * when `expandedResourceIds` holds its ID, and every descendant hides while it is collapsed.
 */
export function visibleResources<TResource>(
  tree: ResourceTree<TResource>,
  expandedResourceIds: readonly ResourceId[],
  { unassigned = "hide" }: ResourceVisibilityOptions = {},
): readonly VisibleResource<TResource>[] {
  const expanded = new Set(expandedResourceIds);
  const visible: VisibleResource<TResource>[] = [];
  const visit = (node: ResourceTreeNode<TResource>) => {
    const row = rowOf(node, node.children.length > 0 && expanded.has(node.id));
    visible.push(row);
    if (row.expanded) node.children.forEach(visit);
  };
  tree.roots.forEach(visit);
  if (unassigned === "bucket") visible.push(UNASSIGNED);
  return Object.freeze(visible);
}

/**
 * Whether an event with `resourceIds` shows in a visible resource: one of its own, or the
 * unassigned bucket (`null`) when it has none.
 */
export function showsInResource(
  resourceIds: readonly ResourceId[],
  resourceId: ResourceId | null,
): boolean {
  return resourceId === null ? resourceIds.length === 0 : resourceIds.includes(resourceId);
}

/**
 * Hands each item, such as an event fragment, to the visible resources its event is assigned to,
 * as one array per resource. An event with several resources reaches each of them as the same
 * item, so every copy keeps the event's identity. Only events without resources reach the
 * unassigned bucket; an event of hidden or unknown resources shows nowhere.
 */
export function groupByResource<
  TItem extends { readonly event: { readonly resourceIds: readonly ResourceId[] } },
>(
  items: readonly TItem[],
  resources: readonly VisibleResource<unknown>[],
): readonly (readonly TItem[])[] {
  const indexes = new Map(resources.map(({ id }, index) => [id, index]));
  const groups = resources.map((): TItem[] => []);
  for (const item of items) {
    const { resourceIds } = item.event;
    // As `showsInResource` decides, looked up by index rather than tested per resource.
    for (const resourceId of resourceIds.length === 0 ? [null] : resourceIds) {
      const group = groups[indexes.get(resourceId) ?? -1];
      // A resource listed twice still shows the event once.
      if (group !== undefined && group.at(-1) !== item) group.push(item);
    }
  }
  return Object.freeze(groups.map((group) => Object.freeze(group)));
}
