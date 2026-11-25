import { describe, expect, test } from "vite-plus/test";
import { commands, userEvent } from "vite-plus/test/browser";

import type { MouseStep } from "../mouse";
import { drawn, label, painted, read } from "./parity/read";
import { parityViews, type ParityPage } from "./parity/screen";
import { until } from "./render";

/**
 * The StyleX items look the same as the Tailwind ones. Each test opens the same screen in both
 * flavours, each in a frame with its own global CSS, puts it in the same state with real input,
 * and compares every element's computed styles, its box and its `::before` and `::after`, and
 * the motion of what opens or closes. A change to one flavour that the other doesn't make fails
 * here.
 */

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    animationRate: (rate: number) => Promise<void>;
    mouse: (step: MouseStep) => Promise<void>;
  }
}

const flavours = ["tailwind", "stylex"] as const;
type Flavour = (typeof flavours)[number];
const themes = ["light", "dark"] as const;

/** The frame's size, inside the viewport, and a point outside it where the mouse hovers nothing. */
const frameSize = { height: 760, width: 1200 };
const away = { x: 1260, y: 790 };

interface Snapshot {
  readonly path: string;
  readonly label: string;
  readonly values: Readonly<Record<string, string>>;
}

function snapshot(win: Window): Snapshot[] {
  const rows: Snapshot[] = [];
  const visit = (element: Element, path: string) => {
    rows.push({ label: label(element), path, values: read(win, element) });
    [...element.children]
      .filter(({ tagName }) => tagName !== "SCRIPT" && tagName !== "STYLE")
      .forEach((child, index) => visit(child, `${path}/${index}`));
  };
  visit(win.document.getElementById("root")!, "");
  return rows;
}

/**
 * Where the flavours differ on purpose, because StyleX can't say what Tailwind does. Tailwind's
 * event chip brightens to 110% on hover in dark, and `dark:` is a class there; StyleX's dark comes
 * from `color-scheme` through `light-dark()`, which takes only colours, so its chip dims to 97% in
 * both schemes.
 */
const exceptions: readonly { readonly theme: string; readonly line: RegExp }[] = [
  {
    line: /^div > button\[calendar-event\] .*: filter is brightness\(1\.1\) in Tailwind, brightness\(0\.97\) in StyleX$/u,
    theme: "dark",
  },
  {
    line: /^Tailwind only: div > button\[calendar-event\] .*: transition of filter, .*: brightness\(1\) → brightness\(1\.08\)$/u,
    theme: "dark",
  },
  {
    line: /^StyleX only: div > button\[calendar-event\] .*: transition of filter, .*: brightness\(1\) → brightness\(0\.98\)$/u,
    theme: "dark",
  },
];

/** The lines left once the exceptions for the theme are taken out. */
const unexpected = (theme: string, lines: readonly string[]) =>
  lines.filter(
    (line) =>
      !exceptions.some((exception) => exception.theme === theme && exception.line.test(line)),
  );

/** The differences between the flavours' snapshots, each once with how often it came up. */
function differences(
  theme: string,
  tailwind: readonly Snapshot[],
  stylex: readonly Snapshot[],
): string[] {
  const counted = new Map<string, number>();
  const add = (line: string) => counted.set(line, (counted.get(line) ?? 0) + 1);
  const byPath = new Map(stylex.map((row) => [row.path, row]));
  for (const row of tailwind) {
    const other = byPath.get(row.path);
    if (other === undefined) {
      add(`only in Tailwind: ${row.label}`);
      continue;
    }
    byPath.delete(row.path);
    if (other.label !== row.label) {
      add(`${row.label} in Tailwind is ${other.label} in StyleX`);
      continue;
    }
    for (const [property, value] of Object.entries(row.values)) {
      if (other.values[property] !== value) {
        add(
          `${row.label}: ${property} is ${value} in Tailwind, ${other.values[property]} in StyleX`,
        );
      }
    }
  }
  for (const row of byPath.values()) add(`only in StyleX: ${row.label}`);
  return unexpected(
    theme,
    [...counted].map(([line, count]) => (count === 1 ? line : `${line} (×${count})`)),
  );
}

interface Motion {
  readonly target: string;
  readonly timing: string;
  /** The target's look at the start and halfway. */
  readonly frames: readonly string[];
}

/** The animations and transitions running now, each sampled at its start and halfway. */
function motion(win: Window): Motion[] {
  const ignored = new Set(["composite", "computedOffset", "easing", "offset"]);
  return win.document
    .getAnimations()
    .filter((animation) => animation.effect?.getComputedTiming().endTime !== Infinity)
    .map((animation) => {
      const effect = animation.effect as KeyframeEffect;
      const target = effect.target!;
      const timing = effect.getComputedTiming();
      const name =
        "transitionProperty" in animation
          ? `transition of ${(animation as CSSTransition).transitionProperty}`
          : "animation";
      // What this animation moves, and nothing another one moves at the same time.
      const sampled =
        "transitionProperty" in animation
          ? [(animation as CSSTransition).transitionProperty]
          : [...new Set(effect.getKeyframes().flatMap((keyframe) => Object.keys(keyframe)))]
              .filter((key) => !ignored.has(key))
              .map((key) => key.replaceAll(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`));
      animation.pause();
      const frames = [0, Number(timing.duration) / 2].map((time) => {
        animation.currentTime = time;
        const style = win.getComputedStyle(target);
        return sampled
          .map((property) => drawn(property, painted(style.getPropertyValue(property))))
          .join(" | ")
          .replaceAll(/-?\d+\.\d+/gu, (number) => String(Math.round(Number(number) * 100) / 100));
      });
      animation.finish();
      return {
        frames,
        target: label(target),
        // A transition that reverses midway runs for as long as it had run, so to about 10 ms.
        timing: `${name}, ${Math.round(Number(timing.duration) / 10) * 10} ms, ${timing.delay} ms delay, ${String(effect.getTiming().easing)}`,
      };
    })
    .toSorted((left, right) => left.target.localeCompare(right.target));
}

const frame = () => document.querySelector<HTMLIFrameElement>("iframe[data-parity]")!;
const win = () => frame().contentWindow!;
const nextFrames = async (count = 2) => {
  for (let index = 0; index < count; index += 1) {
    await new Promise((resolve) => win().requestAnimationFrame(resolve));
  }
};

/**
 * Waits for what the last step starts: a popup drops its starting style a frame after it opens,
 * and hover applies at a frame. Slowed down, a transition is still at its start a few frames on.
 */
async function started() {
  await until(() => expect(win().document.querySelector("[data-starting-style]")).toBeNull());
  await nextFrames(4);
}

/** Ends what's running, and what that starts in turn, so a popup is shown in full. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await nextFrames();
    for (const animation of win().document.getAnimations()) {
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    }
  }
  await nextFrames();
}

async function open(flavour: Flavour, page: Partial<ParityPage>) {
  await commands.mouse({ type: "move", ...away });
  frame()?.remove();
  const element = document.createElement("iframe");
  element.dataset.parity = flavour;
  const search = new URLSearchParams(page as Record<string, string>);
  element.src = `${new URL(`./parity/${flavour}.html`, import.meta.url).href}?${search}`;
  element.style.cssText = `position: fixed; inset: 0 auto auto 0; z-index: 2147483646; border: 0; width: ${frameSize.width}px; height: ${frameSize.height}px`;
  document.body.append(element);
  await until(() => expect(element.contentWindow?.parityReady).toBe(true));
  await settle();
}

function find(selector: string, text?: RegExp) {
  const found = [...win().document.querySelectorAll<HTMLElement>(selector)].find(
    (element) => text === undefined || text.test(element.textContent ?? ""),
  );
  if (found === undefined) throw new Error(`No ${selector} ${text ?? ""} in the frame`);
  return found;
}

/** A timed event in view, under nothing, whose title doesn't fit it. */
function clippedEvent() {
  const { document } = win();
  const found = [...document.querySelectorAll<HTMLElement>('[data-slot="calendar-event-title"]')]
    .filter(
      (title) =>
        title.scrollWidth > title.clientWidth + 1 || title.scrollHeight > title.clientHeight + 1,
    )
    .map((title) => title.closest<HTMLElement>('[data-slot="calendar-event"]'))
    .find((event) => {
      const box = event?.getBoundingClientRect();
      if (box === undefined) return false;
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return top !== null && event!.contains(top);
    });
  if (found == null) throw new Error("No event in view has a clipped title");
  return found;
}

/**
 * Moves the browser's own mouse to the middle of an element in the frame, in one step, so it
 * rests on nothing on the way: a tooltip that follows another opens at once.
 */
async function hover(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  await commands.mouse({
    type: "move",
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  });
}

async function press(element: HTMLElement) {
  await hover(element);
  await commands.mouse({ type: "down" });
  await commands.mouse({ type: "up" });
}

/** A state to compare, reached with real input from a fresh page. */
interface Scenario {
  readonly name: string;
  readonly page: Partial<ParityPage>;
  /** Puts the page in the state; what it opens is sampled as it moves. */
  readonly act?: () => Promise<unknown>;
  /** The popup `act` opens, waited for before its motion is sampled. */
  readonly shows?: string;
  /** Moves the page on again, as a close, whose motion is sampled too. */
  readonly next?: () => Promise<unknown>;
}

const scenarios: Scenario[] = [
  ...parityViews.map((view) => ({ name: `${view} view`, page: { view } })),
  { name: "week view, right to left", page: { dir: "rtl" as const, view: "week" as const } },
  {
    act: () => hover(find('[aria-label="Next period"]')),
    name: "toolbar tooltip",
    page: { view: "week" },
    shows: '[data-slot="tooltip-content"]',
  },
  {
    act: () => press(find('[aria-label="View"]')),
    name: "view select, open",
    page: { view: "week" },
    shows: '[data-slot="select-content"]',
    next: () => userEvent.keyboard("{Escape}"),
  },
  {
    act: () => press(find("button", /more/u)),
    name: "month's more events popover",
    page: { view: "month" },
    shows: '[data-slot="popover-content"]',
    next: () => userEvent.keyboard("{Escape}"),
  },
  {
    // Only an event whose title is cut short shows it in a tooltip.
    act: () => hover(clippedEvent()),
    name: "week event tooltip",
    page: { view: "week" },
    shows: '[data-slot="tooltip-content"]',
  },
  { name: "controls", page: { page: "controls" } },
  ...(["default", "outline", "secondary", "ghost", "destructive", "link"] as const).map(
    (variant) => ({
      act: () => hover(find(`[aria-label="${variant} default"]`)),
      name: `${variant} button, hovered`,
      page: { page: "controls" as const },
    }),
  ),
  {
    act: async () => {
      win().focus();
      await userEvent.keyboard("{Tab}");
    },
    name: "button with keyboard focus",
    page: { page: "controls" },
  },
  {
    act: () => hover(find("button", /^Tooltip$/u)),
    name: "tooltip",
    page: { page: "controls" },
    shows: '[data-slot="tooltip-content"]',
  },
  {
    act: () => press(find('[aria-label="View"]')),
    name: "select, open",
    page: { page: "controls" },
    shows: '[data-slot="select-content"]',
    next: () => userEvent.keyboard("{ArrowDown}"),
  },
  {
    act: () => press(find("button", /^Popover$/u)),
    name: "popover",
    page: { page: "controls" },
    shows: '[data-slot="popover-content"]',
    next: () => userEvent.keyboard("{Escape}"),
  },
  {
    act: () => press(find("button", /^Dialog$/u)),
    name: "dialog",
    page: { page: "controls" },
    shows: '[data-slot="dialog-content"]',
    next: () => userEvent.keyboard("{Escape}"),
  },
];

interface Result {
  readonly opening: Motion[];
  readonly shown: Snapshot[];
  readonly closing: Motion[];
  readonly after: Snapshot[];
}

async function run(flavour: Flavour, scenario: Scenario, theme: string): Promise<Result> {
  await open(flavour, { ...scenario.page, theme: theme as ParityPage["theme"] });
  // A 100 ms transition runs for 5 s, so it's still running when the popup is found.
  await commands.animationRate(0.02);
  try {
    return await sampled(scenario);
  } finally {
    await commands.animationRate(1);
  }
}

async function sampled(scenario: Scenario): Promise<Result> {
  await scenario.act?.();
  const { shows } = scenario;
  if (shows !== undefined) {
    await until(() => expect(win().document.querySelector(`${shows}[data-open]`)).not.toBeNull());
  }
  await started();
  const opening = motion(win());
  await settle();
  const shown = snapshot(win());
  if (scenario.next === undefined) return { after: [], closing: [], opening, shown };
  const closing = await closingMotion(scenario.next);
  await settle();
  return { after: snapshot(win()), closing, opening, shown };
}

/**
 * The motion `next` starts. ui-sdk unmounts a closing popup on a real-time clock as well as when
 * its exit ends, about 140 ms in, which the slowed exit outlasts, so a close is sampled in the
 * task that starts it, when the popup takes `data-ending-style`.
 */
async function closingMotion(next: () => Promise<unknown>): Promise<Motion[]> {
  const frameWindow = win();
  let closing: Motion[] | undefined;
  // The frame shares this page's event loop, so the callback runs before the task ends.
  const observer = new MutationObserver((records) => {
    if (records.some(({ target }) => (target as Element).hasAttribute("data-ending-style"))) {
      closing ??= motion(frameWindow);
    }
  });
  observer.observe(frameWindow.document, {
    attributeFilter: ["data-ending-style"],
    attributes: true,
    subtree: true,
  });
  try {
    await next();
    if (closing !== undefined) return closing;
    await started();
    return closing ?? motion(frameWindow);
  } finally {
    observer.disconnect();
  }
}

function motionDifferences(theme: string, tailwind: readonly Motion[], stylex: readonly Motion[]) {
  const lines = (motions: readonly Motion[]) =>
    motions.map(({ frames, target, timing }) => `${target}: ${timing}: ${frames.join(" → ")}`);
  const theirs = new Set(lines(stylex));
  const ours = new Set(lines(tailwind));
  return unexpected(theme, [
    ...[...ours].filter((line) => !theirs.has(line)).map((line) => `Tailwind only: ${line}`),
    ...[...theirs].filter((line) => !ours.has(line)).map((line) => `StyleX only: ${line}`),
  ]);
}

describe.each(themes)("%s theme", (theme) => {
  test.each(scenarios.map((scenario) => [scenario.name, scenario] as const))(
    "%s looks the same in both flavours",
    async (_, scenario) => {
      const tailwind = await run("tailwind", scenario, theme);
      const stylex = await run("stylex", scenario, theme);
      frame().remove();
      // The states compared, so a scenario that reached nothing fails instead of passing.
      expect(tailwind.shown.length).toBeGreaterThan(1);

      expect({
        after: differences(theme, tailwind.after, stylex.after),
        closing: motionDifferences(theme, tailwind.closing, stylex.closing),
        opening: motionDifferences(theme, tailwind.opening, stylex.opening),
        shown: differences(theme, tailwind.shown, stylex.shown),
      }).toEqual({ after: [], closing: [], opening: [], shown: [] });
    },
  );
});
