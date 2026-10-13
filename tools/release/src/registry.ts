import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";

import { satisfies } from "semver";

import { facadePackage } from "./config";
import { registryDirectory } from "./manifest";
import { integrityOf, type PackedTarball } from "./pack";
import { readJson, runOrThrow } from "./workspace";

/** The parts of the registry's `compatibility.json` (#43) the release checks read. */
export interface RegistryCompatibility {
  readonly runtime: Readonly<Record<string, string>>;
  readonly items: readonly {
    readonly name: string;
    readonly compatibility: Readonly<Record<string, string>>;
    readonly dependencies: readonly string[];
  }[];
}

/**
 * Ways the built registry would install something other than the packed release: a runtime
 * version that isn't the packed one, or an item whose compatibility range or dependency range
 * leaves it out.
 */
export function registryProblems(
  registry: RegistryCompatibility,
  versions: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  if (!(facadePackage in registry.runtime)) {
    problems.push(
      `the registry names no ${facadePackage} version, so nothing ties it to the release`,
    );
  }
  for (const [name, version] of Object.entries(registry.runtime)) {
    const packed = versions.get(name);
    if (packed === undefined) problems.push(`the registry needs ${name}, which doesn't publish`);
    else if (packed !== version)
      problems.push(`the registry is built for ${name}@${version}, not ${packed}`);
  }
  for (const item of registry.items) {
    const ranges = [
      ...Object.entries(item.compatibility),
      ...item.dependencies.flatMap((dependency) => {
        const match = /^(@moltenship\/[^@]+)@(.+)$/.exec(dependency);
        return match ? [[match[1]!, match[2]!] as const] : [];
      }),
    ];
    for (const [name, range] of ranges) {
      const packed = versions.get(name);
      if (packed !== undefined && !satisfies(packed, range, { includePrerelease: true })) {
        problems.push(`${item.name} asks for ${name}@${range}, which ${packed} doesn't satisfy`);
      }
    }
  }
  return problems;
}

export interface RegistryArtifact {
  readonly file: string;
  readonly integrity: string;
}

/**
 * Builds the registry into `.release/registry` with #43's build (which runs its own checks), then
 * checks it asks for the versions the dry run packed.
 */
export async function buildRegistry(
  tarballs: readonly PackedTarball[],
): Promise<RegistryArtifact[]> {
  await rm(registryDirectory, { force: true, recursive: true });
  await runOrThrow("vp", ["run", "registry#site", "--out", registryDirectory], { inherit: true });
  const registry = await readJson<RegistryCompatibility>(
    join(registryDirectory, "compatibility.json"),
  );
  const problems = registryProblems(
    registry,
    new Map(tarballs.map(({ name, version }) => [name, version])),
  );
  if (problems.length > 0)
    throw new Error(`The registry doesn't match the release:\n- ${problems.join("\n- ")}`);
  const files = (await readdir(registryDirectory)).filter((file) => file.endsWith(".json")).sort();
  console.log(
    `Registry: ${registry.items.length} items for ${Object.entries(registry.runtime)
      .map(([name, version]) => `${name}@${version}`)
      .join(", ")}`,
  );
  return Promise.all(
    files.map(async (file) => ({
      file,
      integrity: await integrityOf(join(registryDirectory, file)),
    })),
  );
}
