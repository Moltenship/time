import { describe, expect, test, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";

import { seriousViolations, setTheme, themes } from "./axe";
import { RegistryScreen, registryViews } from "./registry-screen";
import { click, press, render } from "./render";

describe.each(themes)("registry views, %s theme", (theme) => {
  test.each(registryViews)("%s view, toolbar and mini month", async (view) => {
    setTheme(theme);
    await render(<RegistryScreen view={view} />);

    expect(await seriousViolations()).toEqual([]);
  });

  test("week view's annotation popover", async () => {
    setTheme(theme);
    await render(<RegistryScreen view="week" />);
    await click(
      document.querySelector<HTMLElement>('[data-slot="annotation-mark"][data-source="music"]'),
    );

    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
    // Focus stays out of the hidden rail: no focus guards there while open, and none after.
    expect(document.querySelectorAll('[data-slot="annotation-rail"] [tabindex="0"]')).toHaveLength(
      0,
    );
    expect(
      document.querySelector('[data-slot="popover-content"]')!.contains(document.activeElement),
    ).toBe(true);
    await press("Escape");
    // It closes after its exit animation.
    await vi.waitFor(() =>
      expect(document.querySelector('[data-slot="popover-content"]')).toBeNull(),
    );
    expect(document.activeElement?.closest('[aria-hidden="true"]') ?? null).toBeNull();
  });

  test("the annotation popover returns focus past a switch between marks", async () => {
    setTheme(theme);
    await render(<RegistryScreen view="week" />);
    const previous = document.querySelector<HTMLElement>('button[aria-label^="Previous"]')!;
    previous.focus();
    await click(
      document.querySelector<HTMLElement>('[data-slot="annotation-mark"][data-source="music"]'),
    );
    await click(
      document.querySelector<HTMLElement>('[data-slot="annotation-mark"][data-source="sleep"]'),
    );
    expect(document.querySelector('[data-slot="popover-content"]')!.textContent).toContain("Sleep");
    await press("Escape");
    await vi.waitFor(() =>
      expect(document.querySelector('[data-slot="popover-content"]')).toBeNull(),
    );

    expect(document.activeElement).toBe(previous);
  });

  test("the annotation popover leaves focus where an outside click put it", async () => {
    setTheme(theme);
    await render(<RegistryScreen view="week" />);
    const field = document.body.appendChild(document.createElement("input"));
    field.setAttribute("aria-label", "Elsewhere");
    try {
      document.querySelector<HTMLElement>('button[aria-label^="Previous"]')!.focus();
      await click(
        document.querySelector<HTMLElement>('[data-slot="annotation-mark"][data-source="music"]'),
      );
      await userEvent.click(field);
      await vi.waitFor(() =>
        expect(document.querySelector('[data-slot="popover-content"]')).toBeNull(),
      );

      expect(document.activeElement).toBe(field);
    } finally {
      field.remove();
    }
  });

  test("month view's +N more popover", async () => {
    setTheme(theme);
    await render(<RegistryScreen view="month" />);
    await click(document.querySelector<HTMLElement>('[aria-label*=" more events on "]'));

    expect(document.querySelector('[data-slot="popover-content"]')).not.toBeNull();
    expect(await seriousViolations()).toEqual([]);
  });
});
