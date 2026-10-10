import type { ResourceId } from "@moltenship/calendar-core";

/**
 * Attributes that place an element in a resource, for spreading onto a resource's column, row, or
 * cells. `data-resource-id` holds the ID as text, empty for the unassigned bucket (`null`); numeric
 * IDs add `data-resource-id-type="number"`, so `1` and `"1"` stay distinct.
 */
export function resourceIdAttributes(id: ResourceId | null): {
  readonly "data-resource-id": string;
  readonly "data-resource-id-type"?: "number";
} {
  if (id === null) return { "data-resource-id": "" };
  return typeof id === "number"
    ? { "data-resource-id": String(id), "data-resource-id-type": "number" }
    : { "data-resource-id": id };
}

/**
 * The resource an element sits in, from the nearest `resourceIdAttributes`: `null` in the
 * unassigned bucket, `undefined` outside any resource.
 */
export function resourceIdOf(element: Element): ResourceId | null | undefined {
  const holder = element.closest("[data-resource-id]");
  if (holder === null) return undefined;
  const id = holder.getAttribute("data-resource-id")!;
  if (id === "") return null;
  return holder.getAttribute("data-resource-id-type") === "number" ? Number(id) : id;
}
