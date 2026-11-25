import { describe, expect, test } from "vite-plus/test";
import { commands } from "vite-plus/test/browser";

import type { MouseStep } from "../mouse";
import { read } from "./parity/read";
import { until } from "./render";

/**
 * The demo's StyleX page looks like its Tailwind one. Each test opens the week view of both pages
 * in a frame of the same size, puts it in the same state with real input, and compares the chrome:
 * the top bar's, sidebar's and popups' controls, matched by name, with their computed styles, box
 * and first icon. The calendar inside is the registry's, which the flavours' parity test covers.
 */

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    mouse: (step: MouseStep) => Promise<void>;
  }
}

const pages = ["tailwind", "stylex"] as const;
type Page = (typeof pages)[number];
const themes = ["light", "dark"] as const;
const sizes = {
  desktop: { height: 800, width: 1280 },
  phone: { height: 800, width: 390 },
} as const;
type Size = keyof typeof sizes;

/** What a probe reads in the chrome; the views' own parts are left to the flavours' parity. */
const controls = [
  "a",
  "button",
  "h1",
  "h2",
  "h3",
  "p",
  "label",
  "input",
  "textarea",
  "kbd",
  "dt",
  "header",
  "main",
  "aside",
  "[role=checkbox]",
  "[role=combobox]",
  "[role=dialog]",
  "[role=group]",
].join(", ");
const views = '[data-slot="calendar-views"], [data-slot="mini-month"]';
const page = 'header, aside, main, button[aria-label="Create event"]';
const popup = '[role="dialog"]';

/**
 * How a popup is placed and how it opens. Base UI's popups sit in a positioner and open with
 * tw-animate-css's keyframes; the kit's, which the StyleX page reuses, sit in the top layer and
 * open with transitions, at the same 100 ms, fade and 95% scale. Their boxes are compared.
 */
const placement = [
  "animation-duration",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "position",
  "transform",
  "transition-property",
  "transition-timing-function",
  "z-index",
];

const frame = () => document.querySelector<HTMLIFrameElement>("iframe[data-demo-parity]")!;
const win = () => frame().contentWindow!;
const nextFrames = async (count = 2) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => win().requestAnimationFrame(resolve));
  }
};

/** Ends what's running, and what that starts in turn, so a popup is shown in full. */
async function settle() {
  await until(() => expect(win().document.querySelector("[data-starting-style]")).toBeNull());
  for (let round = 0; round < 3; round += 1) {
    await nextFrames();
    for (const animation of win().document.getAnimations()) {
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    }
  }
  await nextFrames();
}

async function open(page: Page, theme: string, size: Size) {
  frame()?.remove();
  const element = document.createElement("iframe");
  element.dataset.demoParity = page;
  element.src = `${new URL(`./demo-parity/${page}.html`, import.meta.url).href}?theme=${theme}`;
  const { height, width } = sizes[size];
  element.style.cssText = `position: fixed; inset: 0 auto auto 0; z-index: 2147483646; border: 0; width: ${width}px; height: ${height}px`;
  document.body.append(element);
  await until(() => expect(element.contentWindow?.demoParityReady).toBe(true));
  await settle();
}

function find(selector: string, name?: string) {
  const found = [...win().document.querySelectorAll<HTMLElement>(selector)].find(
    (element) =>
      name === undefined ||
      element.getAttribute("aria-label") === name ||
      element.textContent?.trim() === name,
  );
  if (found === undefined) throw new Error(`No ${selector} ${name ?? ""} in the frame`);
  return found;
}

async function press(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  await commands.mouse({ type: "move", x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await commands.mouse({ type: "down" });
  await commands.mouse({ type: "up" });
}

/**
 * A control's name for matching: its role or tag, then its label or text. The page switch's two
 * links are named by state, the current page's and the other's: their words differ on purpose.
 */
function nameOf(element: Element) {
  // Base UI's select icon is a "▼" its trigger's text includes.
  const text = (element.getAttribute("aria-label") ?? element.textContent ?? "")
    .replaceAll("▼", "")
    .trim();
  if (element.matches('[role="group"] > a') && /^(?:Tailwind|StyleX)$/u.test(text)) {
    return element.getAttribute("aria-current") === "page" ? "a: this page" : "a: the other page";
  }
  const role = element.getAttribute("role");
  const labelledBy = role === "dialog" ? element.getAttribute("aria-labelledby") : null;
  const label =
    role === "checkbox"
      ? (element.closest("label")?.textContent?.trim() ?? text)
      : labelledBy === null
        ? text
        : (element.ownerDocument.getElementById(labelledBy)?.textContent?.trim() ?? text);
  return `${role ?? element.tagName.toLowerCase()}: ${label.replaceAll(/\s+/gu, " ").slice(0, 40)}`;
}

/** The chrome's controls by name, each with what it reads, and its first icon's. */
function probe(scope: string) {
  const rows = new Map<string, Record<string, string>>();
  const roots = [...win().document.querySelectorAll(scope)];
  const elements = roots.flatMap((root) => [root, ...root.querySelectorAll(controls)]);
  for (const element of new Set(elements)) {
    if (element.parentElement?.closest(views) != null) continue;
    const values = read(win(), element);
    if (element.matches(popup)) for (const property of placement) delete values[property];
    // Form inputs hidden for screen readers' sake differ in kind between Base UI and ui-sdk.
    if (values.box === "hidden" && element.matches("input, textarea")) continue;
    let name = nameOf(element);
    for (let index = 2; rows.has(name); index += 1) name = `${nameOf(element)} #${index}`;
    if (name.startsWith("a: this page") || name.startsWith("a: the other page")) {
      delete values.box;
      delete values.text;
    }
    rows.set(name, values);
    const icon = element.matches("a, button, [role=checkbox]")
      ? element.querySelector("svg")
      : null;
    if (icon !== null) rows.set(`${name}, icon`, read(win(), icon));
  }
  return rows;
}

function differences(
  tailwind: Map<string, Record<string, string>>,
  stylex: Map<string, Record<string, string>>,
) {
  const lines: string[] = [];
  for (const [name, values] of tailwind) {
    const other = stylex.get(name);
    if (other === undefined) {
      lines.push(`only in Tailwind: ${name}`);
      continue;
    }
    for (const [property, value] of Object.entries(values)) {
      if (other[property] !== value) {
        lines.push(`${name}: ${property} is ${value} in Tailwind, ${other[property]} in StyleX`);
      }
    }
  }
  for (const name of stylex.keys()) {
    if (!tailwind.has(name)) lines.push(`only in StyleX: ${name}`);
  }
  return lines;
}

interface Scenario {
  readonly name: string;
  readonly size: Size;
  /** What the comparison reads, once `act` has run. */
  readonly scope: string;
  readonly act?: () => Promise<void>;
}

const scenarios: Scenario[] = [
  { name: "page", scope: page, size: "desktop" },
  {
    act: () => press(find("aside button", "Create")),
    name: "event dialog",
    scope: popup,
    size: "desktop",
  },
  {
    act: () => press(find("header button", "Keyboard shortcuts")),
    name: "shortcuts dialog",
    scope: popup,
    size: "desktop",
  },
  {
    act: () => press(find("main [data-event-id]:not([data-event-id*='::'])")),
    name: "event popover",
    scope: popup,
    size: "desktop",
  },
  { name: "page", scope: page, size: "phone" },
  {
    act: () => press(find("header button", "Open sidebar")),
    name: "sidebar sheet",
    scope: popup,
    size: "phone",
  },
  {
    act: () => press(find("button", "Create event")),
    name: "event dialog",
    scope: popup,
    size: "phone",
  },
];

describe("the demo's StyleX page looks like its Tailwind page", () => {
  describe.each(themes)("%s theme", (theme) => {
    test.each(scenarios)(
      "$size, $name",
      async ({ act, scope, size }) => {
        const read: Partial<Record<Page, Map<string, Record<string, string>>>> = {};
        for (const page of pages) {
          await open(page, theme, size);
          if (act !== undefined) {
            await act();
            await until(() => expect(win().document.querySelector(scope)).not.toBeNull());
            await settle();
          }
          read[page] = probe(scope);
        }
        frame().remove();

        expect(read.tailwind!.size).toBeGreaterThan(3);
        expect(differences(read.tailwind!, read.stylex!)).toEqual([]);
      },
      60_000,
    );
  });
});
