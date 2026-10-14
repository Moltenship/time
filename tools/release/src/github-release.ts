import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { prerelease } from "semver";

import { manifestPath, readManifest } from "./manifest";
import { changelogSection } from "./version";
import { parseArguments, run, runMain, type RunResult } from "./workspace";

export const releaseTag = (version: string) => `v${version}`;

const fence = /^\s*(```|~~~)/;
/** Lines that stand alone: headings, rules, setext underlines, tables, quotes and HTML. */
const standalone = /^\s*(?:#{1,6} |(?:[-*_]\s*){3,}$|=+\s*$|[|><])/;
const listItem = /^\s*(?:[-*+]|\d+[.)]) /;

/**
 * A changelog section as a GitHub release's notes. The changelog wraps its lines at 100
 * characters, and GitHub shows each line break in a release, so each paragraph and list item
 * becomes one line. Blank lines, fenced code and the lines `standalone` matches stay as they are.
 */
export function releaseNotes(section: string): string {
  const lines: string[] = [];
  let open = false;
  // The marker that opened the fence we're in: only the same one closes it.
  let fenced: string | undefined;
  for (const line of section.trim().split("\n")) {
    const marker = fence.exec(line)?.[1];
    const isFence = marker !== undefined && (fenced === undefined || fenced === marker);
    if (isFence) fenced = fenced === undefined ? marker : undefined;
    const plain = !fenced && !isFence && line.trim() !== "" && !standalone.test(line);
    if (open && plain && !listItem.test(line)) lines[lines.length - 1] += ` ${line.trim()}`;
    else lines.push(line);
    open = plain;
  }
  return `${lines.join("\n")}\n`;
}

/** Runs a command without a shell and resolves with its result; `run` from workspace.ts. */
export type Exec = (command: string, args: readonly string[]) => Promise<RunResult>;

async function orThrow(exec: Exec, command: string, args: readonly string[]): Promise<RunResult> {
  const result = await exec(command, args);
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.code})\n${output}`);
  }
  return result;
}

/** The commit a tag points at, through an annotated tag; undefined when there's no such tag. */
async function taggedCommit(exec: Exec, tag: string): Promise<string | undefined> {
  const result = await exec("gh", ["api", `repos/{owner}/{repo}/git/ref/tags/${tag}`]);
  if (result.code !== 0) {
    if (/HTTP 404/.test(result.stderr)) return undefined;
    throw new Error(`Can't tell whether ${tag} exists:\n${result.stderr.trim()}`);
  }
  let object = (JSON.parse(result.stdout) as { object: { sha: string; type: string } }).object;
  while (object.type === "tag") {
    const tagObject = await orThrow(exec, "gh", [
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
 * by hand with `gh` signed in. Safe to run again: a published release is left alone, while a draft
 * or a tag on another commit stops it.
 */
export async function createGitHubRelease(options: {
  readonly version: string;
  readonly manifestFile?: string;
  readonly exec?: Exec;
  readonly log?: (line: string) => void;
}): Promise<void> {
  const { version, exec = run, log = console.log } = options;
  const manifest = await readManifest(options.manifestFile ?? manifestPath);
  if (!manifest) throw new Error("No dry-run manifest. Get the release run's `release` artifact.");
  if (manifest.status !== "passed") throw new Error("The dry run didn't pass");
  if (manifest.version !== version) {
    throw new Error(`The dry run checked ${manifest.version}, not ${version}`);
  }
  const { commit } = manifest;
  // As the publish step refuses anything else, so does its tag. origin/main as last fetched.
  if ((await exec("git", ["merge-base", "--is-ancestor", commit, "origin/main"])).code !== 0) {
    throw new Error(`${commit} isn't on origin/main. Release from main, after git fetch.`);
  }
  const tag = releaseTag(version);

  const tagged = await taggedCommit(exec, tag);
  if (tagged !== undefined && tagged !== commit) {
    throw new Error(
      `${tag} already points at ${tagged}, not ${commit}, the commit the dry run checked`,
    );
  }
  const existing = await exec("gh", ["release", "view", tag, "--json", "isDraft"]);
  if (existing.code === 0) {
    if ((JSON.parse(existing.stdout) as { isDraft: boolean }).isDraft) {
      throw new Error(`A draft ${tag} release is on GitHub. Publish or delete it, then run again.`);
    }
    log(`The ${tag} release is already on GitHub; leaving it.`);
    return;
  }
  if (!/release not found/i.test(existing.stderr)) {
    throw new Error(`Can't tell whether the ${tag} release exists:\n${existing.stderr.trim()}`);
  }

  // The notes come from the released commit, whatever is checked out.
  const changelog = (await orThrow(exec, "git", ["show", `${commit}:CHANGELOG.md`])).stdout;
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
    const { stdout } = await orThrow(exec, "gh", args);
    log(
      `${tagged === undefined ? `Tagged ${commit} ${tag}` : `${tag} was already at ${commit}`}; wrote the GitHub release: ${stdout.trim()}`,
    );
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
