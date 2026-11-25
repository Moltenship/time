import { describe, expect, test } from "vite-plus/test";
import { commands, userEvent } from "vite-plus/test/browser";

import type { MouseStep } from "../mouse";
import { read } from "./parity/read";
import { until } from "./render";

/**
 * The demo's StyleX page and the Solid demo look like its Tailwind page. Each test opens the week
 * view of each page in a frame of the same size, puts it in the same state with real input, and
 * compares the chrome: the top bar's, sidebar's and popups' controls, matched by name, with their
 * computed styles, box and first icon. The calendar inside is the registry's, which the flavours'
 * parity tests cover. The Solid demo is apps/demo-solid, which the test server serves at `/solid/`
 * (solid-demo.ts).
 */

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    mouse: (step: MouseStep) => Promise<void>;
  }
}

const pages = ["tailwind", "stylex", "solid"] as const;
type Page = (typeof pages)[number];
const pageNames: Readonly<Record<Page, string>> = {
  solid: "Solid",
  stylex: "StyleX",
  tailwind: "Tailwind",
};
const themes = ["light", "dark"] as const;
/**
 * The instant every page's clock stops at (demo-parity/now.ts). The seed, the now line and the
 * annotations follow the clock, so pages loaded a minute or a quarter hour apart would differ.
 */
const now = "2026-10-08T10:30:00Z";
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
  "[role=listbox]",
  "[role=option]",
  "[role=tooltip]",
  "[data-slot=tooltip-content]",
].join(", ");
const views = '[data-slot="calendar-views"], [data-slot="mini-month"]';
const page = 'header, aside, main, button[aria-label="Create event"]';
/** A tooltip: Base UI's has no role, the kit's is a `tooltip`. */
const tip = '[role="tooltip"], [data-slot="tooltip-content"]';
const popup = `[role="dialog"], [role="listbox"], [data-slot="select-content"], ${tip}`;
/** A select's list: shadcn's popup holds Base UI's listbox, the kit's popup is the listbox. */
const list = '[role="listbox"], [data-slot="select-content"]';

/**
 * How a popup is placed and how it opens. Base UI's popups sit in a positioner and open with
 * tw-animate-css's keyframes; the kit's, which the StyleX page reuses, sit in the top layer, which
 * makes an inline box a block, and open with transitions, at the same speed, fade and 95% scale.
 * Their boxes are compared.
 */
const placement = [
  "animation-duration",
  "display",
  "margin-bottom",
  "margin-left",
  "margin-right",
  "margin-top",
  "position",
  "transform",
  "transition-duration",
  "transition-property",
  "transition-timing-function",
  "vertical-align",
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

/** Whether the Solid demo has rendered its events and loaded its fonts. */
const solidReady = (element: HTMLIFrameElement) => {
  const document = element.contentDocument;
  return (
    document?.querySelector("main [data-event-id]") != null && document.fonts.status === "loaded"
  );
};

async function open(page: Page, theme: string, size: Size) {
  frame()?.remove();
  const element = document.createElement("iframe");
  element.dataset.demoParity = page;
  if (page === "solid") {
    // The page reads its theme and settings as it loads, from the storage the frames share, as
    // the React pages' `prepare.ts` sets it.
    localStorage.clear();
    localStorage.setItem("moltenship-demo:theme", theme);
    element.src = `/solid/?view=week&now=${now}`;
  } else {
    element.src = `${new URL(`./demo-parity/${page}.html`, import.meta.url).href}?theme=${theme}&now=${now}`;
  }
  const { height, width } = sizes[size];
  element.style.cssText = `position: fixed; inset: 0 auto auto 0; z-index: 2147483646; border: 0; width: ${width}px; height: ${height}px`;
  document.body.append(element);
  if (page === "solid") {
    await until(() => expect(solidReady(element)).toBe(true));
  } else {
    await until(() => expect(element.contentWindow?.demoParityReady).toBe(true));
  }
  expect(
    (win() as Window & { Temporal: typeof Temporal }).Temporal.Now.instant().toString(),
    `${page}'s clock`,
  ).toBe(now);
  await settle();
}

/** Whether `selector` finds an element that's shown: the kit keeps closed tooltips, hidden. */
const shown = (selector: string) =>
  [...win().document.querySelectorAll(selector)].some((element) => element.checkVisibility());

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

async function hover(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  await commands.mouse({ type: "move", x: box.x + box.width / 2, y: box.y + box.height / 2 });
}

async function press(element: HTMLElement) {
  await hover(element);
  await commands.mouse({ type: "down" });
  await commands.mouse({ type: "up" });
}

/**
 * Opens a select with the button held down. A select's list opens on the press, and a release
 * once it's open picks the option under the pointer: one that came late on a busy machine picked
 * the chosen option, which sits over the trigger, and closed the list before the test read it.
 */
async function pressAndHold(element: HTMLElement) {
  await hover(element);
  await commands.mouse({ type: "down" });
}

/** Shows focus as a keyboard user sees it: after a key press, focus is visible. */
async function focusByKeyboard(element: HTMLElement) {
  await press(find("aside h2, aside h3, aside p"));
  await userEvent.keyboard("{Shift}");
  element.focus();
  await until(() => expect(element.matches(":focus-visible")).toBe(true));
}

/** The text an element holds itself, not its children's: a list item's, a legend's, a hint's. */
const ownText = (element: Element) =>
  element.closest("svg") === null
    ? [...element.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ")
        .replaceAll(/\s+/gu, " ")
        .trim()
    : "";

/**
 * What an element that holds text beside other elements is compared by: its type. Its box is
 * its markup's, which differs where a part renders only text: the kit's select value holds the
 * label alone, and shadcn's the colour dot beside it.
 */
const typography = /^(?:color|font-|letter-spacing|line-height|text|white-space|word-spacing)/u;

/**
 * A control's name for matching: its role or tag, then its label or text. The page switches' links
 * are named by their group and state, the current page's and the other's: their words differ on
 * purpose.
 */
function nameOf(element: Element) {
  // Base UI's select icon is a "▼" its trigger's text includes.
  const text = (element.getAttribute("aria-label") ?? element.textContent ?? "")
    .replaceAll("▼", "")
    .trim();
  if (element.matches('[role="group"] > a')) {
    const group = element.parentElement?.getAttribute("aria-label");
    const state = element.getAttribute("aria-current") === "page" ? "this page" : "the other page";
    return `a: ${group}, ${state}`;
  }
  const role = element.getAttribute("role");
  // A list's text is its options'; the kit's names it after its trigger, shadcn's doesn't.
  if (element.matches(list)) return "listbox";
  if (element.matches('[role="listbox"] [role="group"]')) return "group of options";
  if (element.matches(tip)) return `tooltip: ${text}`;
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
  const elements = roots.flatMap((root) => [
    root,
    ...[...root.querySelectorAll("*")].filter(
      (element) => element.matches(controls) || ownText(element) !== "",
    ),
  ]);
  for (const element of new Set(elements)) {
    if (element.parentElement?.closest(views) != null) continue;
    // The Solid demo's agent panel, which the React demo hasn't.
    if (element.closest('[data-slot="agent-panel"]') !== null) continue;
    if (element.matches('[data-slot="select-content"] > [role="listbox"]')) continue;
    // The kit keeps closed tooltips in the page, hidden; Base UI renders them once they open.
    if (!element.checkVisibility()) continue;
    const values = read(win(), element);
    if (element.matches(popup)) for (const property of placement) delete values[property];
    // shadcn's select sets its type on each option, the kit's on the popup. The options' type is
    // compared; the list's own holds no text.
    if (element.matches(`${list}, [role="listbox"] [role="group"]`)) {
      delete values["font-size"];
      delete values["line-height"];
    }
    // The kit aligns a select's value to the start, shadcn to the left: the same on this page.
    if (values["text-align"] === "start") values["text-align"] = "left";
    // Form inputs hidden for screen readers' sake differ in kind between Base UI and ui-sdk.
    if (values.box === "hidden" && element.matches("input, textarea")) continue;
    const text = element.matches(controls) ? "" : ownText(element);
    if (text !== "" && element.childElementCount > 0) {
      for (const property of Object.keys(values)) {
        if (!typography.test(property)) delete values[property];
      }
    }
    const base = text === "" ? nameOf(element) : `text: ${text.slice(0, 40)}`;
    let name = base;
    for (let index = 2; rows.has(name); index += 1) name = `${base} #${index}`;
    if (/^a: \w+, (?:this|the other) page/u.test(name)) {
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
  other: Map<string, Record<string, string>>,
  page: string,
) {
  const lines: string[] = [];
  for (const [name, values] of tailwind) {
    const theirs = other.get(name);
    if (theirs === undefined) {
      lines.push(`only in Tailwind: ${name}`);
      continue;
    }
    for (const [property, value] of Object.entries(values)) {
      if (theirs[property] !== value) {
        lines.push(`${name}: ${property} is ${value} in Tailwind, ${theirs[property]} in ${page}`);
      }
    }
  }
  for (const name of other.keys()) {
    if (!tailwind.has(name)) lines.push(`only in ${page}: ${name}`);
  }
  return lines;
}

interface Scenario {
  readonly name: string;
  readonly size: Size;
  /** What the comparison reads, once `act` has run. */
  readonly scope: string;
  readonly act?: () => Promise<void>;
  /** `act` leaves the mouse button down, for the comparison to read before it comes up. */
  readonly held?: boolean;
  /** Differences the page can't fix, because they're the kit's: each is reported on the PR. */
  readonly known?: (line: string) => boolean;
  /** The pages it compares with Tailwind's; StyleX's and Solid's by default. */
  readonly pages?: readonly Exclude<Page, "tailwind">[];
}

/**
 * What the Solid demo can't match. It has no UI switch, as StyleX is a React page's, so the top
 * bar's controls after it sit further right: a box may move sideways, and must keep its size and
 * its top.
 */
function notInSolid(line: string) {
  if (/^only in Tailwind: (?:group: UI|a: UI, )/u.test(line)) return true;
  const box =
    /^.+: box is [\d.]+ ([\d.]+) ([\d.]+) ([\d.]+) in Tailwind, [\d.]+ ([\d.]+) ([\d.]+) ([\d.]+) in Solid$/u.exec(
      line,
    );
  if (box === null) return false;
  const [, top, width, height, solidTop, solidWidth, solidHeight] = box;
  return top === solidTop && width === solidWidth && height === solidHeight;
}

/**
 * A select that puts the chosen option over its trigger. ui-sdk lines the list up with the
 * trigger's edge, and Base UI 1px further in, with the text inside the trigger's border.
 */
const alignedList = (line: string) =>
  /: box is \d+ (\d+ \d+ \d+) in Tailwind, \d+ \1 in (?:StyleX|Solid)$/u.test(line);

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
  {
    act: () => pressAndHold(find("header [role=combobox]")),
    held: true,
    name: "view switcher",
    scope: '[role="listbox"]',
    size: "desktop",
  },
  {
    act: async () => {
      await press(find("aside button", "Create"));
      await until(() => expect(win().document.querySelector(popup)).not.toBeNull());
      await settle();
      const label = find('[role="dialog"] label', "Calendar");
      await pressAndHold(win().document.getElementById(label.getAttribute("for")!)!);
    },
    held: true,
    known: alignedList,
    name: "event dialog, calendar select",
    scope: list,
    size: "desktop",
  },
  {
    act: () => hover(find("header button", "Keyboard shortcuts")),
    name: "tooltip",
    scope: tip,
    size: "desktop",
  },
  {
    act: () => focusByKeyboard(find("aside label", "Work").querySelector("[role=checkbox]")!),
    name: "keyboard focus",
    scope: "aside",
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

describe("the demo's StyleX page and the Solid demo look like its Tailwind page", () => {
  describe.each(themes)("%s theme", (theme) => {
    test.each(scenarios)(
      "$size, $name",
      async ({
        act,
        held = false,
        known = () => false,
        pages: others = ["stylex", "solid"],
        scope,
        size,
      }) => {
        const read: Partial<Record<Page, Map<string, Record<string, string>>>> = {};
        for (const page of ["tailwind", ...others] as const) {
          await open(page, theme, size);
          try {
            if (act !== undefined) {
              await act();
              await until(() => expect(shown(scope)).toBe(true));
              await settle();
            }
            read[page] = probe(scope);
          } finally {
            if (held) await commands.mouse({ type: "up" });
          }
        }
        frame().remove();

        expect(read.tailwind!.size).toBeGreaterThan(0);
        const lines = others.flatMap((page) =>
          differences(read.tailwind!, read[page]!, pageNames[page]).filter(
            (line) => !known(line) && !(page === "solid" && notInSolid(line)),
          ),
        );
        expect(lines).toEqual([]);
      },
      90_000,
    );
  });
});
