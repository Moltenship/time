import { afterEach, describe, expect, test } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";

import { demoViewNames } from "../../../apps/demo/src/demo-model";
import { StylexDemoCalendar } from "../../../apps/demo/src/stylex/calendar";
import { setTheme, themes } from "./axe";
import { button, events, renderDemo } from "./demo-stylex-screen";
import { click, until } from "./render";

describe("StyleX demo", () => {
  test("styles apply: StyleX's and the calendar's tokens, in both themes", async () => {
    for (const theme of themes) {
      setTheme(theme);
      await renderDemo("week");

      const event = events()[0];
      if (event === undefined) throw new Error("no-event");
      expect(getComputedStyle(event).position).toBe("absolute");
      expect(getComputedStyle(event).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
      const create = button("Create", document.querySelector("aside") ?? document);
      expect(create && getComputedStyle(create).borderTopWidth).toBe("1px");
      expect(document.documentElement.classList.contains("dark")).toBe(theme === "dark");
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

    await until(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const title = dialog?.querySelector<HTMLInputElement>('input[placeholder="Add title"]');
    if (title == null) throw new Error("no-title-field");
    await userEvent.fill(title, "Planning poker");
    await click(button("Save", dialog ?? document));

    await until(() => {
      expect(document.querySelector('[role="dialog"]')).toBeNull();
      expect(events().some((event) => event.textContent?.includes("Planning poker"))).toBe(true);
    });
  });

  // WebKit, like Safari, doesn't focus a button it clicks, so there the dialog it opens once gave
  // focus back to the page.
  describe("a dialog a top bar button opens gives focus back to it", () => {
    afterEach(async () => {
      await page.viewport(1280, 800);
    });

    test.each([
      ["Open sidebar", 390],
      ["Keyboard shortcuts", 1280],
    ] as const)("%s", async (name, width) => {
      await page.viewport(width, 800);
      setTheme("light");
      await renderDemo("week");
      const opener = button(name, document.querySelector("header") ?? document)!;
      await userEvent.click(opener);
      await until(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());

      await userEvent.keyboard("{Escape}");
      await until(() => expect(document.activeElement).toBe(opener));
    });
  });

  test("the view switcher changes the view", async () => {
    setTheme("light");
    await renderDemo("week");

    const switcher = document.querySelector<HTMLElement>('header [role="combobox"]');
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
