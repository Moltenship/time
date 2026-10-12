// @vitest-environment jsdom

import { readFile } from "node:fs/promises";
import path from "node:path";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, expect, test, vi } from "vite-plus/test";

import { calendarEventColors } from "@registry/calendar-theme/event-colors";

import ThemeBuilder from "../components/theme-builder/builder";
import ThemeCalendar from "../components/theme-builder/calendar";
import { parseTheme } from "../components/theme-builder/theme";

// The previews load Temporal and the calendar on their own; the controls are under test here.
vi.mock("../components/theme-builder/island", () => ({
  ThemeCalendarIsland: () => <div data-testid="calendar" />,
}));
vi.mock("@/components/calendar-preview/island", () => ({
  ResourcePreviewIsland: () => <div data-testid="resources" />,
}));

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

const source = parseTheme(
  await readFile(
    path.join(import.meta.dirname, "../../../registry/calendar-theme/calendar-theme.css"),
    "utf8",
  ),
);

let cleanup: (() => Promise<void>) | undefined;

beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("matchMedia", () => ({
    addEventListener() {},
    matches: true,
    removeEventListener() {},
  }));
});

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
  document.documentElement.classList.remove("dark");
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

const button = (container: HTMLElement, name: string) =>
  [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === name || candidate.getAttribute("aria-label") === name,
  )!;

/** The text input a visible label names. */
function input(container: HTMLElement, label: string) {
  const element = [...container.querySelectorAll("label")].find((candidate) =>
    candidate.textContent.startsWith(label),
  )!;
  return container.querySelector<HTMLInputElement>(`#${CSS.escape(element.htmlFor)}`)!;
}

async function type(field: HTMLInputElement, value: string) {
  await act(async () => {
    // The prototype's setter, so React sees a change rather than its own value.
    Reflect.set(HTMLInputElement.prototype, "value", value, field);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const css = (container: HTMLElement) => container.querySelector("pre")!.textContent;
const previewStyle = (container: HTMLElement) =>
  container.querySelector("[data-theme-preview] > style")!.textContent;

test("labels every control and gives every token one", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const labelled = new Set(
    [...container.querySelectorAll("label code")].map((code) => code.textContent),
  );

  for (const { name } of source.tokens) expect(labelled, name).toContain(name);
  for (const field of container.querySelectorAll("input")) {
    const named =
      field.hasAttribute("aria-label") ||
      container.querySelector(`label[for="${CSS.escape(field.id)}"]`) !== null;
    expect(named, field.outerHTML).toBe(true);
  }
  for (const slider of container.querySelectorAll('input[type="range"]')) {
    expect(slider.getAttribute("aria-valuetext")).toMatch(/\d/);
  }
  expect(input(container, "Today").value).toBe("oklch(0.52 0.215 262.9)");
  expect(container.querySelector('input[type="color"]')?.getAttribute("aria-label")).toBe(
    "Grid lines: pick a colour",
  );
});

test("a token edit restyles the preview and the CSS, and its reset undoes it", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const today = input(container, "Today");
  const reset = button(container, "Reset Today");

  expect(reset.disabled).toBe(true);
  expect(css(container)).toContain("No changes");

  await type(today, "oklch(0.6 0.2 30)");

  expect(previewStyle(container)).toContain("--calendar-today: oklch(0.6 0.2 30);");
  expect(css(container)).toContain(":root {\n    --calendar-today: oklch(0.6 0.2 30);\n  }");
  expect(css(container)).toContain(".dark {\n    --calendar-today: oklch(0.707 0.165 254.6);");
  expect(reset.disabled).toBe(false);

  await act(async () => reset.click());
  expect(today.value).toBe("oklch(0.52 0.215 262.9)");
  expect(css(container)).toContain("No changes");
});

test("a value that could escape the preview's rule is flagged and never applied", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const today = input(container, "Today");

  await type(today, "red} body { color: red");

  expect(today.getAttribute("aria-invalid")).toBe("true");
  expect(previewStyle(container)).not.toContain("body");
  await act(async () => today.dispatchEvent(new FocusEvent("blur")));
  await act(async () => today.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(today.value).toBe("oklch(0.52 0.215 262.9)");
});

test("follows the docs theme, previews the other one, and edits the mode it shows", async () => {
  document.documentElement.classList.add("dark");
  const container = await render(<ThemeBuilder source={source} />);
  const preview = container.querySelector("[data-theme-preview]")!;

  expect(preview.classList.contains("dark")).toBe(true);
  expect(previewStyle(container)).toContain("--calendar-today: oklch(0.707 0.165 254.6);");

  await act(async () => button(container, "Light").click());
  expect(preview.classList.contains("dark")).toBe(false);
  expect(container.textContent).toContain("Calendar colours, light");

  await act(async () => button(container, "Dark").click());
  await type(input(container, "Now line"), "oklch(0.8 0.1 30)");
  expect(css(container)).toContain(".dark {\n    --calendar-now: oklch(0.8 0.1 30);");
  expect(css(container)).not.toContain(":root");
});

test("presets press when applied, sizes slide in rem, and the full set copies", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const container = await render(<ThemeBuilder source={source} />);
  const ocean = button(container, "Ocean");
  const hourHeight = input(container, "Hour height");

  await act(async () => ocean.click());
  expect(ocean.getAttribute("aria-pressed")).toBe("true");
  expect(button(container, "Neutral").getAttribute("aria-pressed")).toBe("false");

  await type(hourHeight, "4.5");
  expect(hourHeight.getAttribute("aria-valuetext")).toBe("4.5rem");
  expect(css(container)).toContain("--calendar-hour-height: 4.5rem;");
  expect(button(container, "Roomy").getAttribute("aria-pressed")).toBe("false");

  await act(async () => button(container, "All tokens").click());
  await act(async () => button(container, "Copy CSS").click());
  expect(writeText).toHaveBeenCalledWith(css(container));
  expect(css(container)).toContain("--calendar-grid: var(--border);");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied");

  await act(async () => button(container, "Reset all").click());
  expect(button(container, "Neutral").getAttribute("aria-pressed")).toBe("true");
  Reflect.deleteProperty(navigator, "clipboard");
});

test("arrow keys move between the preview's views, which the tabs switch", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const week = button(container, "Week");

  await act(async () => week.focus());
  await act(async () =>
    week.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "ArrowRight" })),
  );
  expect(document.activeElement).toBe(button(container, "Day"));

  await act(async () => button(container, "People and rooms").click());
  expect(container.querySelector('[data-testid="resources"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="calendar"]')).toBeNull();
});

test("the preview's week shows the whole palette and hands date clicks to the tabs", async () => {
  const onViewChange = vi.fn();
  const container = await render(<ThemeCalendar onViewChange={onViewChange} view="week" />);
  const colors = new Set(
    [...container.querySelectorAll("[data-color]")].map((chip) => chip.getAttribute("data-color")),
  );

  expect(colors).toEqual(new Set(calendarEventColors));
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label^="Open "]')!.click(),
  );
  expect(onViewChange.mock.calls[0]?.[0]).toBe("day");
});
