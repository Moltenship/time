import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vite-plus/test";
import { cdp, commands, page, server, userEvent } from "vite-plus/test/browser";

import { App } from "../../../../apps/demo-solid/src/app";
import type { MouseStep } from "../../mouse";
import { seriousViolations, setTheme, themes } from "../axe";
import { nextFrame } from "../waits";
import { render, settled, tab, until } from "./render";

// The React demo's checks (demo.a11y.tsx and demo-tasks.a11y.tsx) on the Solid demo,
// apps/demo-solid: axe over each view and with each popup open, in both themes, then the keyboard
// through the chrome, a task dragged in by mouse and by keys, and the sidebar's sheet on a phone.

/** The paged views the Solid demo registers. */
const views = [
  "week",
  "day",
  "3-day",
  "month",
  "year",
  "agenda",
  "resources",
  "timeline-week",
] as const;

/** Opens the demo the way a link does: the view comes from the URL, the events from the seed. */
async function renderDemo(view: string, { scrolling = false } = {}) {
  localStorage.clear();
  if (scrolling) localStorage.setItem("moltenship-demo:settings", JSON.stringify({ scrolling }));
  history.replaceState(null, "", `?view=${view}`);
  await render(() => <App />);
  await until(() => expect(document.querySelector("main [data-slot]")).not.toBeNull());
  await settle();
}

/** Ends what's running, and what that starts in turn, so a popup is checked open, not fading in. */
async function settle() {
  await until(() => expect(document.querySelector("[data-starting-style]")).toBeNull());
  for (let round = 0; round < 3; round += 1) {
    await settled();
    await nextFrame();
    for (const animation of document.getAnimations()) {
      if (animation.effect?.getComputedTiming().endTime !== Infinity) animation.finish();
    }
  }
  await settled();
}

const find = (selector: string, name: string) =>
  [...document.querySelectorAll<HTMLElement>(selector)].find(
    (element) =>
      element.getAttribute("aria-label") === name || element.textContent?.trim() === name,
  );

async function click(element: HTMLElement | null | undefined) {
  if (element == null) throw new Error("nothing to click");
  await userEvent.click(element);
  await settle();
}

const createButton = () => find("aside button", "Create");
const focusedName = () =>
  document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent;
/** A stored event: the meetings in progress as the demo opens are read-only. */
const storedEvent = () =>
  document.querySelector<HTMLElement>(
    'main [data-event-id]:not([data-event-id^="busy-now-"]):not([data-event-id*="::"])',
  );

describe.each(themes)("the Solid demo, %s theme", (theme) => {
  test.each(views)("%s view", async (view) => {
    setTheme(theme);
    await renderDemo(view);

    expect(document.querySelector("main [data-slot]")).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test.each(["week", "day", "3-day", "month", "agenda"] as const)(
    "scrolling %s view",
    async (view) => {
      setTheme(theme);
      await renderDemo(view, { scrolling: true });

      // The setting picks each view's scrolling version; all but the agenda mark their parts.
      if (view !== "agenda") {
        expect(document.querySelector('[data-slot^="scrolling-"]')).not.toBeNull();
      }
      expect(await seriousViolations()).toEqual([]);
    },
  );

  test("resources view's status badges", async () => {
    setTheme(theme);
    await renderDemo("resources");

    // Meetings in progress as the demo opens make someone busy.
    expect(
      document.querySelector('[data-slot="resource-status"][data-state="busy"]'),
    ).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("event popover", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(document.querySelector<HTMLElement>("main [data-event-id]"));

    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("event editor dialog, with the calendar's list open", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(createButton());

    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);

    await click(
      document.querySelector<HTMLElement>('[data-slot="dialog-content"] [role="combobox"]'),
    );
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("event editor dialog, editing an event, with Repeat's list open", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(storedEvent());
    await click(find('[role="dialog"] button', "Edit event"));
    await click(find('[data-slot="dialog-content"] [role="combobox"]', "Does not repeat"));

    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("keyboard shortcuts dialog", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(find("header button", "Keyboard shortcuts"));

    expect(find('[role="dialog"] h2', "Keyboard shortcuts")).toBeDefined();
    expect(await seriousViolations()).toEqual([]);
  });

  test("view switcher's list", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(document.querySelector<HTMLElement>('header [role="combobox"]'));

    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("undo toast", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(storedEvent());
    await click(find('[role="dialog"] button', "Delete event"));
    // The demo saves after a delay; the toast offers to undo once the delete is saved.
    await until(() =>
      expect(
        document.querySelector('[aria-label="Notifications"] [data-slot="toast"]'),
      ).not.toBeNull(),
    );
    await settle();

    expect(await seriousViolations()).toEqual([]);
    // At the bottom centre of the window, as the React demo's.
    const region = document.querySelector('[aria-label="Notifications"]')!.getBoundingClientRect();
    expect(Math.abs(region.left + region.width / 2 - innerWidth / 2)).toBeLessThan(1);
  });
});

describe("the Solid demo from the keyboard", () => {
  test("Create opens the editor on its title, and Escape gives focus back", async () => {
    await renderDemo("week");
    createButton()!.focus();
    await userEvent.keyboard("{Enter}");
    await until(() => expect(focusedName()).toBe("Title"));

    await userEvent.keyboard("{Escape}");
    await until(() => expect(document.activeElement).toBe(createButton()));
  });

  test("c opens the editor and ? the shortcuts, outside text fields", async () => {
    await renderDemo("week");
    document.body.focus();
    await userEvent.keyboard("c");
    await until(() => expect(focusedName()).toBe("Title"));
    // Typed into the title, not taken as a shortcut.
    await userEvent.keyboard("?");
    expect((document.activeElement as HTMLInputElement).value).toBe("?");
    await userEvent.keyboard("{Escape}");
    await until(() => expect(document.querySelector('[role="dialog"]')).toBeNull());

    document.body.focus();
    await userEvent.keyboard("?");
    await until(() => expect(find('[role="dialog"] h2', "Keyboard shortcuts")).toBeDefined());
  });

  test("an event's popover takes focus, and Escape gives it back to the event", async () => {
    await renderDemo("week");
    const event = storedEvent()!;
    event.focus();
    await userEvent.keyboard("{Enter}");
    await until(() => expect(focusedName()).toBe("Edit event"));

    await userEvent.keyboard("{Escape}");
    await until(() => expect(document.activeElement).toBe(event));
  });

  test("Tab goes through the top bar's controls in order", async () => {
    await renderDemo("week");
    document.body.focus();
    const reached: string[] = [];
    for (let step = 0; step < 12; step += 1) {
      await userEvent.keyboard(tab);
      if (document.activeElement?.closest("header") === null) break;
      reached.push(focusedName() ?? "");
    }

    expect(reached).toEqual([
      "Today",
      "Previous period",
      "Next period",
      "View",
      "React",
      "Solid",
      "Keyboard shortcuts",
      "Docs",
      expect.stringMatching(/^Switch to (?:dark|light) theme$/u),
    ]);
  });

  test("a task picked up with Space drops onto the week as an event", async () => {
    await renderDemo("week");
    const card = taskCard("Call the dentist")!;
    card.focus();
    // The card sticks out below the sidebar, and WebKit scrolls a focused element into view on a
    // later frame, not in `focus()`: picked up before that, the drag starts below the hours.
    await until(() => expect(inView(card)).toBe(true));
    await userEvent.keyboard(" ");
    // From the sidebar, rightwards into the week's columns.
    await userEvent.keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}{ArrowRight}{/Shift}");
    await until(() => expect(document.querySelector("[data-calendar-ghost]")).not.toBeNull());
    await userEvent.keyboard(" ");

    await until(() => expect(eventOf("task-dentist")).not.toBeNull());
    await until(() => expect(taskCard("Call the dentist")).toBeNull());
  });
});

/** The browser's own mouse, at a point in this page. */
const mouse = (step: MouseStep) =>
  (commands as unknown as { mouse(step: MouseStep): Promise<void> }).mouse(step);

type Point = { readonly x: number; readonly y: number };

const center = (element: Element): Point => {
  const box = element.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
};

/** Whether a drop preview on the week is under `point`, where the drop will land. */
const previewAt = ({ x, y }: Point) =>
  [...document.querySelectorAll("[data-calendar-ghost]")].some((ghost) => {
    const box = ghost.getBoundingClientRect();
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
  });

/**
 * Presses at `from`, moves past the drag's threshold, then on to `to`, and lets go: onto the week
 * once its preview is under the pointer, where the drop lands. Two frames after the last move
 * were enough on an idle machine; on a busy one the task landed where the pointer had been two
 * steps before.
 */
async function drag(from: Point, to: Point, { onWeek }: { readonly onWeek: boolean }) {
  await mouse({ type: "move", x: from.x, y: from.y });
  await mouse({ type: "down" });
  await mouse({ steps: 4, type: "move", x: from.x + 12, y: from.y + 6 });
  await mouse({ steps: 16, type: "move", x: to.x, y: to.y });
  if (onWeek) {
    await until(() => expect(previewAt(to)).toBe(true));
  } else {
    await nextFrame();
    await nextFrame();
  }
  await mouse({ type: "up" });
  await settled();
}

const taskCard = (title: string) =>
  [...document.querySelectorAll<HTMLElement>("aside li > button:first-child")].find((card) =>
    card.textContent?.startsWith(title),
  ) ?? null;
const taskList = () => document.querySelector<HTMLElement>("aside ul[aria-describedby]")!;
/** Whether `element` shows within the sidebar, which scrolls by whole pixels, so to within one. */
const inView = (element: Element) => {
  const box = element.getBoundingClientRect();
  const aside = element.closest("aside")!.getBoundingClientRect();
  return box.top > aside.top - 1 && box.bottom < aside.bottom + 1;
};
const eventOf = (id: string) =>
  document.querySelector<HTMLElement>(`[data-slot="time-grid-body"] [data-event-id="${id}"]`);

/** The tooltip's text, if one is shown: the kit keeps closed tooltips in the page, hidden. */
const shownTooltip = () =>
  [...document.querySelectorAll<HTMLElement>('[role="tooltip"]')]
    .find((tooltip) => tooltip.checkVisibility())
    ?.textContent?.trim() ?? null;

describe("the Solid demo's top bar", () => {
  // The theme button's name follows the theme, which a test before may have left dark.
  beforeEach(() => setTheme("light"));
  afterEach(async () => {
    await mouse({ type: "up" });
    setTheme("light");
  });

  // The button's own click handler once replaced the tooltip trigger's, so a press left the
  // tooltip open, over the dialog it opened. The React demo's press closes it.
  test.each([
    ["Keyboard shortcuts", "Keyboard shortcuts (?)"],
    ["Switch to dark theme", "Switch to dark theme"],
  ])("a press on %s closes the tooltip it shows", async (name, text) => {
    await renderDemo("week");
    const { x, y } = center(find("header button", name)!);
    await mouse({ type: "move", x, y });
    await until(() => expect(shownTooltip()).toBe(text));

    await mouse({ type: "down" });
    await mouse({ type: "up" });

    await until(() => expect(shownTooltip()).toBeNull());
  });

  // WebKit, like Safari, doesn't focus a button it clicks, so there the dialog once gave focus
  // back to the page. The sheet's test on a phone covers the menu button.
  test("Escape after a press on Keyboard shortcuts gives focus back to it", async () => {
    await renderDemo("week");
    const shortcuts = find("header button", "Keyboard shortcuts")!;
    await click(shortcuts);
    expect(find('[role="dialog"] h2', "Keyboard shortcuts")).toBeDefined();

    await userEvent.keyboard("{Escape}");
    await until(() => expect(document.activeElement).toBe(shortcuts));
  });
});

describe("the Solid demo's unscheduled tasks", () => {
  // A test that fails mid-drag leaves the button down, which the next test's press would inherit.
  afterEach(async () => {
    await mouse({ type: "up" });
  });

  test("a task dragged onto the week becomes an event, and dragged back, a task again", async () => {
    await renderDemo("week");
    const body = document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
    const column = () => body.querySelectorAll<HTMLElement>("[data-date]")[2]!;
    body.scrollTop = (column().offsetHeight * 8) / 24;
    await nextFrame();
    const box = column().getBoundingClientRect();

    await drag(
      center(taskCard("Call the dentist")!),
      {
        x: box.left + box.width / 2,
        y: box.top + (box.height * 11.1) / 24,
      },
      { onWeek: true },
    );

    // The demo saves after a delay; the task leaves the list once its event is saved.
    await until(() => expect(eventOf("task-dentist")).not.toBeNull());
    await until(() => expect(taskCard("Call the dentist")).toBeNull());
    expect(eventOf("task-dentist")!.getAttribute("aria-label")).toMatch(/11:00\s–\s11:30/);

    // Back to the list, mid-screen, scrolling the sidebar alone.
    const list = taskList();
    const aside = list.closest("aside")!;
    const shown = list.getBoundingClientRect();
    aside.scrollTop += shown.top + shown.height / 2 - innerHeight / 2;
    await nextFrame();
    await drag(center(eventOf("task-dentist")!), center(list), { onWeek: false });

    await until(() => expect(taskCard("Call the dentist")).not.toBeNull());
    await until(() => expect(eventOf("task-dentist")).toBeNull());
  });
});

/** Turns a point of the test's frame into one of the page CDP drives. */
function onPage({ x, y }: Point) {
  const frame = window.frameElement;
  if (frame === null) return { x, y };
  const box = frame.getBoundingClientRect();
  const scale = box.width / (frame as HTMLElement).offsetWidth;
  return { x: box.left + x * scale, y: box.top + y * scale };
}

/** A finger on the touch screen, through Chromium's own input pipeline. */
async function touch(type: "touchEnd" | "touchMove" | "touchStart", at?: Point) {
  await cdp().send("Input.dispatchTouchEvent", {
    touchPoints: at === undefined ? [] : [{ id: 1, ...onPage(at) }],
    type,
  });
}

async function slide(from: Point, to: Point, steps = 12) {
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    await touch("touchMove", { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    await nextFrame();
  }
}

// Real touches scroll the page and cancel the pointer as the browser takes them over, which
// synthetic events can't show. CDP drives them in Chromium only.
describe.runIf(server.browser === "chromium")("the Solid demo's tasks under a finger", () => {
  beforeAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  });
  afterAll(async () => {
    await cdp().send("Emulation.setTouchEmulationEnabled", { enabled: false });
  });

  test("a swipe over a task scrolls the sidebar and picks nothing up", async () => {
    await renderDemo("week");
    const aside = taskList().closest("aside")!;
    const start = aside.scrollTop;
    const from = center(taskCard("Call the dentist")!);
    // A drag the browser's scroll then cancels would leave nothing behind: watch for any.
    let pickedUp = false;
    const watch = new MutationObserver(() => {
      pickedUp ||= document.querySelector("[data-drag-image]") !== null;
    });
    watch.observe(document.body, { childList: true });

    await touch("touchStart", from);
    try {
      await slide(from, { x: from.x, y: from.y - 200 });
    } finally {
      await touch("touchEnd");
      watch.disconnect();
    }

    await until(() => expect(aside.scrollTop).toBeGreaterThan(start + 50));
    expect(pickedUp).toBe(false);
  });

  test("a long press picks a task up, and the finger drops it on the week", async () => {
    await renderDemo("week");
    const body = document.querySelector<HTMLElement>('[data-slot="time-grid-body"]')!;
    const column = body.querySelectorAll<HTMLElement>("[data-date]")[2]!;
    const from = center(taskCard("Call the dentist")!);

    await touch("touchStart", from);
    try {
      await until(() => expect(document.querySelector("[data-drag-image]")).not.toBeNull());
      await slide(from, center(column));
    } finally {
      await touch("touchEnd");
    }

    await until(() => expect(eventOf("task-dentist")).not.toBeNull());
    await until(() => expect(taskCard("Call the dentist")).toBeNull());
  });
});

describe("the Solid demo on a phone", () => {
  beforeAll(async () => {
    await page.viewport(390, 800);
  });
  afterAll(async () => {
    await page.viewport(1280, 800);
  });

  test.each(themes)("the sidebar's sheet, %s theme", async (theme) => {
    setTheme(theme);
    await renderDemo("week");
    const menu = find("header button", "Open sidebar")!;
    await click(menu);

    const sheet = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(find('[role="dialog"] a', "React")).toBeDefined();
    expect(find('[role="dialog"] button', "Create")).toBeDefined();
    expect(await seriousViolations()).toEqual([]);

    await userEvent.keyboard("{Escape}");
    await until(() => expect(document.activeElement).toBe(menu));
  });

  test("Create floats over the views, and a choice in the sheet closes it", async () => {
    await renderDemo("week");
    expect(find("main ~ button, button", "Create event")?.checkVisibility()).toBe(true);
    await click(find("header button", "Open sidebar"));
    await click(find('[role="dialog"] button', "Create"));

    await until(() => expect(focusedName()).toBe("Title"));
    expect(find('[role="dialog"] h2', "New event")).toBeDefined();
  });
});
