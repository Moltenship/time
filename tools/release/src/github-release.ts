import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prerelease } from "semver";

import { manifestPath, readManifest } from "./manifest";
import { changelogSection } from "./version";
import { parseArguments, run, runMain, runOrThrow } from "./workspace";

export const releaseTag = (version: string) => `v${version}`;

/**
 * A changelog section as a GitHub release's notes. The changelog wraps its lines at 100
 * characters, and GitHub shows each line break in a release, so each paragraph and list item
 * becomes one line. Blank lines, headings and fenced code stay as they are.
 */
export function releaseNotes(section: string): string {
  const lines: string[] = [];
  let open = false;
  let fenced = false;
  for (const line of section.trim().split("\n")) {
    if (line.trimStart().startsWith("```")) fenced = !fenced;
    const starts = /^\s*(?:[-*]|\d+\.|#{1,6}) /.test(line);
    const joins = open && !fenced && line.trim() !== "" && !starts;
    if (joins) lines[lines.length - 1] += ` ${line.trim()}`;
    else lines.push(line);
    open =
      !fenced &&
      line.trim() !== "" &&
      !line.trimStart().startsWith("```") &&
      !/^#{1,6} /.test(line);
  }
  return `${lines.join("\n")}\n`;
}

/** The commit a tag points at, through an annotated tag; undefined when there's no such tag. */
async function taggedCommit(tag: string): Promise<string | undefined> {
  const result = await run("gh", ["api", `repos/{owner}/{repo}/git/ref/tags/${tag}`]);
  if (result.code !== 0) {
    if (/HTTP 404/.test(result.stderr)) return undefined;
    throw new Error(`Can't tell whether ${tag} exists:\n${result.stderr.trim()}`);
  }
  let object = (JSON.parse(result.stdout) as { object: { sha: string; type: string } }).object;
  while (object.type === "tag") {
    const tagObject = await runOrThrow("gh", [
      "api",
      `repos/{owner}/{repo}/git/tags/${object.sha}`,
    ]);
    object = (JSON.parse(tagObject.stdout) as { object: typeof object }).object;
  }
  return object.sha;
}

/**
 * Tags the commit the dry run checked `v<version>` and writes its GitHub release from the
 * changelog section. Prereleases are marked so. Runs after publishing, in the release workflow or
 * by hand with `gh` signed in. Safe to run again: a release that's already there is left alone,
 * and a tag on another commit stops it.
 */
export async function createGitHubRelease(options: {
  readonly version: string;
  readonly manifestFile?: string;
  readonly log?: (line: string) => void;
}): Promise<void> {
  const { version, log = console.log } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  if (!manifest) throw new Error("No dry-run manifest. Get the release run's `release` artifact.");
  if (manifest.version !== version) {
    throw new Error(`The dry run checked ${manifest.version}, not ${version}`);
  }
  const { commit } = manifest;
  const tag = releaseTag(version);

  const tagged = await taggedCommit(tag);
  if (tagged !== undefined && tagged !== commit) {
    throw new Error(
      `${tag} already points at ${tagged}, not ${commit}, the commit the dry run checked`,
    );
  }
  if ((await run("gh", ["release", "view", tag, "--json", "tagName"])).code === 0) {
    log(`The ${tag} release is already on GitHub, at ${commit}; leaving it.`);
    return;
  }

  // The notes come from the released commit, whatever is checked out.
  const changelog = (await runOrThrow("git", ["show", `${commit}:CHANGELOG.md`])).stdout;
  const section = changelogSection(changelog, version);
  if (!section) throw new Error(`CHANGELOG.md at ${commit} has no notes for ${version}`);

  const directory = await mkdtemp(join(tmpdir(), "moltenship-release-notes-"));
  try {
    const notes = join(directory, "notes.md");
    await writeFile(notes, releaseNotes(section));
    const args = ["release", "create", tag, "--title", version, "--notes-file", notes];
    // An existing tag stays where it is; otherwise GitHub makes it at the dry run's commit.
    args.push(...(tagged === undefined ? ["--target", commit] : ["--verify-tag"]));
    if (prerelease(version) !== null) args.push("--prerelease");
    const { stdout } = await runOrThrow("gh", args);
    log(`Tagged ${commit} ${tag} and wrote the GitHub release: ${stdout.trim()}`);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

runMain(import.meta, async () => {
  const { flags } = parseArguments(process.argv.slice(2), [], ["version", "manifest"]);
  const value = (key: string) =>
    typeof flags.get(key) === "string" ? (flags.get(key) as string) : undefined;
  const version = value("version");
  if (!version) {
    throw new Error("Usage: vp run release:github --version <version> [--manifest <path>]");
  }
  // Another run's manifest, such as the `release` artifact of a release run.
  await createGitHubRelease({ version, manifestFile: value("manifest") });
});
