import { describe, expect, test } from "vite-plus/test";

import {
  createResourceTree,
  groupByResource,
  showsInResource,
  visibleResources,
  type CalendarResource,
  type ResourceTreeNode,
  type VisibleResource,
} from "../src/index";

function resource(id: string, parentId?: string): CalendarResource<null> {
  return { data: null, id, title: id, ...(parentId === undefined ? {} : { parentId }) };
}

/** Each node as `id` indented by depth, depth first. */
function outline(nodes: readonly ResourceTreeNode<CalendarResource<null>>[]): string[] {
  return nodes.flatMap((node) => [
    `${"  ".repeat(node.depth)}${node.id}`,
    ...outline(node.children),
  ]);
}

function ids(rows: readonly VisibleResource<unknown>[]): string[] {
  return rows.map((row) => `${"  ".repeat(row.depth)}${row.id ?? "(unassigned)"}`);
}

// People grouped by team, then rooms; children arrive before their parents on purpose.
const people = [
  resource("ada", "design"),
  resource("design"),
  resource("ben", "design"),
  resource("eng"),
  resource("cy", "eng"),
  resource("pair", "cy"),
  resource("room-1"),
];

describe("resource tree", () => {
  test("nests resources by parentId and keeps siblings in input order", () => {
    const tree = createResourceTree(people);

    expect(outline(tree.roots)).toEqual([
      "design",
      "  ada",
      "  ben",
      "eng",
      "  cy",
      "    pair",
      "room-1",
    ]);
    expect(tree.byId.get("pair")).toMatchObject({ depth: 2, parentId: "cy" });
    expect(tree.byId.get("design")).toMatchObject({ depth: 0, parentId: null });
    // The same input in another order keeps each parent's children in their relative order.
    expect(outline(createResourceTree(people.toReversed()).roots)).toEqual([
      "room-1",
      "eng",
      "  cy",
      "    pair",
      "design",
      "  ben",
      "  ada",
    ]);
  });

  test("keeps the first of a repeated ID and lifts orphans and loops to the top level", () => {
    const tree = createResourceTree([
      resource("a", "b"),
      resource("b", "a"),
      resource("c", "missing"),
      resource("self", "self"),
      { ...resource("c"), title: "second c" },
    ]);

    expect(outline(tree.roots)).toEqual(["a", "  b", "c", "self"]);
    expect(tree.byId.get("c")?.resource.title).toBe("c");
    expect(tree.byId.get("a")?.parentId).toBeNull();
  });

  test("keeps numeric and string IDs apart", () => {
    const tree = createResourceTree([
      { data: null, id: 1, title: "number" },
      { data: null, id: "1", parentId: 1, title: "string" },
    ]);

    expect(tree.roots).toHaveLength(1);
    expect(tree.byId.get("1")).toMatchObject({ depth: 1, parentId: 1 });
  });
});

describe("visible resources", () => {
  const tree = createResourceTree(people);

  test("show a resource's children only while it is expanded", () => {
    expect(ids(visibleResources(tree, []))).toEqual(["design", "eng", "room-1"]);
    expect(ids(visibleResources(tree, ["eng", "cy"]))).toEqual([
      "design",
      "eng",
      "  cy",
      "    pair",
      "room-1",
    ]);
    // A collapsed parent hides every descendant, whatever their own expansion.
    expect(ids(visibleResources(tree, ["cy"]))).toEqual(["design", "eng", "room-1"]);
  });

  test("carry depth, parent, and expansion for headers and keys", () => {
    const [design, ada, , eng] = visibleResources(tree, ["design", "ada"]);

    expect(design).toMatchObject({
      depth: 0,
      expanded: true,
      hasChildren: true,
      key: "resource:string:design",
      parentId: null,
    });
    // A leaf never reports itself as expanded.
    expect(ada).toMatchObject({
      depth: 1,
      expanded: false,
      hasChildren: false,
      parentId: "design",
    });
    expect(eng).toMatchObject({ expanded: false, hasChildren: true });
    expect(ada!.resource).toBe(people[0]);
  });

  test("reuse unchanged rows when another resource toggles", () => {
    const collapsed = visibleResources(tree, []);
    const expanded = visibleResources(tree, ["design"]);

    expect(expanded[0]).not.toBe(collapsed[0]);
    expect(expanded.at(-2)).toBe(collapsed[1]);
    expect(expanded.at(-1)).toBe(collapsed[2]);
    expect(visibleResources(tree, ["design"])[1]).toBe(expanded[1]);
  });

  test("end with an unassigned bucket on request", () => {
    const rows = visibleResources(tree, [], { unassigned: "bucket" });

    expect(ids(rows)).toEqual(["design", "eng", "room-1", "(unassigned)"]);
    expect(rows.at(-1)).toMatchObject({ id: null, key: "unassigned", resource: null });
    expect(visibleResources(createResourceTree([]), [], { unassigned: "hide" })).toEqual([]);
  });
});

describe("groupByResource", () => {
  const tree = createResourceTree(people);
  const item = (id: string, resourceIds: readonly string[]) => ({ event: { id, resourceIds } });

  test("hands an event with several resources to each visible one as the same item", () => {
    const pairing = item("pairing", ["ada", "ben", "ada"]);
    const review = item("review", ["design"]);
    const rows = visibleResources(tree, ["design"]);
    const groups = groupByResource([review, pairing], rows);

    expect(ids(rows)).toEqual(["design", "  ada", "  ben", "eng", "room-1"]);
    expect(groups.map((group) => group.map(({ event }) => event.id))).toEqual([
      ["review"],
      ["pairing"],
      ["pairing"],
      [],
      [],
    ]);
    expect(groups[1]![0]).toBe(groups[2]![0]);
  });

  test("sends only events without resources to the bucket and drops hidden ones", () => {
    const rows = visibleResources(tree, [], { unassigned: "bucket" });
    const groups = groupByResource(
      [item("lunch", []), item("hidden", ["ada"]), item("unknown", ["nowhere"])],
      rows,
    );

    expect(groups.map((group) => group.map(({ event }) => event.id))).toEqual([
      [],
      [],
      [],
      ["lunch"],
    ]);
    expect(groupByResource([item("lunch", [])], visibleResources(tree, []))).toEqual([[], [], []]);
  });

  test("follows showsInResource for one resource at a time", () => {
    expect(showsInResource(["ada", "ben"], "ben")).toBe(true);
    expect(showsInResource(["ada"], "ben")).toBe(false);
    expect(showsInResource([], null)).toBe(true);
    expect(showsInResource(["ada"], null)).toBe(false);
  });
});
