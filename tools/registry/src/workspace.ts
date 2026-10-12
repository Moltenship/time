import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

import { valid, validRange } from "semver";
import { parse } from "yaml";

import { registrySourcePackage } from "./config";

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly dependencies?: Record<string, string>;
}

export interface WorkspacePackages {
  /** The npm range an item declares for each package registry source may import. */
  readonly ranges: ReadonlyMap<string, string>;
  /** The version of each workspace package, which the ranges above were made from. */
  readonly versions: ReadonlyMap<string, string>;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readWorkspaceVersions(workspaceRoot: string): Promise<Map<string, string>> {
  const versions = new Map<string, string>();
  const entries = await readdir(join(workspaceRoot, "packages"), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const manifest = await readJson<PackageManifest>(
        join(workspaceRoot, "packages", entry.name, "package.json"),
      );
      versions.set(manifest.name, manifest.version);
    } catch {
      // A folder without a package manifest is not a package.
    }
  }
  return versions;
}

/** `1.2.3` becomes `^1.2.3`; a range such as `^2.0.3` stays as written. */
function caretRange(name: string, version: string): string {
  if (valid(version)) return `^${version}`;
  if (validRange(version)) return version;
  throw new Error(`${name}: "${version}" is not a version or a semver range`);
}

/**
 * The range of each package `registry/package.json` declares, from what the workspace builds and
 * tests the registry source with: the catalog for third-party packages and the package version for
 * our own. Items list bare names, and the build adds the range to ours. A package missing there
 * can't be imported by registry source, so it can't be an item's dependency either.
 */
export async function readWorkspacePackages(workspaceRoot: string): Promise<WorkspacePackages> {
  const workspace = parse(await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8")) as {
    readonly catalog?: Record<string, string>;
  };
  const catalog = workspace.catalog ?? {};
  const versions = await readWorkspaceVersions(workspaceRoot);
  const source = await readJson<PackageManifest>(join(workspaceRoot, registrySourcePackage));
  const ranges = new Map<string, string>();

  for (const [name, specifier] of Object.entries(source.dependencies ?? {})) {
    if (specifier === "catalog:") {
      const version = catalog[name];
      if (!version) throw new Error(`${name} uses catalog: but the catalog has no entry for it`);
      ranges.set(name, caretRange(name, version));
    } else if (specifier.startsWith("workspace:")) {
      const version = versions.get(name);
      if (!version)
        throw new Error(`${name} is a workspace dependency but no package has that name`);
      ranges.set(name, caretRange(name, version));
    } else {
      ranges.set(name, caretRange(name, specifier));
    }
  }

  return { ranges, versions };
}
