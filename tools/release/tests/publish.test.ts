import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { dryRun, requestedVersion } from "../src/dry-run";
import {
  distTag,
  publishProblems,
  readManifest,
  writeManifest,
  type PublishState,
  type ReleaseManifest,
} from "../src/manifest";
import {
  planStage,
  printedJson,
  publish,
  stagedFromSummary,
  type StagedVersion,
} from "../src/publish";
import { parseArguments } from "../src/workspace";

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
    expect(() => distTag("1.0.0", "1.0.0")).toThrow("isn't a dist-tag");
    // npm refuses tags that parse as a semver range, such as "x".
    expect(() => distTag("1.0.0", "x")).toThrow("looks like a version range");
    expect(() => distTag("1.0.0", "")).toThrow("isn't a dist-tag");
    expect(() => distTag("1.0.0", "next tag")).toThrow("isn't a dist-tag");
  });

  test("refuses without a manifest, before it reaches the registry", async () => {
    const previous = {
      npm: process.env.npm_config_registry,
      pnpm: process.env.pnpm_config_registry,
    };
    // A registry nothing listens on, in case a regression ever got past the guard.
    process.env.npm_config_registry = "http://127.0.0.1:9/";
    process.env.pnpm_config_registry = "http://127.0.0.1:9/";
    const lines: string[] = [];
    try {
      const missing = join(resolve(import.meta.dirname, ".."), "tests/no-such-manifest.json");
      const attempt = publish({
        version: "1.0.0",
        manifestFile: missing,
        log: (line) => lines.push(line),
      });

      await expect(attempt).rejects.toThrow("Refusing to publish");
      await expect(attempt).rejects.toThrow("No dry-run manifest");
      expect(lines).toEqual([]);
    } finally {
      process.env.npm_config_registry = previous.npm;
      process.env.pnpm_config_registry = previous.pnpm;
    }
  }, 30_000);

  test("flags are strict: no value on booleans, a value on strings, nothing unknown", () => {
    const parse = (argv: string[]) => parseArguments(argv, ["yes"], ["tag"]);

    expect(() => parse(["--yes=false"])).toThrow("--yes takes no value");
    expect(() => parse(["--tag"])).toThrow("--tag needs a value");
    expect(() => parse(["--tag", "--yes"])).toThrow("--tag needs a value");
    expect(() => parse(["--dry-run", "--yes"])).toThrow("Unknown option --dry-run");
    expect(() => parse(["1.0.0-rc.1"])).toThrow("Unexpected argument 1.0.0-rc.1");
    expect(() => parse(["--tag="])).toThrow("--tag needs a value");
    expect(parse(["--tag=a=b"]).flags.get("tag")).toBe("a=b");
    expect(parse(["--yes", "--tag", "next"]).flags).toEqual(
      new Map<string, string | true>([
        ["yes", true],
        ["tag", "next"],
      ]),
    );
  });
});

describe("staged publishing", () => {
  const wanted = { name: "@x/a", version: "1.0.0-rc.2", shasum: "aaa", tag: "next" };
  const item = (fields: Partial<StagedVersion>): StagedVersion => ({
    id: "11111111-1111-4111-8111-111111111111",
    packageName: "@x/a",
    version: "1.0.0-rc.2",
    tag: "next",
    shasum: "aaa",
    ...fields,
  });

  test("stages what isn't staged, and approves what a run before staged with this tarball", () => {
    expect(planStage([], wanted)).toEqual({ action: "stage" });
    expect(
      planStage([item({ packageName: "@x/b" }), item({ version: "1.0.0-rc.1" })], wanted),
    ).toEqual({
      action: "stage",
    });
    expect(planStage([item({ shasum: "bbb", id: "other" }), item({})], wanted)).toEqual({
      action: "approve",
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  test("stops on a version staged with another tarball or tag, or one the listing doesn't describe", () => {
    expect(planStage([item({ shasum: "bbb" })], wanted)).toEqual({
      action: "conflict",
      ids: ["11111111-1111-4111-8111-111111111111"],
    });
    expect(planStage([item({ tag: "latest" })], wanted).action).toBe("conflict");
    expect(planStage([item({ shasum: undefined })], wanted).action).toBe("conflict");
  });

  test("reads the JSON pnpm printed, past anything its reporter printed first", () => {
    expect(printedJson('Progress: resolved 1\n[\n  { "id": "a" }\n]\n', "x")).toEqual([
      { id: "a" },
    ]);
    expect(() => printedJson("Staged.", "pnpm stage list")).toThrow(
      "pnpm stage list didn't print JSON",
    );
  });

  test("reads the stage id pnpm printed for the tarball", () => {
    const stdout = JSON.stringify({
      "@x/a": { id: "@x/a@1.0.0-rc.2", name: "@x/a", integrity: "sha512-a", stageId: "abc" },
    });

    expect(stagedFromSummary(stdout, "@x/a")).toEqual({ stageId: "abc", integrity: "sha512-a" });
    expect(() => stagedFromSummary(stdout, "@x/b")).toThrow("no stage id for @x/b");
    expect(() => stagedFromSummary("Staged.", "@x/a")).toThrow("didn't print JSON");
  });
});

describe("the dry run", () => {
  test("checks --version first, then RELEASE_VERSION, then nothing", () => {
    expect(requestedVersion("1.0.0", "2.0.0")).toEqual({ version: "1.0.0", requestedFrom: "flag" });
    expect(requestedVersion(undefined, "2.0.0")).toEqual({
      version: "2.0.0",
      requestedFrom: "env",
    });
    expect(requestedVersion(undefined, "")).toEqual({ version: undefined, requestedFrom: "env" });
    expect(requestedVersion(undefined, undefined)).toEqual({
      version: undefined,
      requestedFrom: "env",
    });
  });

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
