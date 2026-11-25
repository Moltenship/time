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

  test("a shared file is plain TypeScript and imports only shared files and framework-free packages", () => {
    const path = "registry/shared/calendar-ui/button.styles.ts";
    for (const specifier of [
      "class-variance-authority",
      "cn",
      "@moltenship/calendar",
      "@tanstack/virtual-core",
      "@registry/shared/calendar/locale",
      "./badge.styles",
      "../calendar/locale",
    ]) {
      expect(sharedFileIssues(path, `import x from "${specifier}";`), specifier).toEqual([]);
    }
    expect(sharedFileIssues("registry/shared/calendar-ui/button.tsx", "")).toHaveLength(1);
    for (const specifier of [
      "react",
      "react/jsx-runtime",
      "solid-js",
      "@solidjs/web",
      "@ui-sdk/core/button",
      "@ui-sdk/react/button",
      "@ui-sdk/solid/button",
      "@base-ui/react/button",
      "lucide-react",
      "@tanstack/react-virtual",
      "next/link",
      "radix-ui",
      "motion/react",
      "zustand",
      "@kobalte/core",
      "@registry/calendar/event-chip",
      "../../calendar/event-chip",
    ]) {
      expect(sharedFileIssues(path, `import x from "${specifier}";`), specifier).toHaveLength(1);
    }
  });
});
