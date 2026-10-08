// @vitest-environment jsdom

import { expect, test } from "vite-plus/test";

import { eventIdAttributes, eventIdOf } from "../src/index";

function rendered(id: string | number): Element {
  const element = document.createElement("button");
  for (const [name, value] of Object.entries(eventIdAttributes(id))) {
    if (value !== undefined) element.setAttribute(name, value);
  }
  return element;
}

test("event ID attributes round-trip numeric and string IDs", () => {
  expect(eventIdAttributes(1)).toEqual({ "data-event-id": "1", "data-event-id-type": "number" });
  expect(eventIdAttributes("1")).toEqual({ "data-event-id": "1" });
  expect(eventIdOf(rendered(1))).toBe(1);
  expect(eventIdOf(rendered("1"))).toBe("1");
  expect(eventIdOf(rendered(-2.5))).toBe(-2.5);
  expect(eventIdOf(document.createElement("div"))).toBeNull();
});
