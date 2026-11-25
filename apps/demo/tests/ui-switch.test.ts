import { describe, expect, test } from "vite-plus/test";

import { frameworkHref, uiHref } from "../src/ui-switch";

describe("the switches' addresses", () => {
  test("lead to each UI's page with the view and date", () => {
    expect(uiHref("tailwind", "?view=month&date=2026-12-24")).toBe("/?view=month&date=2026-12-24");
    expect(uiHref("stylex", "?view=month&date=2026-12-24")).toBe(
      "/stylex/?view=month&date=2026-12-24",
    );
  });

  test("lead to React's Tailwind page and to the Solid demo's page", () => {
    expect(frameworkHref("react", "?view=week&date=2026-10-08")).toBe(
      "/?view=week&date=2026-10-08",
    );
    expect(frameworkHref("solid", "?view=week&date=2026-10-08")).toBe(
      "/solid/?view=week&date=2026-10-08",
    );
    expect(frameworkHref("solid", "")).toBe("/solid/");
  });
});
