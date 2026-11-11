import { describe, expect, test } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { demoViewNames } from "../../../apps/demo/src/demo-model";
import { StylexDemoCalendar } from "../../../apps/demo/src/stylex/calendar";
import { setTheme, themes } from "./axe";
import { button, events, renderDemo } from "./demo-stylex-screen";
import { click, until } from "./render";

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
