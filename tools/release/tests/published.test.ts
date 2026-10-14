import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { writeManifest, type ReleaseManifest } from "../src/manifest";
import { checkPublished, waitForPublished, type Packument } from "../src/published";

const manifest: ReleaseManifest = {
  status: "passed",
  version: "1.0.0-rc.1",
  commit: "abc123",
  clean: true,
  createdAt: "2026-10-14T00:00:00.000Z",
  checks: [],
  packages: [
    { name: "@x/a", file: "x-a-1.0.0-rc.1.tgz", integrity: "sha512-a" },
    { name: "@x/b", file: "x-b-1.0.0-rc.1.tgz", integrity: "sha512-b" },
  ],
};

const served = (integrity: string, tag = "1.0.0-rc.1", attestations: unknown = {}): Packument => ({
  "dist-tags": { latest: "1.0.0-rc.1", next: tag },
  versions: { "1.0.0-rc.1": { dist: { integrity, attestations } } },
});

const both = new Map([
  ["@x/a", served("sha512-a")],
  ["@x/b", served("sha512-b")],
]);

const options = { version: "1.0.0-rc.1", tag: "next", provenance: true };

describe("what npm serves after publishing", () => {
  test("accepts the dry run's tarballs under their tag, with provenance", () => {
    expect(checkPublished(manifest, options, both)).toEqual({
      problems: [],
      pending: [],
      notes: [],
    });
  });

  test("waits for a version npm doesn't list yet", () => {
    const check = checkPublished(manifest, options, new Map([...both, ["@x/a", undefined]]));

    expect(check.problems).toEqual([]);
    expect(check.pending).toEqual(["npm doesn't list @x/a@1.0.0-rc.1 yet"]);
  });

  test("says when a newer release has taken the tag since, as on a late re-run", () => {
    const check = checkPublished(
      manifest,
      options,
      new Map([...both, ["@x/b", served("sha512-b", "1.0.0-rc.2")]]),
    );

    expect(check.problems).toEqual([]);
    expect(check.notes).toEqual(['@x/b\'s "next" tag has moved on to 1.0.0-rc.2']);
  });

  test.each<[string, ReadonlyMap<string, Packument | undefined>, typeof options, string]>([
    [
      "other contents",
      new Map([...both, ["@x/b", served("sha512-other")]]),
      options,
      "@x/b@1.0.0-rc.1 on npm is sha512-other, not the tarball the dry run checked (sha512-b)",
    ],
    [
      "no provenance",
      new Map([...both, ["@x/a", served("sha512-a", "1.0.0-rc.1", null)]]),
      options,
      "@x/a@1.0.0-rc.1 has no provenance on npm",
    ],
    ["another version", both, { ...options, version: "1.0.0" }, "checked 1.0.0-rc.1, not 1.0.0"],
    [
      "a tag left on an older version",
      new Map([...both, ["@x/b", served("sha512-b", "1.0.0-rc.0")]]),
      options,
      '@x/b\'s "next" tag points at 1.0.0-rc.0, not 1.0.0-rc.1',
    ],
  ])("fails for good on %s", (_, packuments, checked, message) => {
    expect(checkPublished(manifest, checked, packuments).problems).toEqual(
      expect.arrayContaining([expect.stringContaining(message)]),
    );
  });

  test("needs no provenance from a local publish", () => {
    const local = new Map([...both, ["@x/a", served("sha512-a", "1.0.0-rc.1", null)]]);

    expect(checkPublished(manifest, { ...options, provenance: false }, local).problems).toEqual([]);
  });
});

describe("waiting for npm", () => {
  let directory: string;
  let manifestFile: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "release-published-"));
    manifestFile = join(directory, "manifest.json");
    await writeManifest(manifest, manifestFile);
  });
  afterEach(() => rm(directory, { force: true, recursive: true }));

  const quiet = { intervalMs: 0, log: () => {} };

  test("asks again until npm lists every package, through registry errors", async () => {
    let calls = 0;
    const fetch = async (name: string) => {
      calls += 1;
      if (calls === 1) throw new Error("npm answered 503 for @x/a");
      return calls <= 3 ? undefined : both.get(name);
    };

    await waitForPublished({ ...quiet, ...options, manifestFile, fetch });
    expect(calls).toBe(6);
  });

  test("stops at once on other contents, and after the timeout on what never shows", async () => {
    const other = async (name: string) =>
      name === "@x/b" ? served("sha512-other") : both.get(name);
    await expect(
      waitForPublished({ ...quiet, ...options, manifestFile, timeoutMs: 60_000, fetch: other }),
    ).rejects.toThrow("npm doesn't serve what the dry run checked");

    await expect(
      waitForPublished({
        ...quiet,
        ...options,
        manifestFile,
        timeoutMs: 0,
        fetch: async () => undefined,
      }),
    ).rejects.toThrow("npm doesn't list @x/a@1.0.0-rc.1 yet");
  });

  test("takes the prerelease's next tag unless told otherwise, and never latest", async () => {
    const fetch = async (name: string) => both.get(name);
    await expect(
      waitForPublished({ ...quiet, version: "1.0.0-rc.1", provenance: true, manifestFile, fetch }),
    ).resolves.toBeUndefined();
    await expect(
      waitForPublished({ ...quiet, ...options, tag: "latest", manifestFile, fetch }),
    ).rejects.toThrow("can't take the latest tag");
  });
});
