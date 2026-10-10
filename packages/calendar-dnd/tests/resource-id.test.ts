// @vitest-environment jsdom

import { expect, test } from "vite-plus/test";

import { resourceIdAttributes, resourceIdOf } from "../src/index";

/** A cell inside an element carrying `resourceIdAttributes(id)`. */
function cellIn(id: string | number | null): Element {
  const holder = document.createElement("div");
  for (const [name, value] of Object.entries(resourceIdAttributes(id))) {
    if (value !== undefined) holder.setAttribute(name, value);
  }
  const cell = document.createElement("div");
  holder.append(cell);
  return cell;
}

test("resource ID attributes round-trip numeric, string, and unassigned resources", () => {
  expect(resourceIdAttributes(1)).toEqual({
    "data-resource-id": "1",
    "data-resource-id-type": "number",
  });
  expect(resourceIdAttributes("room-1")).toEqual({ "data-resource-id": "room-1" });
  expect(resourceIdAttributes(null)).toEqual({ "data-resource-id": "" });
  expect(resourceIdOf(cellIn(1))).toBe(1);
  expect(resourceIdOf(cellIn("1"))).toBe("1");
  expect(resourceIdOf(cellIn(null))).toBeNull();
  expect(resourceIdOf(document.createElement("div"))).toBeUndefined();
});
