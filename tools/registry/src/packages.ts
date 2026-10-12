import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface PackageManifest {
  readonly name: string;
  readonly dependencies?: Record<string, string>;
}

/** Workspace package folders by package name. */
async function workspacePackages(workspaceRoot: string): Promise<Map<string, string>> {
  const packages = new Map<string, string>();
  for (const entry of await readdir(join(workspaceRoot, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = join(workspaceRoot, "packages", entry.name);
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      ) as PackageManifest;
      packages.set(manifest.name, directory);
    } catch {
      // Not a package.
    }
  }
  return packages;
}

/**
 * Builds and packs the runtime packages the registry needs, and the workspace packages they
 * depend on, into `destination`: the tarballs `npm publish` would upload.
 */
export async function packRuntimePackages(
  workspaceRoot: string,
  runtime: readonly string[],
  destination: string,
): Promise<string[]> {
  const packages = await workspacePackages(workspaceRoot);
  const packed: string[] = [];
  const queue = [...runtime];
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (packed.includes(name)) continue;
    const directory = packages.get(name);
    if (!directory) throw new Error(`${name} is not a workspace package`);
    packed.push(name);
    const manifest = JSON.parse(
      await readFile(join(directory, "package.json"), "utf8"),
    ) as PackageManifest;
    queue.push(
      ...Object.keys(manifest.dependencies ?? {}).filter((dependency) => packages.has(dependency)),
    );
  }

  for (const name of packed) {
    const cwd = packages.get(name)!;
    await execFileAsync("vp", ["pack"], { cwd });
    await execFileAsync("vp", ["pm", "pack", "--pack-destination", destination], { cwd });
  }
  return packed.sort();
}
