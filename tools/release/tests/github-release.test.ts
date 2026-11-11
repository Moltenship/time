import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { createGitHubRelease, releaseTag, type Exec } from "../src/github-release";
import { writeManifest, type ReleaseManifest } from "../src/manifest";

const commit = "e5272cdbff099a2c0d8e06e3415f154eee2a22c5";

const notes = "### Features\n\n- **react:** add a hook in #1\n";

const manifest = (version: string): ReleaseManifest => ({
  status: "passed",
  version,
  commit,
  clean: true,
  packages: [],
});

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const fail = (stderr: string) => ({ code: 1, stdout: "", stderr });

/** What GitHub and git answer, as `gh` and `git` print it. */
interface Remote {
  readonly onMain?: boolean;
  /** What `gh` prints when GitHub can't answer, for the tag lookup or the release lookup. */
  readonly tagError?: string;
  readonly releaseError?: string;
  /** The tag's ref object, a commit or an annotated tag that points at one; null without a tag. */
  readonly tag?: { readonly sha: string; readonly type: "commit" | "tag" } | null;
  readonly release?: { readonly isDraft: boolean };
}

/** A fake `gh` and `git`, recording each call and the notes `gh release create` got. */
function fake({ tag = { sha: commit, type: "commit" }, ...remote }: Remote) {
  const calls: string[][] = [];
  let notes: string | undefined;
  const exec: Exec = async (command, args) => {
    calls.push([command, ...args]);
    const [first, second] = args;
    if (command === "git" && first === "merge-base")
      return remote.onMain === false ? fail("") : ok();
    if (command === "gh" && first === "api" && second?.includes("/git/ref/tags/")) {
      if (remote.tagError) return fail(remote.tagError);
      if (!tag) return fail("gh: Not Found (HTTP 404)");
      return ok(JSON.stringify({ object: tag }));
    }
    if (command === "gh" && first === "api" && second?.includes("/git/tags/")) {
      return ok(JSON.stringify({ object: { sha: commit, type: "commit" } }));
    }
    if (command === "gh" && first === "release" && second === "view") {
      if (remote.releaseError) return fail(remote.releaseError);
      return remote.release ? ok(JSON.stringify(remote.release)) : fail("release not found");
    }
    if (command === "gh" && first === "release" && second === "create") {
      notes = await readFile(args[args.indexOf("--notes-file") + 1]!, "utf8");
      return ok("https://github.com/Moltenship/time/releases/tag/v1");
    }
    throw new Error(`Unexpected ${command} ${args.join(" ")}`);
  };
  const created = () =>
    calls.find(
      ([command, first, second]) => command === "gh" && first === "release" && second === "create",
    );
  return { exec, calls, created, notes: () => notes };
}

describe("the GitHub release", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "release-github-"));
  });
  afterEach(() => rm(directory, { force: true, recursive: true }));

  async function release(version: string, remote: Remote) {
    const manifestFile = join(directory, "manifest.json");
    await writeManifest(manifest(version), manifestFile);
    const gh = fake(remote);
    const lines: string[] = [];
    await createGitHubRelease({
      version,
      notes,
      manifestFile,
      exec: gh.exec,
      log: (line) => lines.push(line),
    });
    return { ...gh, lines };
  }

  test("is tagged v<version>", () => {
    expect(releaseTag("1.0.0-rc.1")).toBe("v1.0.0-rc.1");
  });

  test("writes the release of the tag at the dry run's commit and marks a prerelease, with the notes it's given", async () => {
    const { created, notes: written, lines } = await release("1.0.0-rc.1", {});

    expect(created()?.slice(3)).toEqual([
      "v1.0.0-rc.1",
      "--verify-tag",
      "--title",
      "1.0.0-rc.1",
      "--notes-file",
      expect.any(String),
      "--prerelease",
    ]);
    expect(written()).toBe(notes);
    expect(lines.at(-1)).toContain(`Wrote the GitHub release of v1.0.0-rc.1, at ${commit}`);
  });

  test("writes a stable release without the prerelease mark", async () => {
    const { created } = await release("1.0.0", {});

    expect(created()).not.toContain("--prerelease");
  });

  test("follows an annotated tag to its commit", async () => {
    const { created } = await release("1.0.0-rc.1", { tag: { sha: "annotated", type: "tag" } });

    expect(created()).toContain("--verify-tag");
  });

  test("leaves a published release alone", async () => {
    const { created, lines } = await release("1.0.0-rc.1", { release: { isDraft: false } });

    expect(created()).toBeUndefined();
    expect(lines).toEqual(["The v1.0.0-rc.1 release is already on GitHub; leaving it."]);
  });

  test.each<[string, string, Remote, string]>([
    [
      "a tag on another commit",
      "1.0.0-rc.1",
      { tag: { sha: "f00", type: "commit" } },
      `v1.0.0-rc.1 already points at f00, not ${commit}`,
    ],
    ["a missing tag", "1.0.0-rc.1", { tag: null }, "v1.0.0-rc.1 isn't on GitHub"],
    ["a draft", "1.0.0-rc.1", { release: { isDraft: true } }, "A draft v1.0.0-rc.1 release"],
    ["a commit that isn't on main", "1.0.0-rc.1", { onMain: false }, "isn't on origin/main"],
    ["a version the dry run didn't check", "1.0.1", {}, "checked 1.0.0-rc.1, not 1.0.1"],
    [
      "a tag lookup GitHub can't answer",
      "1.0.0-rc.1",
      { tagError: "gh: Server Error (HTTP 502)" },
      "Can't tell whether v1.0.0-rc.1 exists",
    ],
    [
      "a release lookup GitHub can't answer",
      "1.0.0-rc.1",
      { releaseError: "HTTP 401: Bad credentials" },
      "Can't tell whether the v1.0.0-rc.1 release exists",
    ],
  ])("stops on %s, before it writes anything", async (_, version, remote, message) => {
    const manifestFile = join(directory, "manifest.json");
    await writeManifest(manifest("1.0.0-rc.1"), manifestFile);
    const gh = fake(remote);

    await expect(
      createGitHubRelease({ version, notes, manifestFile, exec: gh.exec, log: () => {} }),
    ).rejects.toThrow(message);
    expect(gh.created()).toBeUndefined();
  });
});
