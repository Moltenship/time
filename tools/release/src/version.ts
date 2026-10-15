import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { gt, valid } from "semver";

import { readPublishedPackages, workspaceRoot, type WorkspacePackage } from "./workspace";

/** The release commit's subject, a Conventional Commit as AGENTS.md asks. */
export const releaseSubject = (version: string) => `chore(release): v${version}`;

/** GitHub Actions' bot, which the release workflow commits as. */
export const botName = "github-actions[bot]";
export const botEmail = "41898282+github-actions[bot]@users.noreply.github.com";

const releaseCommitSubject = /^chore\(release\): (?:v\S+|merge v\S+ into main)$/;

/**
 * Whether a commit is one the release workflow pushed: a release commit, or its merge into main.
 * It takes both the bot's address and the subject, so a person's commit titled the same isn't.
 */
export const isReleaseCommit = (subject: string, email: string) =>
  email === botEmail && releaseCommitSubject.test(subject);

/** The one version every published package shares. Throws when they differ. */
export function sharedVersion(packages: readonly WorkspacePackage[]): string {
  const versions = new Set(packages.map(({ manifest }) => manifest.version));
  if (versions.size !== 1) {
    const list = packages.map(({ manifest }) => `${manifest.name}@${manifest.version}`).join(", ");
    throw new Error(`Published packages must share one version until after 1.0: ${list}`);
  }
  return [...versions][0]!;
}

/** Throws unless `version` is a plain semver version, such as `1.0.0` or `1.0.0-rc.1`. */
export function assertVersion(version: string): void {
  if (valid(version) !== version) {
    throw new Error(`"${version}" isn't a semver version such as 1.0.0 or 1.0.0-rc.1`);
  }
}

/**
 * Sets the version of every published package, and returns the manifests it wrote, from the
 * root. The release notes come from the commits, so nothing else changes (releasing.md).
 */
export async function setVersion(version: string, root = workspaceRoot): Promise<string[]> {
  assertVersion(version);
  const packages = await readPublishedPackages(root);
  const current = sharedVersion(packages);
  if (!gt(version, current))
    throw new Error(`${version} must be greater than the current ${current}`);

  const written: string[] = [];
  for (const entry of packages) {
    const path = join(entry.path, "package.json");
    const manifest = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    manifest.version = version;
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
    written.push(join("packages", entry.directory, "package.json"));
  }
  return written;
}
