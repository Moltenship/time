import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { sharedFileIssues, validateRegistryWorkspace } from "../src/validation";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("shadcn registry validation", () => {
  test("accepts the repository's registry source", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot);

    expect(report.issues).toEqual([]);
    expect(report.manifests).toBe(29);
  });

  test("known-bad registry fixture fails for every protected contract", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot, [
      "tools/registry/fixtures/known-bad/registry-item.json",
    ]);
    const codes = new Set(report.issues.map(({ code }) => code));

    expect(report.valid).toBe(false);
    expect(codes).toEqual(
      new Set([
        "composition-files",
        "drag-and-drop-dependency",
        "generated-compatibility",
        "inline-css",
        "invalid-dependency",
        "invalid-registry-dependency",
        "invalid-target",
        "missing-source-file",
        "missing-stylesheet",
        "missing-target",
        "undeclared-dependency",
        "unsupported-dev-dependencies",
        "unknown-registry-item",
        "versioned-dependency",
      ]),
    );
  });

  test("a shared file is plain TypeScript with no framework in it", () => {
    const path = "registry/shared/calendar-ui/button.styles.ts";
    expect(sharedFileIssues(path, 'import { cva } from "class-variance-authority";')).toEqual([]);
    expect(sharedFileIssues(path, 'import { cn } from "cn";')).toEqual([]);
    expect(
      sharedFileIssues(path, 'import type { Locale } from "@registry/shared/calendar/locale";'),
    ).toEqual([]);
    expect(sharedFileIssues("registry/shared/calendar-ui/button.tsx", "")).toHaveLength(1);
    for (const specifier of [
      "react",
      "react/jsx-runtime",
      "solid-js",
      "@solidjs/web",
      "@ui-sdk/react/button",
      "@ui-sdk/solid/button",
      "@base-ui/react/button",
      "lucide-react",
      "@tanstack/react-virtual",
      "@registry/calendar/event-chip",
    ]) {
      expect(sharedFileIssues(path, `import x from "${specifier}";`), specifier).toHaveLength(1);
    }
    expect(sharedFileIssues(path, 'import { createButton } from "@ui-sdk/core/button";')).toEqual(
      [],
    );
  });
});
