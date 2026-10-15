import { generate } from "changelogithub";
import { inc, major, prerelease } from "semver";

import { run } from "./workspace";

/** What the version suggestion reads from a Conventional Commit. */
export interface ConventionalCommit {
  readonly type: string;
  readonly isBreaking: boolean;
}

export interface VersionSuggestion {
  readonly version: string;
  /** One line on why, for the prompt. */
  readonly reason: string;
  /** Other versions worth offering, after the suggestion. */
  readonly alternatives: readonly string[];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The next version after `current`, from the commits since its release. A prerelease moves to the
 * next one (`1.0.0-rc.1` → `1.0.0-rc.2`), with its stable version offered beside it. A stable
 * version takes a major bump for a breaking change, a minor one for a feature and a patch for the
 * rest; before 1.0, a breaking change takes a minor one.
 */
export function suggestVersion(
  current: string,
  commits: readonly ConventionalCommit[],
): VersionSuggestion {
  const breaking = commits.filter(({ isBreaking }) => isBreaking).length;
  const features = commits.filter(({ type, isBreaking }) => type === "feat" && !isBreaking).length;
  const counted = [
    breaking > 0 ? plural(breaking, "breaking change") : undefined,
    features > 0 ? plural(features, "feature") : undefined,
    plural(commits.length - breaking - features, "other commit"),
  ].filter(Boolean);
  const since = `${counted.join(", ")} since ${current}`;

  if (prerelease(current) !== null) {
    const stable = inc(current, "patch")!;
    return {
      version: inc(current, "prerelease")!,
      reason: `${since}; the next prerelease, or ${stable} when it's ready`,
      alternatives: [stable],
    };
  }
  const level =
    breaking > 0 ? (major(current) === 0 ? "minor" : "major") : features > 0 ? "minor" : "patch";
  const levels = ["patch", "minor", "major"] as const;
  return {
    version: inc(current, level)!,
    reason: `${since}: a ${level} release`,
    alternatives: [
      ...levels.filter((other) => other !== level).map((other) => inc(current, other)!),
      inc(current, `pre${level}`, "rc", "1")!,
    ],
  };
}

/**
 * The newest `v*` tag reachable from `ref`, leaving out `exclude`; undefined when there is none.
 */
export async function previousTag(ref: string, exclude?: string): Promise<string | undefined> {
  const args = ["describe", "--tags", "--abbrev=0", "--match", "v*"];
  if (exclude) args.push("--exclude", exclude);
  const result = await run("git", [...args, ref]);
  return result.code === 0 ? result.stdout.trim() : undefined;
}

/** The Conventional Commits from `from` (a tag) to `to`, parsed as the release notes see them. */
export async function commitsBetween(
  from: string,
  to: string,
): Promise<readonly ConventionalCommit[]> {
  const { commits } = await generate({ from, to, contributors: false, dry: true });
  return commits;
}

/**
 * A GitHub release's first notes, by changelogithub from the Conventional Commits between two
 * refs: breaking changes, features, fixes and performance, grouped by scope, each with its PR and
 * author. With a GitHub token it finds authors' logins; without one it names them. `/release`
 * rewrites them into the notes people read (.claude/skills/release/SKILL.md).
 */
export async function generateNotes(options: {
  readonly from: string;
  readonly to: string;
  readonly token?: string;
}): Promise<string> {
  const { output } = await generate({
    from: options.from,
    to: options.to,
    token: options.token,
    contributors: true,
    dry: true,
  });
  return `${output.trim()}\n`;
}
