import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { prerelease, valid, validRange } from "semver";

import { releaseDirectory } from "./config";
import { integrityOf, tarballDirectory } from "./pack";
import { gitState, tarballName, workspaceRoot } from "./workspace";

export const manifestPath = join(workspaceRoot, releaseDirectory, "manifest.json");

/** Where the dry run builds the registry for the packed version. */
export const registryDirectory = join(workspaceRoot, releaseDirectory, "registry");

/** What a passing dry run vouches for. The publish step trusts nothing else. */
export interface ReleaseManifest {
  readonly status: "passed";
  readonly version: string;
  readonly commit: string;
  /** Whether the working tree was clean at the start and end of the dry run. */
  readonly clean: boolean;
  readonly createdAt: string;
  readonly checks: readonly string[];
  /** In publish order: dependencies first. */
  readonly packages: readonly {
    readonly name: string;
    readonly file: string;
    readonly integrity: string;
  }[];
  /** The registry JSON built for this version (#43), in `.release/registry`. Not published to npm. */
  readonly registry?: readonly { readonly file: string; readonly integrity: string }[];
}

export async function writeManifest(manifest: ReleaseManifest, path = manifestPath): Promise<void> {
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function removeManifest(path = manifestPath): Promise<void> {
  await rm(path, { force: true });
}

export async function readManifest(path = manifestPath): Promise<ReleaseManifest | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as ReleaseManifest;
  } catch {
    return undefined;
  }
}

export interface PublishState {
  readonly manifest: ReleaseManifest | undefined;
  /** The version the publisher asked for. */
  readonly version: string;
  readonly head: string;
  readonly clean: boolean;
  /**
   * Whether HEAD is on `origin/main`, or right on top of it: the release commit, which
   * `vp run release` pushes after publishing.
   */
  readonly onMain: boolean;
  /** The packages that should publish, by name. */
  readonly expectedPackages: readonly string[];
  /** Current integrity of each tarball file in the manifest; undefined when the file is missing. */
  readonly tarballIntegrity: Readonly<Record<string, string | undefined>>;
}

/** Every reason not to publish. An empty list means the dry run vouches for exactly this release. */
export function publishProblems(state: PublishState): string[] {
  const problems: string[] = [];
  if (valid(state.version) !== state.version)
    problems.push(`"${state.version}" isn't a semver version`);
  if (state.version === "0.0.0")
    problems.push("0.0.0 is the unreleased placeholder; vp run release <version> sets a version");
  const { manifest } = state;
  if (!manifest) {
    problems.push("No dry-run manifest. vp run release runs the gate, which writes one.");
    return problems;
  }
  if (manifest.status !== "passed") problems.push("The dry run didn't pass");
  if (manifest.version !== state.version) {
    problems.push(`The dry run checked ${manifest.version}, not ${state.version}`);
  }
  if (manifest.commit !== state.head) {
    problems.push(`The dry run checked commit ${manifest.commit}, but HEAD is ${state.head}`);
  }
  if (!manifest.clean) problems.push("The dry run ran on a working tree with changes");
  if (!state.clean) problems.push("The working tree has changes");
  if (!state.onMain)
    problems.push("HEAD isn't on origin/main or right on top of it. Release from main.");
  const names = manifest.packages.map(({ name }) => name);
  const missing = state.expectedPackages.filter((name) => !names.includes(name));
  const extra = names.filter((name) => !state.expectedPackages.includes(name));
  if (missing.length > 0) problems.push(`The dry run didn't pack ${missing.join(", ")}`);
  if (extra.length > 0)
    problems.push(`The dry run packed unexpected packages: ${extra.join(", ")}`);
  for (const { name, file, integrity } of manifest.packages) {
    if (file !== tarballName(name, manifest.version))
      problems.push(`${file} isn't the tarball of ${name}`);
    const current = state.tarballIntegrity[file];
    if (current === undefined) problems.push(`${file} is missing`);
    else if (current !== integrity) problems.push(`${file} changed after the dry run`);
  }
  return problems;
}

/** Current integrity of each file; undefined when it's missing. */
async function currentIntegrity(
  files: readonly string[],
  directory: string,
): Promise<Record<string, string | undefined>> {
  const entries = await Promise.all(
    files.map(async (file) => {
      const path = join(directory, file);
      const exists = await access(path).then(
        () => true,
        () => false,
      );
      return [file, exists ? await integrityOf(path) : undefined] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** Current integrity of each tarball the manifest lists. */
export function tarballIntegrity(
  manifest: ReleaseManifest | undefined,
  directory = tarballDirectory,
): Promise<Record<string, string | undefined>> {
  return currentIntegrity(
    (manifest?.packages ?? []).map(({ file }) => file),
    directory,
  );
}

/** The dry run's files that are missing or changed since it hashed them, as `tarballs/<file>`. */
export async function changedArtifacts(
  manifest: ReleaseManifest,
  directories = { tarballs: tarballDirectory, registry: registryDirectory },
): Promise<string[]> {
  const listed = [
    ["tarballs", manifest.packages],
    ["registry", manifest.registry ?? []],
  ] as const;
  const changed = await Promise.all(
    listed.map(async ([kind, files]) => {
      const current = await currentIntegrity(
        files.map(({ file }) => file),
        directories[kind],
      );
      return files
        .filter(({ file, integrity }) => current[file] !== integrity)
        .map(({ file }) => `${kind}/${file}`);
    }),
  );
  return changed.flat();
}

/**
 * The manifest of a passing dry run of `HEAD`, whose tarballs and registry files are still the
 * ones it checked. Everything that uses the release artifacts starts here, so nothing packs twice.
 */
export async function readCheckedManifest({
  path = manifestPath,
  directories,
}: {
  readonly path?: string;
  readonly directories?: Parameters<typeof changedArtifacts>[1];
} = {}): Promise<ReleaseManifest> {
  const manifest = await readManifest(path);
  if (!manifest) throw new Error("No dry-run manifest. Run vp run release:dry-run first.");
  const { head } = await gitState();
  if (manifest.commit !== head) {
    throw new Error(
      `The dry run checked commit ${manifest.commit}, but HEAD is ${head}. Run it again.`,
    );
  }
  const changed = await changedArtifacts(manifest, directories);
  if (changed.length > 0) {
    throw new Error(`Changed after the dry run: ${changed.join(", ")}. Run it again.`);
  }
  return manifest;
}

/** Prereleases go to `next`, so `npm install` keeps getting the last stable version. */
export function distTag(version: string, requested?: string): string {
  const isPrerelease = prerelease(version) !== null;
  const tag = requested ?? (isPrerelease ? "next" : "latest");
  if (!/^[a-z][a-z0-9._-]*$/i.test(tag))
    throw new Error(`"${tag}" isn't a dist-tag such as next or beta`);
  if (validRange(tag)) throw new Error(`The dist-tag "${tag}" looks like a version range`);
  if (isPrerelease && tag === "latest") {
    throw new Error(`A prerelease (${version}) can't take the latest tag`);
  }
  return tag;
}
