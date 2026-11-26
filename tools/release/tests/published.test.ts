import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { writeManifest, type ReleaseManifest } from "../src/manifest";
import {
  checkPublished,
  fetchTarball,
  waitForPublished,
  type Packument,
  type TarballAnswer,
} from "../src/published";

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

const served = (integrity: string, tag = "1.0.0-rc.1", trusted = true): Packument => ({
  "dist-tags": { latest: "1.0.0-rc.1", next: tag },
  versions: {
    "1.0.0-rc.1": {
      dist: {
        integrity,
        tarball: `https://registry.example/${integrity}.tgz`,
        ...(trusted ? { attestations: { provenance: {} } } : {}),
      },
      _npmUser: trusted ? { trustedPublisher: { id: "github" } } : {},
    },
  },
});

const both = new Map([
  ["@x/a", served("sha512-a")],
  ["@x/b", served("sha512-b")],
]);

const options = { version: "1.0.0-rc.1", tag: "next" };

describe("what npm serves after publishing", () => {
  test("accepts the dry run's tarballs under their tag, from the trusted publisher", () => {
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
      "no trusted publisher",
      new Map([...both, ["@x/a", served("sha512-a", "1.0.0-rc.1", false)]]),
      options,
      "@x/a@1.0.0-rc.1 has no trusted publisher and provenance on npm",
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

  /** npm's CDN serving every tarball: the integrity is the file's name in `served`'s URL. */
  const downloads = async (url: string): Promise<TarballAnswer> => ({
    status: 200,
    integrity: url.slice(url.lastIndexOf("/") + 1, -".tgz".length),
  });
  const quiet = { intervalMs: 0, log: () => {}, fetchTarball: downloads };

  test("asks again until npm lists every package, through registry errors", async () => {
    let calls = 0;
    const fetch = async (name: string) => {
      calls += 1;
      if (calls === 1) throw new Error("npm answered 503 for @x/a");
      return calls <= 3 ? undefined : both.get(name);
    };

    await waitForPublished({ ...quiet, version: options.version, manifestFile, fetch });
    expect(calls).toBe(6);
  });

  test("stops at once on other contents, and after the timeout on what never shows", async () => {
    const other = async (name: string) =>
      name === "@x/b" ? served("sha512-other") : both.get(name);
    await expect(
      waitForPublished({
        ...quiet,
        version: options.version,
        manifestFile,
        timeoutMs: 60_000,
        fetch: other,
      }),
    ).rejects.toThrow("npm doesn't serve what the dry run checked");

    await expect(
      waitForPublished({
        ...quiet,
        version: options.version,
        manifestFile,
        timeoutMs: 0,
        fetch: async () => undefined,
      }),
    ).rejects.toThrow("npm doesn't list @x/a@1.0.0-rc.1 yet");
  });

  test("waits for every tarball to download once npm lists the version, as release run 45774483713 needed", async () => {
    const asked: string[] = [];
    let round = 0;
    const lines: string[] = [];
    await waitForPublished({
      ...quiet,
      log: (line) => lines.push(line),
      version: options.version,
      manifestFile,
      fetch: async (name) => {
        if (name === "@x/a") round += 1;
        return both.get(name);
      },
      fetchTarball: async (url) => {
        asked.push(url);
        // @x/b's tarball: a 404 from the CDN, then a registry error, then the file.
        if (url.includes("sha512-b") && round === 1) return { status: 404 };
        if (url.includes("sha512-b") && round === 2) throw new Error("socket hang up");
        return downloads(url);
      },
    });

    // @x/a's tarball once: a download that matched isn't asked for again.
    expect(asked).toEqual([
      "https://registry.example/sha512-a.tgz",
      "https://registry.example/sha512-b.tgz",
      "https://registry.example/sha512-b.tgz",
      "https://registry.example/sha512-b.tgz",
    ]);
    expect(lines.slice(0, 2)).toEqual([
      "Waiting for npm: 1 left, such as npm answers 404 for @x/b@1.0.0-rc.1's tarball, https://registry.example/sha512-b.tgz",
      "Waiting for npm: 1 left, such as @x/b@1.0.0-rc.1's tarball: socket hang up",
    ]);
    expect(lines.at(-1)).toContain("each tarball downloads with the dry run's integrity");
  });

  test("asks for no tarball before npm lists the version", async () => {
    const asked: string[] = [];
    let calls = 0;
    await waitForPublished({
      ...quiet,
      version: options.version,
      manifestFile,
      fetch: async (name) => {
        calls += 1;
        return calls <= 2 ? undefined : both.get(name);
      },
      fetchTarball: async (url) => {
        asked.push(url);
        return downloads(url);
      },
    });
    expect(asked).toHaveLength(2);
  });

  test("names the tarball that never downloads when the time runs out, and stops at once on other bytes", async () => {
    await expect(
      waitForPublished({
        ...quiet,
        version: options.version,
        manifestFile,
        timeoutMs: 0,
        fetch: async (name) => both.get(name),
        fetchTarball: async (url) => (url.includes("sha512-a") ? { status: 404 } : downloads(url)),
      }),
    ).rejects.toThrow(
      "npm still doesn't serve the release after 0 minutes:\n- npm answers 404 for @x/a@1.0.0-rc.1's tarball, https://registry.example/sha512-a.tgz",
    );

    await expect(
      waitForPublished({
        ...quiet,
        version: options.version,
        manifestFile,
        timeoutMs: 60_000,
        fetch: async (name) => both.get(name),
        fetchTarball: async (url) =>
          url.includes("sha512-b") ? { status: 200, integrity: "sha512-other" } : downloads(url),
      }),
    ).rejects.toThrow(
      "@x/b@1.0.0-rc.1's tarball, https://registry.example/sha512-b.tgz, is sha512-other, not the one the dry run checked (sha512-b)",
    );
  });

  test("checks a prerelease under the next tag", async () => {
    const lines: string[] = [];
    const fetch = async (name: string) => both.get(name);
    await waitForPublished({
      ...quiet,
      log: (line) => lines.push(line),
      version: "1.0.0-rc.1",
      manifestFile,
      fetch,
    });
    expect(lines.at(-1)).toContain("tagged next, from the trusted publisher, with provenance");
  });
});

test("hashes a downloaded tarball as npm writes its integrity", async () => {
  const bytes = Buffer.from("a tarball");
  expect(
    await fetchTarball(`data:application/octet-stream;base64,${bytes.toString("base64")}`),
  ).toEqual({
    status: 200,
    integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
  });
});
