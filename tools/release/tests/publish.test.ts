import { join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { distTag, publishProblems, type PublishState, type ReleaseManifest } from "../src/manifest";
import { run } from "../src/workspace";

const manifest: ReleaseManifest = {
  status: "passed",
  version: "1.0.0-rc.1",
  commit: "abc123",
  clean: true,
  createdAt: "2026-10-12T00:00:00.000Z",
  checks: ["versions", "build", "size", "api", "pack", "exports", "consumer", "registry"],
  packages: [
    { name: "@x/a", file: "x-a-1.0.0-rc.1.tgz", integrity: "sha512-a" },
    { name: "@x/b", file: "x-b-1.0.0-rc.1.tgz", integrity: "sha512-b" },
  ],
};

const ready: PublishState = {
  manifest,
  version: "1.0.0-rc.1",
  head: "abc123",
  clean: true,
  expectedPackages: ["@x/a", "@x/b"],
  tarballIntegrity: { "x-a-1.0.0-rc.1.tgz": "sha512-a", "x-b-1.0.0-rc.1.tgz": "sha512-b" },
};

describe("the publish guard", () => {
  test("accepts a release the dry run vouches for", () => {
    expect(publishProblems(ready)).toEqual([]);
  });

  test.each<[string, Partial<PublishState>, string]>([
    ["no dry run", { manifest: undefined }, "No dry-run manifest"],
    ["another commit", { head: "def456" }, "but HEAD is def456"],
    ["a dirty tree", { clean: false }, "The working tree has changes"],
    [
      "a dry run on a dirty tree",
      { manifest: { ...manifest, clean: false } },
      "working tree with changes",
    ],
    ["another version", { version: "1.0.0" }, "The dry run checked 1.0.0-rc.1, not 1.0.0"],
    [
      "the placeholder version",
      { version: "0.0.0", manifest: { ...manifest, version: "0.0.0" } },
      "placeholder",
    ],
    ["an invalid version", { version: "v1" }, "isn't a semver version"],
    [
      "a changed tarball",
      { tarballIntegrity: { ...ready.tarballIntegrity, "x-b-1.0.0-rc.1.tgz": "sha512-other" } },
      "x-b-1.0.0-rc.1.tgz changed after the dry run",
    ],
    [
      "a missing tarball",
      { tarballIntegrity: { "x-a-1.0.0-rc.1.tgz": "sha512-a" } },
      "x-b-1.0.0-rc.1.tgz is missing",
    ],
    [
      "a package the dry run skipped",
      { expectedPackages: ["@x/a", "@x/b", "@x/c"] },
      "didn't pack @x/c",
    ],
    [
      "a failed dry run",
      { manifest: { ...manifest, status: "failed" as "passed" } },
      "didn't pass",
    ],
  ])("refuses %s", (_, change, message) => {
    const problems = publishProblems({ ...ready, ...change });

    expect(
      problems.some((problem) => problem.includes(message)),
      problems.join("\n"),
    ).toBe(true);
  });

  test("prereleases go to next, stable versions to latest", () => {
    expect(distTag("1.0.0-rc.1")).toBe("next");
    expect(distTag("1.0.0")).toBe("latest");
    expect(distTag("1.0.0-rc.1", "rc")).toBe("rc");
    expect(() => distTag("1.0.0-rc.1", "latest")).toThrow("can't take the latest tag");
    expect(() => distTag("1.0.0", "1.0.0")).toThrow("looks like a version");
  });

  test("the command refuses without a manifest and never reaches the registry", async () => {
    const releaseRoot = resolve(import.meta.dirname, "..");
    const result = await run(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/publish.ts",
        "--version",
        "1.0.0",
        "--yes",
        "--manifest",
        join(releaseRoot, "tests/no-such-manifest.json"),
      ],
      // A registry nothing listens on, in case a regression ever got past the guard.
      { cwd: releaseRoot, env: { ...process.env, npm_config_registry: "http://127.0.0.1:9/" } },
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain("Refusing to publish");
    expect(result.stderr).toContain("No dry-run manifest");
    expect(result.stdout).not.toContain("Ready to publish");
  }, 30_000);
});
