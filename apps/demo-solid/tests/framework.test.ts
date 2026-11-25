import { expect, test } from "vite-plus/test";

import { demoFrameworks, frameworkHref } from "../src/framework";

test("the framework switch leads to React's Tailwind page and back here, with the search", () => {
  expect(demoFrameworks.map(({ value }) => value)).toEqual(["react", "solid"]);
  expect(frameworkHref("react", "?view=agenda&date=2026-12-24")).toBe(
    "/?view=agenda&date=2026-12-24",
  );
  expect(frameworkHref("solid", "?view=agenda&date=2026-12-24")).toBe(
    "/solid/?view=agenda&date=2026-12-24",
  );
});
