// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vite-plus/test";

import { ThemeToggle } from "../src/components/theme-toggle";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const container = document.createElement("div");
const root = createRoot(container);
const stored = new Map<string, string>();

beforeEach(() => {
  // Node's own experimental localStorage global shadows jsdom's, so stub a small one.
  stored.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
  });
  vi.stubGlobal("matchMedia", () => ({
    addEventListener: () => {},
    matches: false,
    removeEventListener: () => {},
  }));
  document.documentElement.classList.remove("dark");
});

afterEach(async () => {
  await act(async () => root.render(null));
  vi.unstubAllGlobals();
});

test("every theme toggle reflects one theme and switches it on the first click", async () => {
  await act(async () =>
    root.render(
      <>
        <ThemeToggle />
        <ThemeToggle />
      </>,
    ),
  );
  const [sheetToggle, topBarToggle] = container.querySelectorAll("button");
  const labels = () =>
    [...container.querySelectorAll("button")].map((button) => button.getAttribute("aria-label"));

  await act(async () => sheetToggle?.click());
  expect(document.documentElement.classList.contains("dark")).toBe(true);
  expect(stored.get("moltenship-demo:theme")).toBe("dark");
  expect(labels()).toEqual(["Switch to light theme", "Switch to light theme"]);

  await act(async () => topBarToggle?.click());
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(labels()).toEqual(["Switch to dark theme", "Switch to dark theme"]);
});
