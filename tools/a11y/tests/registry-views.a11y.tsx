import { describe, expect, test } from "vite-plus/test";

import { seriousViolations, setTheme, themes } from "./axe";
import { RegistryScreen, registryViews } from "./registry-screen";
import { click, render } from "./render";

describe.each(themes)("registry views, %s theme", (theme) => {
  test.each(registryViews)("%s view, toolbar and mini month", async (view) => {
    setTheme(theme);
    await render(<RegistryScreen view={view} />);

    expect(await seriousViolations()).toEqual([]);
  });

  test("month view's +N more popover", async () => {
    setTheme(theme);
    await render(<RegistryScreen view="month" />);
    await click(document.querySelector<HTMLElement>('[aria-label*=" more events on "]'));

    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });
});
