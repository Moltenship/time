import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { dryRun } from "../src/dry-run";
import {
  distTag,
  publishProblems,
  readManifest,
  writeManifest,
  type PublishState,
  type ReleaseManifest,
} from "../src/manifest";
import { publish } from "../src/publish";
import { parseArguments } from "../src/workspace";

const manifest: ReleaseManifest = {
  status: "passed",
  version: "1.0.0-rc.1",
  commit: "abc123",
  clean: true,
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
  onMain: true,
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
    ["a commit that isn't on main", { onMain: false }, "HEAD isn't on origin/main"],
    [
      "a tarball named for another package",
      {
        manifest: {
          ...manifest,
          packages: [
            manifest.packages[0]!,
            { ...manifest.packages[1]!, file: "x-a-1.0.0-rc.1.tgz" },
          ],
        },
      },
      "x-a-1.0.0-rc.1.tgz isn't the tarball of @x/b",
    ],
    [
      "a dry run on a dirty tree",
      { manifest: { ...manifest, clean: false } },
      "working tree with changes",
    ],
    ["another version", { version: "1.0.0" }, "The dry run checked 1.0.0-rc.1, not 1.0.0"],
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
  });

  test("refuses without a manifest, before it reaches npm", async () => {
    const lines: string[] = [];
    const missing = join(resolve(import.meta.dirname, ".."), "tests/no-such-manifest.json");
    const attempt = publish({
      version: "1.0.0",
      manifestFile: missing,
      log: (line) => lines.push(line),
    });

    await expect(attempt).rejects.toThrow("Refusing to publish");
    await expect(attempt).rejects.toThrow("No dry-run manifest");
    expect(lines).toEqual([]);
  });
});

describe("command-line arguments", () => {
  test("flags are strict: no value, nothing unknown, positionals only where taken", () => {
    const parse = (argv: string[]) => parseArguments(argv, ["dry-run"]);

    expect(() => parse(["--dry-run=false"])).toThrow("--dry-run takes no value");
    expect(() => parse(["--dry-run="])).toThrow("--dry-run takes no value");
    expect(() => parse(["--dryrun"])).toThrow("Unknown option --dryrun");
    expect(() => parse(["1.0.0-rc.1"])).toThrow("Unexpected argument 1.0.0-rc.1");
    expect(parse(["--dry-run", "--"]).flags).toEqual(new Set(["dry-run"]));
    expect(parseArguments(["1.0.0", "--dry-run"], ["dry-run"], { positionals: true })).toEqual({
      flags: new Set(["dry-run"]),
      positionals: ["1.0.0"],
    });
  });
});

describe("the dry run", () => {
  test("a failed run removes the manifest an earlier run left", async () => {
    const directory = await mkdtemp(join(tmpdir(), "release-dry-run-"));
    const manifestFile = join(directory, "manifest.json");
    try {
      await writeManifest(manifest, manifestFile);

      // The packages aren't at 9.9.9, so the versions step fails before anything builds.
      await expect(dryRun({ version: "9.9.9", manifestFile })).rejects.toThrow("not 9.9.9");
      expect(await readManifest(manifestFile)).toBeUndefined();
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
