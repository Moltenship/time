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
    "Grid lines: pick a color",
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
  // The reset button hides once there's nothing to reset; focus goes back to the field.
  expect(document.activeElement).toBe(today);
});

test("a value that could break the CSS is flagged, explained and never applied", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const today = input(container, "Today");
  const before = previewStyle(container);

  for (const value of ["red} body { color: red", "oklch(0.6 0.2 30) /* brand"]) {
    await type(today, value);

    expect(today.getAttribute("aria-invalid")).toBe("true");
    expect(
      container.querySelector(`#${CSS.escape(today.getAttribute("aria-describedby")!)}`)
        ?.textContent,
    ).toBe("Not a color the preview can use. It keeps oklch(0.52 0.215 262.9).");
    expect(previewStyle(container)).toBe(before);
    expect(css(container)).toContain("No changes");
  }
  await act(async () => today.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
  expect(today.value).toBe("oklch(0.52 0.215 262.9)");
  expect(today.hasAttribute("aria-invalid")).toBe(false);
});

test("follows the docs theme, previews the other one, and edits the mode it shows", async () => {
  document.documentElement.classList.add("dark");
  const container = await render(<ThemeBuilder source={source} />);
  const preview = container.querySelector<HTMLElement>("[data-theme-preview]")!;
  const pressed = () =>
    container.querySelector('[aria-label="Theme"] [aria-pressed="true"]')?.textContent;

  // Following the page, the preview takes its mode from the page's class, as it did on the server.
  expect(pressed()).toBe("Dark");
  expect(preview.hasAttribute("data-mode")).toBe(false);
  expect(container.textContent).toContain("Calendar colors, dark");
  expect(input(container, "Today").value).toBe("oklch(0.707 0.165 254.6)");

  await act(async () => button(container, "Light").click());
  expect(preview.getAttribute("data-mode")).toBe("light");
  expect(preview.classList.contains("dark")).toBe(false);
  expect(preview.style.colorScheme).toBe("light");
  expect(container.textContent).toContain("Calendar colors, light");

  await act(async () => button(container, "Dark").click());
  await type(input(container, "Now line"), "oklch(0.8 0.1 30)");
  expect(css(container)).toContain(".dark {\n    --calendar-now: oklch(0.8 0.1 30);");
  expect(css(container)).not.toContain(":root");
});

test("a mode picked against the docs theme lasts until the docs switch", async () => {
  const container = await render(<ThemeBuilder source={source} />);
  const preview = container.querySelector<HTMLElement>("[data-theme-preview]")!;

  await act(async () => button(container, "Dark").click());
  expect(preview.getAttribute("data-mode")).toBe("dark");
  expect(preview.classList.contains("dark")).toBe(true);

  // The docs' theme toggle sets the class on <html>; the builder watches it.
  await act(async () => document.documentElement.classList.add("dark"));
  await act(async () => document.documentElement.classList.remove("dark"));
  expect(preview.hasAttribute("data-mode")).toBe(false);
  expect(container.textContent).toContain("Calendar colors, light");
});

test("presets show when applied, sizes slide in rem, and the full set copies", async () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const container = await render(<ThemeBuilder source={source} />);
  const ocean = button(container, "Ocean");
  const hourHeight = input(container, "Hour height");

  await act(async () => ocean.click());
  expect(ocean.getAttribute("aria-current")).toBe("true");
  expect(button(container, "Neutral").hasAttribute("aria-current")).toBe(false);

  await type(hourHeight, "4.5");
  expect(hourHeight.getAttribute("aria-valuetext")).toBe("4.5rem");
  expect(css(container)).toContain("--calendar-hour-height: 4.5rem;");
  expect(button(container, "Roomy").hasAttribute("aria-current")).toBe(false);

  await act(async () => button(container, "All tokens").click());
  await act(async () => button(container, "Copy CSS").click());
  expect(writeText).toHaveBeenCalledWith(css(container));
  expect(css(container)).toContain("--calendar-grid: var(--border);");
  expect(container.querySelector('[role="status"]')?.textContent).toBe("Copied");

  const resetAll = button(container, "Reset all");
  await act(async () => resetAll.focus());
  await act(async () => resetAll.click());
  expect(button(container, "Neutral").getAttribute("aria-current")).toBe("true");
  // Nothing left to reset, but the button keeps focus rather than dropping it to the page.
  expect(resetAll.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(resetAll);
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

test("the preview's week shows the palette and the default event tokens", async () => {
  const onViewChange = vi.fn();
  const container = await render(<ThemeCalendar onViewChange={onViewChange} view="week" />);
  const events = [...container.querySelectorAll<HTMLElement>('[data-slot="calendar-event"]')];
  const colors = new Set(events.map((chip) => chip.getAttribute("data-color")));

  expect(colors).toEqual(new Set([...calendarEventColors, null]));
  // Time-grid events read their padding from the density tokens.
  const timed = events.filter((chip) => chip.closest("[data-slot=time-grid-body]") !== null);
  expect(timed.length).toBeGreaterThan(0);
  for (const chip of timed) expect(chip.className).toContain("px-[var(--calendar-event-padding-x,");
  expect(timed.some((chip) => chip.className.includes("py-[var(--calendar-event-padding-y,"))).toBe(
    true,
  );
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label^="Open "]')!.click(),
  );
  expect(onViewChange.mock.calls[0]?.[0]).toBe("day");
});
