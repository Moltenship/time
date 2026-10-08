// @vitest-environment jsdom

import type { EventId } from "@moltenship/calendar";
import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, test } from "vite-plus/test";

import { findEventElement, useFollowEventElement } from "../src/event-anchor";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement("div");
document.body.append(container);
const root = createRoot(container);
let anchor: HTMLElement | null = null;

afterEach(async () => {
  await act(async () => root.render(null));
});

/** Renders one event in the time grid or the all-day row, like a view does after a drag. */
function Harness({ row }: { readonly row: "all-day" | "grid" | "none" }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<HTMLElement | null>(null);
  anchor = current;
  useFollowEventElement(viewport, current, "planning", setCurrent);
  const event = (
    <button data-event-id="planning" onClick={(click) => setCurrent(click.currentTarget)}>
      Weekly planning
    </button>
  );
  return (
    <div ref={viewport}>
      <div data-row="grid">{row === "grid" && event}</div>
      <div data-row="all-day">{row === "all-day" && event}</div>
    </div>
  );
}

test("follows an event that a view re-renders in another row, and lets go once it is gone", async () => {
  await act(async () => root.render(<Harness row="grid" />));
  await act(async () => container.querySelector("button")?.click());
  const clicked = anchor;
  expect(clicked?.closest("[data-row]")?.getAttribute("data-row")).toBe("grid");

  await act(async () => root.render(<Harness row="all-day" />));
  expect(clicked?.isConnected).toBe(false);
  expect(anchor?.isConnected).toBe(true);
  expect(anchor?.closest("[data-row]")?.getAttribute("data-row")).toBe("all-day");

  await act(async () => root.render(<Harness row="none" />));
  expect(anchor).toBeNull();
});

test("finds an event's first element and keeps numeric and string IDs apart", () => {
  const view = document.createElement("div");
  view.innerHTML = `
    <button data-event-id="1">string one</button>
    <button data-event-id="1" data-event-id-type="number">first fragment</button>
    <button data-event-id="1" data-event-id-type="number">second fragment</button>`;
  const lookup = (id: EventId) => findEventElement(view, id)?.textContent;

  expect(lookup(1)).toBe("first fragment");
  expect(lookup("1")).toBe("string one");
  expect(lookup("missing")).toBeUndefined();
});

test("prefers the fragment in view over an earlier one scrolled out of the time grid", () => {
  const grid = document.createElement("div");
  grid.style.overflowY = "auto";
  grid.innerHTML = `
    <button data-event-id="deploy">Friday 23:00</button>
    <button data-event-id="deploy">Saturday 00:00</button>`;
  document.body.append(grid);
  const [friday, saturday] = [...grid.querySelectorAll("button")];
  // jsdom has no layout, so give the grid and fragments their on-screen boxes.
  const placeAt = (element: Element | undefined, top: number, height: number) => {
    if (element) element.getBoundingClientRect = () => new DOMRect(0, top, 120, height);
  };
  placeAt(grid, 160, 600);
  placeAt(friday, 1270, 60);
  placeAt(saturday, 166, 72);

  expect(findEventElement(grid, "deploy")?.textContent).toBe("Saturday 00:00");

  placeAt(saturday, -400, 72);
  expect(findEventElement(grid, "deploy")?.textContent).toBe("Friday 23:00");
  grid.remove();
});
