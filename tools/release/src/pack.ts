import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { releaseDirectory } from "./config";
import {
  publishedEntryPoints,
  readPublishedPackages,
  runOrThrow,
  tarballName,
  workspaceRoot,
  type WorkspacePackage,
} from "./workspace";

export interface PackedTarball {
  readonly name: string;
  readonly version: string;
  readonly directory: string;
  /** Absolute path to the tarball. */
  readonly path: string;
  readonly file: string;
  /** `sha512-<base64>`, the same form npm records. */
  readonly integrity: string;
}

export const tarballDirectory = join(workspaceRoot, releaseDirectory, "tarballs");

export async function integrityOf(path: string): Promise<string> {
  return `sha512-${createHash("sha512")
    .update(await readFile(path))
    .digest("base64")}`;
}

/**
 * Packs every published package with pnpm, which applies `publishConfig`, swaps `workspace:*` for
 * real versions and adds the root LICENSE. Expects the packages to be built. Empties `destination`
 * first, so no stale tarball survives.
 */
export async function packPublishedPackages(
  packages: readonly WorkspacePackage[],
  destination = tarballDirectory,
): Promise<PackedTarball[]> {
  for (const entry of packages) {
    for (const file of publishedEntryPoints(entry.manifest).values()) {
      await access(join(entry.path, file)).catch(() => {
        throw new Error(`${entry.manifest.name}: ${file} is missing. Build the packages first.`);
      });
    }
  }
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });

  const tarballs: PackedTarball[] = [];
  for (const entry of packages) {
    await runOrThrow("vp", ["pm", "pack", "--pack-destination", destination], { cwd: entry.path });
    const { name, version } = entry.manifest;
    const file = tarballName(name, version);
    const path = join(destination, file);
    tarballs.push({
      name,
      version,
      directory: entry.directory,
      path,
      file,
      integrity: await integrityOf(path),
    });
  }
  return tarballs;
}

/**
 * Packs the published packages into a temporary folder for one check, then removes it. Checks run
 * on their own use this, so `.release/tarballs` only ever holds what the dry run packed.
 */
export async function withPackedPackages<T>(
  action: (tarballs: PackedTarball[]) => Promise<T>,
): Promise<T> {
  const destination = await mkdtemp(join(tmpdir(), "moltenship-tarballs-"));
  try {
    return await action(await packPublishedPackages(await readPublishedPackages(), destination));
  } finally {
    await rm(destination, { force: true, recursive: true });
  }
}
