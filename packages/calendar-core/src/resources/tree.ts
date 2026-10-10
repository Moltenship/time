import type { ResourceId } from "../ids";
import { ReadonlyMapView } from "../internal/readonly-map";
import type { CalendarResource } from "../resources";

/** What the hierarchy reads from a resource. */
export type ResourceTreeInput = Pick<CalendarResource<unknown, ResourceId>, "id" | "parentId">;

export interface ResourceTreeNode<TResource> {
  /** Children in input order. */
  readonly children: readonly ResourceTreeNode<TResource>[];
  /** `0` for a top-level resource. */
  readonly depth: number;
  readonly id: ResourceId;
  /** `null` for a top-level resource. */
  readonly parentId: ResourceId | null;
  readonly resource: TResource;
}

/** Resources arranged by `parentId`. Build it once per resource list; collapsing reuses it. */
export interface ResourceTree<TResource = CalendarResource<unknown, ResourceId>> {
  readonly byId: ReadonlyMap<ResourceId, ResourceTreeNode<TResource>>;
  /** Top-level resources in input order. */
  readonly roots: readonly ResourceTreeNode<TResource>[];
}

interface MutableNode<TResource> {
  readonly children: MutableNode<TResource>[];
  readonly id: ResourceId;
  parentId: ResourceId | null;
  readonly resource: TResource;
}

function freeze<TResource>(
  node: MutableNode<TResource>,
  depth: number,
  byId: Map<ResourceId, ResourceTreeNode<TResource>>,
): ResourceTreeNode<TResource> {
  const frozen: ResourceTreeNode<TResource> = Object.freeze({
    children: Object.freeze(node.children.map((child) => freeze(child, depth + 1, byId))),
    depth,
    id: node.id,
    parentId: node.parentId,
    resource: node.resource,
  });
  byId.set(frozen.id, frozen);
  return frozen;
}

/** Whether following parents from `node` comes back to it. */
function inCycle<TResource>(
  node: MutableNode<TResource>,
  nodes: ReadonlyMap<ResourceId, MutableNode<TResource>>,
): boolean {
  const seen = new Set<MutableNode<TResource>>();
  for (let current: MutableNode<TResource> | undefined = node; current !== undefined;) {
    if (seen.has(current)) return current === node;
    seen.add(current);
    current = current.parentId === null ? undefined : nodes.get(current.parentId);
  }
  return false;
}

/**
 * Arranges flat resources into a hierarchy by `parentId`. Siblings keep their input order, so the
 * order is stable whatever order parents and children arrive in. A repeated ID keeps its first
 * resource, and a resource whose parent is missing, or whose parents loop back to it, is top-level.
 */
export function createResourceTree<TResource extends ResourceTreeInput>(
  resources: readonly TResource[],
): ResourceTree<TResource> {
  const nodes = new Map<ResourceId, MutableNode<TResource>>();
  for (const resource of resources) {
    if (nodes.has(resource.id)) continue;
    const { id, parentId = null } = resource;
    nodes.set(id, { children: [], id, parentId, resource });
  }

  const roots: MutableNode<TResource>[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId === null ? undefined : nodes.get(node.parentId);
    // The first resource of a loop met in input order is cut from its parent, which ends the loop.
    if (parent === undefined || inCycle(node, nodes)) {
      node.parentId = null;
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }

  const byId = new Map<ResourceId, ResourceTreeNode<TResource>>();
  const frozenRoots = Object.freeze(roots.map((root) => freeze(root, 0, byId)));
  return Object.freeze({ byId: new ReadonlyMapView(byId), roots: frozenRoots });
}
