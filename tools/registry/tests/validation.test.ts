import { resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { validateRegistryWorkspace } from "../src/validation";

const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("shadcn registry validation", () => {
  test("accepts the repository's registry source", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot);

    expect(report.issues).toEqual([]);
    expect(report.manifests).toBe(28);
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
});
