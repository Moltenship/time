import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import "../../../apps/demo/src/stylex/styles.css";
import { demoViewNames } from "../../../apps/demo/src/demo-model";
import { StylexApp } from "../../../apps/demo/src/stylex/app";
import { StylexDemoCalendar } from "../../../apps/demo/src/stylex/calendar";
import { seriousViolations, setTheme, themes } from "./axe";
import { click, render, until } from "./render";

const views = ["week", "day", "month", "year", "agenda", "resources", "timeline-week"] as const;

/** Opens the page the way a link does: the view comes from the URL, the events from the seed. */
async function renderDemo(view: (typeof views)[number], { scrolling = false } = {}) {
  localStorage.clear();
  // Scrolling day, week, and month, as the settings switch turns them on.
  if (scrolling) localStorage.setItem("moltenship-demo:settings", JSON.stringify({ scrolling }));
  history.replaceState(null, "", `?view=${view}`);
  await render(<StylexApp />);
}

const main = () => document.querySelector<HTMLElement>('[role="main"]');
const events = () => [...(main()?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [])];

function button(name: string, within: ParentNode = document) {
  return [...within.querySelectorAll<HTMLElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
  );
}

describe.each(themes)("StyleX demo, %s theme", (theme) => {
  test.each(views)("%s view", async (view) => {
    setTheme(theme);
    await renderDemo(view);

    expect(await seriousViolations()).toEqual([]);
  });

  test.each(["week", "day", "month"] as const)("scrolling %s view", async (view) => {
    setTheme(theme);
    await renderDemo(view, { scrolling: true });

    expect(document.querySelector('[data-slot^="scrolling-"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("event popover", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(events()[0]);

    const popover = document.querySelector<HTMLElement>('[role="dialog"]');
    expect(popover).not.toBeNull();
    expect(button("Close", popover ?? document)).toBeDefined();
    expect(await seriousViolations()).toEqual([]);
  });

  test("event editor dialog", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(button("Create", document.querySelector("aside") ?? document));

    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });

  test("undo toast", async () => {
    setTheme(theme);
    await renderDemo("week");
    // A stored event: the meetings in progress as the demo opens are read-only.
    await click(
      main()?.querySelector<HTMLElement>(
        '[data-event-id]:not([data-event-id^="busy-now-"]):not([data-event-id*="::"])',
      ),
    );
    await click(button("Delete event"));
    // The demo saves after a delay; the toast offers to undo once the delete is saved.
    await until(() => {
      expect(document.querySelector('[aria-label="Notifications"] [role="dialog"]')).not.toBeNull();
    });
    expect(await seriousViolations()).toEqual([]);
  });

  test("shortcuts dialog", async () => {
    setTheme(theme);
    await renderDemo("week");
    await click(button("Keyboard shortcuts"));

    expect(document.querySelector("dialog[open]")).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });
});

describe("StyleX demo", () => {
  test("styles apply: StyleX's, Astryx's and the calendar's tokens, in both themes", async () => {
    for (const theme of themes) {
      setTheme(theme);
      await renderDemo("week");

      const event = events()[0];
      if (event === undefined) throw new Error("no-event");
      expect(getComputedStyle(event).position).toBe("absolute");
      expect(getComputedStyle(event).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      const create = button("Create", document.querySelector("aside") ?? document);
      expect(create && getComputedStyle(create).cursor).toBe("pointer");
      expect(document.documentElement.dataset.theme).toBe(theme);
      expect(getComputedStyle(document.documentElement).colorScheme).toBe(theme);
    }
  });

  test("has the views the URL takes", () => {
    expect(StylexDemoCalendar.views.map(({ name }) => name).toSorted()).toEqual(
      [...demoViewNames].toSorted(),
    );
  });

  test.each(["week", "month"] as const)("the %s view renders events", async (view) => {
    setTheme("light");
    await renderDemo(view);

    expect(events().length).toBeGreaterThan(0);
  });

  test("creates an event through the dialog", async () => {
    setTheme("light");
    await renderDemo("week");
    await click(button("Create", document.querySelector("aside") ?? document));

    const dialog = document.querySelector<HTMLElement>("dialog[open]");
    const title = dialog?.querySelector<HTMLInputElement>('input[placeholder="Add title"]');
    if (title == null) throw new Error("no-title-field");
    await userEvent.fill(title, "Planning poker");
    await click(button("Save", dialog ?? document));

    await until(() => {
      expect(document.querySelector("dialog[open]")).toBeNull();
      expect(events().some((event) => event.textContent?.includes("Planning poker"))).toBe(true);
    });
  });

  test("the view switcher changes the view", async () => {
    setTheme("light");
    await renderDemo("week");

    const switcher = document.querySelector<HTMLElement>('[role="banner"] [role="combobox"]');
    await click(switcher);
    let month: HTMLElement | undefined;
    await until(() => {
      month = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
        option.textContent?.startsWith("Month"),
      );
      expect(month).toBeDefined();
    });
    await click(month);

    await until(() => {
      expect(document.querySelector('[data-slot="month-view"]')).not.toBeNull();
      expect(new URLSearchParams(location.search).get("view")).toBe("month");
    });
  });
});
