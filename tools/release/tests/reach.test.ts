import { describe, expect, test } from "vite-plus/test";

import { referencesIn } from "../src/reach";

describe("the relative paths a copied file refers to", () => {
  test("code: imports, re-exports, dynamic imports and requires, not packages", () => {
    const source = [
      'import { Button } from "../ui/button";',
      'import "./styles.css";',
      'export { cn } from "../../lib/cn";',
      'const page = await import("../pages/home");',
      'const config = require("../../config.cjs");',
      'import { Calendar } from "@moltenship/calendar";',
    ].join("\n");

    expect(referencesIn("app/page.tsx", source)).toEqual([
      "../ui/button",
      "./styles.css",
      "../../lib/cn",
      "../pages/home",
      "../../config.cjs",
    ]);
  });

  test("styles: imports and Tailwind's sources, not packages", () => {
    const source = [
      '@import "tailwindcss";',
      '@import "../../../registry/calendar-theme/calendar-theme.css";',
      '@source "../../../registry";',
    ].join("\n");

    expect(referencesIn("app/global.css", source)).toEqual([
      "../../../registry/calendar-theme/calendar-theme.css",
      "../../../registry",
    ]);
  });

  test("docs: the page's imports and includes, not its code samples", () => {
    const source = [
      'import { Preview } from "../../components/preview";',
      "",
      "```tsx",
      'import { Button } from "../somewhere/else";',
      "```",
      "",
      "<include meta='title=\"calendar.test.tsx\"'>../../tests/testing-guide.test.tsx#fixtures</include>",
    ].join("\n");

    expect(referencesIn("content/docs/testing.mdx", source)).toEqual([
      "../../components/preview",
      "../../tests/testing-guide.test.tsx",
    ]);
  });

  test("tsconfig: what it extends and where its paths map, from its baseUrl", () => {
    const source = JSON.stringify({
      extends: "../../tsconfig.base.json",
      compilerOptions: {
        baseUrl: ".",
        paths: {
          "@/components/ui/*": ["../demo/src/components/ui/*"],
          "@/*": ["./*"],
        },
      },
    });

    expect(referencesIn("apps/showcase/tsconfig.json", source)).toEqual([
      "../../tsconfig.base.json",
      "../demo/src/components/ui/",
      "",
    ]);
  });
});
