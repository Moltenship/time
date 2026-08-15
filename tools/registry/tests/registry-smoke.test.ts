import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { describe, expect, test } from "vite-plus/test";

import { validateRegistryWorkspace } from "../src/validation";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, "../../..");

describe("shadcn registry validation", () => {
  test("accepts the target, dependency, CSS variable, and compatibility contract", async () => {
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
        "invalid-compatibility-package",
        "invalid-compatibility-range",
        "invalid-css-value",
        "invalid-css-variable",
        "invalid-dependency",
        "invalid-registry-dependency",
        "invalid-target",
        "missing-compatible-dependency",
        "missing-source-file",
        "missing-target",
      ]),
    );
  });

  test("rejects compatibility packages declared only as dev dependencies", async () => {
    const manifestPath =
      "tools/registry/fixtures/known-bad-dev-only-compatibility/registry-item.json";
    const report = await validateRegistryWorkspace(workspaceRoot, [manifestPath]);

    expect(report).toEqual({
      valid: false,
      manifests: 1,
      targets: 1,
      issues: [
        {
          code: "missing-compatible-dependency",
          path: `${manifestPath}.meta.compatibility.@moltenship/calendar`,
          message: "Compatibility package must also appear in dependencies: @moltenship/calendar",
        },
      ],
    });
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
