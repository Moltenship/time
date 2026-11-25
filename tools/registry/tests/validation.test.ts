import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { solidRegistry } from "../src/config";
import { sharedFileIssues, validateRegistryWorkspace } from "../src/validation";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("shadcn registry validation", () => {
  test("accepts the repository's registry source", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot);

    expect(report.issues).toEqual([]);
    expect(report.manifests).toBe(30);
  });

  test("accepts the Solid registry's source", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot, { framework: solidRegistry });

    expect(report.issues).toEqual([]);
    expect(report.manifests).toBe(4);
  });

  test("an item lists only its own tree's files and the shared ones", async () => {
    const react = await validateRegistryWorkspace(workspaceRoot, {
      manifestPaths: ["registry/solid/list-view/registry-item.json"],
    });
    const solid = await validateRegistryWorkspace(workspaceRoot, {
      framework: solidRegistry,
      manifestPaths: ["registry/list-view/registry-item.json"],
    });

    expect(react.issues.filter(({ code }) => code === "foreign-source-file")).not.toEqual([]);
    expect(solid.issues.filter(({ code }) => code === "foreign-source-file")).not.toEqual([]);
  });

  test("known-bad registry fixture fails for every protected contract", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot, {
      manifestPaths: ["tools/registry/fixtures/known-bad/registry-item.json"],
    });
    const codes = new Set(report.issues.map(({ code }) => code));

    expect(report.valid).toBe(false);
    expect(codes).toEqual(
      new Set([
        "composition-files",
        "drag-and-drop-dependency",
        "foreign-source-file",
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
