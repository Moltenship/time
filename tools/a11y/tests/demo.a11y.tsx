import { describe, expect, test } from "vite-plus/test";

import { App } from "../../../apps/demo/src/app";
import { seriousViolations, setTheme, themes } from "./axe";
import { click, render } from "./render";

const views = ["week", "day", "month", "agenda", "resources", "timeline-week"] as const;

/** Opens the demo the way a link does: the view comes from the URL, the events from the seed. */
async function renderDemo(view: (typeof views)[number], { scrolling = false } = {}) {
  localStorage.clear();
  // Scrolling day, week, and month, as the settings switch turns them on.
  if (scrolling) localStorage.setItem("moltenship-demo:settings", JSON.stringify({ scrolling }));
  history.replaceState(null, "", `?view=${view}`);
  await render(<App />);
}

describe.each(themes)("demo, %s theme", (theme) => {
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

  test.each(["resources", "timeline-week"] as const)("%s view's status badges", async (view) => {
    setTheme(theme);
    await renderDemo(view);

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

  test("event editor dialog", async () => {
    setTheme(theme);
    await renderDemo("week");
    const create = [...document.querySelectorAll<HTMLElement>("aside button")].find(
      (button) => button.textContent === "Create",
    );
    await click(create);

    expect(document.querySelector('[data-slot="dialog-content"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });
});
