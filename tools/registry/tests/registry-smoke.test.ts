import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

import { validateRegistryWorkspace } from "../src/validation";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("shadcn registry validation", () => {
  test("accepts the repository's registry source", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot);

    expect(report.issues).toEqual([]);
    expect(report.manifests).toBe(13);
  });

  test("accepts the target, dependency, CSS variable, and stylesheet contract", async () => {
    const report = await validateRegistryWorkspace(workspaceRoot, [
      "tools/registry/fixtures/valid/registry-item.json",
    ]);

    expect(report).toEqual({ valid: true, manifests: 1, targets: 1, issues: [] });
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
        "invalid-css-value",
        "invalid-css-variable",
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

  test("the named known-bad task exits non-zero with the registry reason", async () => {
    try {
      await execFileAsync(process.execPath, ["--import", "tsx", "src/known-bad.ts"], {
        cwd: new URL("..", import.meta.url),
        env: process.env,
      });
    } catch (error) {
      const output = error as { stderr?: string; stdout?: string };
      expect(`${output.stdout ?? ""}\n${output.stderr ?? ""}`).toContain("KNOWN_BAD_REGISTRY");
      return;
    }
    throw new Error("Known-bad registry task unexpectedly passed");
  });
});
