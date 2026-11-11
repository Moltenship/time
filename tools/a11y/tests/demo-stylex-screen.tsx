import { describe, expect, test } from "vite-plus/test";

import "../../../apps/demo/src/stylex/styles.css";
import { StylexApp } from "../../../apps/demo/src/stylex/app";
import { seriousViolations, setTheme, type Theme } from "./axe";
import { click, render, until } from "./render";

const views = ["week", "day", "month", "year", "agenda", "resources", "timeline-week"] as const;

/** Opens the page the way a link does: the view comes from the URL, the events from the seed. */
export async function renderDemo(view: (typeof views)[number], { scrolling = false } = {}) {
  localStorage.clear();
  // Scrolling day, week, and month, as the settings switch turns them on.
  if (scrolling) localStorage.setItem("moltenship-demo:settings", JSON.stringify({ scrolling }));
  history.replaceState(null, "", `?view=${view}`);
  await render(<StylexApp />);
}

const main = () => document.querySelector<HTMLElement>('[role="main"]');
export const events = () => [...(main()?.querySelectorAll<HTMLElement>("[data-event-id]") ?? [])];

export function button(name: string, within: ParentNode = document) {
  return [...within.querySelectorAll<HTMLElement>("button")].find(
    (candidate) =>
      candidate.getAttribute("aria-label") === name || candidate.textContent?.trim() === name,
  );
}

/**
 * The page's axe checks in one theme. Each theme has a test file of its own, so the two run side
 * by side instead of one after the other.
 */
export function describeStylexDemo(theme: Theme) {
  describe(`StyleX demo, ${theme} theme`, () => {
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
        expect(
          document.querySelector('[aria-label="Notifications"] [role="dialog"]'),
        ).not.toBeNull();
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
}
