// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import LiveCalendar from "../components/calendar-preview/calendar";
import OverlapCalendar from "../components/calendar-preview/overlap";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // A wide screen, so the week view keeps its seven columns.
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function render(element: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  cleanup = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return container;
}

async function click(element: Element | null | undefined) {
  await act(async () => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const backButton = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].find((button) =>
    button.textContent.startsWith("Back to"),
  );

test("a single-view preview opens a date in the day view and offers the way back", async () => {
  const container = await render(<LiveCalendar view="month" />);
  const today = container.querySelector('[data-slot="month-view"] button[aria-current="date"]');

  expect(backButton(container)).toBeUndefined();

  await click(today);

  expect(container.querySelector('[data-slot="month-view"]')).toBeNull();
  expect(container.querySelector('[data-slot="time-grid"]')).not.toBeNull();
  expect(backButton(container)?.textContent).toBe("Back to month");

  await click(backButton(container));

  expect(container.querySelector('[data-slot="month-view"]')).not.toBeNull();
  expect(backButton(container)).toBeUndefined();
});

test("the overlap preview lays its busy days out by the layout its toggle picks", async () => {
  const container = await render(<OverlapCalendar />);
  // Hiring sync starts with Design review, so it sits beside or over it.
  const hiringSync = () =>
    container.querySelector<HTMLElement>('[data-event-id="busy-1-1"]')?.style.insetInlineStart;
  const toggle = (label: string) =>
    [...container.querySelectorAll("button")].find((button) => button.textContent === label);

  expect(toggle("Columns")?.getAttribute("aria-pressed")).toBe("true");
  expect(hiringSync()).toBe(`${(1 / 3) * 100}%`);

  await click(toggle("Stack"));

  expect(toggle("Stack")?.getAttribute("aria-pressed")).toBe("true");
  expect(toggle("Columns")?.getAttribute("aria-pressed")).toBe("false");
  expect(hiringSync()).toBe(`${0.15 * 100}%`);
});
