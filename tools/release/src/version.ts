import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { gt, valid } from "semver";

import {
  parseArguments,
  readPublishedPackages,
  runMain,
  workspaceRoot,
  type WorkspacePackage,
} from "./workspace";

export const changelogPath = join(workspaceRoot, "CHANGELOG.md");
const unreleasedHeading = /^## Unreleased[ \t]*$/m;

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

/** The lines of a changelog section, or undefined when the changelog has no such section. */
export function changelogSection(changelog: string, heading: string): string | undefined {
  const lines = changelog.split("\n");
  const start = lines.findIndex(
    (line) => line.trimEnd() === `## ${heading}` || line.startsWith(`## ${heading} `),
  );
  if (start === -1) return undefined;
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
}

/** Renames "Unreleased" to the version and date, and opens a new empty "Unreleased" above it. */
export function releaseChangelog(changelog: string, version: string, date: string): string {
  if (changelogSection(changelog, version) !== undefined) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  const notes = changelogSection(changelog, "Unreleased");
  if (notes === undefined) throw new Error('CHANGELOG.md has no "## Unreleased" section');
  if (notes === "") throw new Error('CHANGELOG.md has nothing under "## Unreleased" to release');
  return changelog.replace(unreleasedHeading, `## Unreleased\n\n## ${version} (${date})`);
}

/** Sets the version of every published package and releases the changelog's "Unreleased" notes. */
export async function setVersion(version: string, date: string): Promise<void> {
  assertVersion(version);
  const packages = await readPublishedPackages();
  const current = sharedVersion(packages);
  if (!gt(version, current))
    throw new Error(`${version} must be greater than the current ${current}`);

  const changelog = releaseChangelog(await readFile(changelogPath, "utf8"), version, date);
  for (const entry of packages) {
    const path = join(entry.path, "package.json");
    const text = await readFile(path, "utf8");
    const manifest = JSON.parse(text) as Record<string, unknown>;
    manifest.version = version;
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  await writeFile(changelogPath, changelog);
  console.log(
    `Set ${packages.length} packages to ${version} and released the changelog's Unreleased notes.`,
  );
}

runMain(import.meta, async () => {
  const { flags, positionals } = parseArguments(process.argv.slice(2), [], ["date"], {
    positionals: true,
  });
  const [version] = positionals;
  if (!version || positionals.length > 1) {
    throw new Error("Usage: vp run release:version <version> [--date YYYY-MM-DD]");
  }
  const date =
    typeof flags.get("date") === "string"
      ? (flags.get("date") as string)
      : new Date().toISOString().slice(0, 10);
  await setVersion(version, date);
});
