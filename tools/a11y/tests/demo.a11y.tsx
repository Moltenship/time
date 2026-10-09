import { describe, expect, test } from "vite-plus/test";

import { App } from "../../../apps/demo/src/app";
import { seriousViolations, setTheme, themes } from "./axe";
import { click, render } from "./render";

const views = ["week", "day", "month", "agenda"] as const;

/** Opens the demo the way a link does: the view comes from the URL, the events from the seed. */
async function renderDemo(view: (typeof views)[number]) {
  localStorage.clear();
  history.replaceState(null, "", `?view=${view}`);
  await render(<App />);
}

describe.each(themes)("demo, %s theme", (theme) => {
  test.each(views)("%s view", async (view) => {
    setTheme(theme);
    await renderDemo(view);

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
