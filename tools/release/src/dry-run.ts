import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { checkApiReports } from "./api";
import { checkConsumer } from "./consumer";
import { checkTarballs } from "./exports";
import { manifestPath, removeManifest, writeManifest } from "./manifest";
import { packPublishedPackages, type PackedTarball } from "./pack";
import { buildRegistry } from "./registry";
import { checkSizes } from "./size";
import { changelogPath, changelogSection, sharedVersion } from "./version";
import {
  gitState,
  parseArguments,
  readPublishedPackages,
  runMain,
  runOrThrow,
  workspaceRoot,
} from "./workspace";

async function step<T>(name: string, action: () => Promise<T>): Promise<T> {
  console.log(`\n▶ ${name}`);
  const started = performance.now();
  const result = await action();
  console.log(`✓ ${name} (${((performance.now() - started) / 1000).toFixed(1)}s)`);
  return result;
}

/**
 * Builds every published artifact from scratch, runs every release check on it, and writes a
 * manifest the publish step requires. Offline: nothing here talks to the npm registry.
 */
export async function dryRun({
  version: requested,
  requestedFrom = "flag",
  manifestFile = manifestPath,
  requireClean = false,
}: {
  readonly version?: string;
  /** Where the version came from, for the error message. */
  readonly requestedFrom?: "flag" | "env";
  readonly manifestFile?: string;
  /** Fail on a working tree with changes, as a release must. Without it, the manifest records them. */
  readonly requireClean?: boolean;
} = {}): Promise<void> {
  // A failed run must not leave an older passing manifest behind.
  await removeManifest(manifestFile);
  const start = await gitState();
  if (requireClean && !start.clean) {
    throw new Error(
      `The working tree has changes, and a release needs a clean one:\n${start.status}`,
    );
  }
  const packages = await readPublishedPackages();
  const checks: string[] = [];
  const record = async <T>(name: string, action: () => Promise<T>) => {
    const result = await step(name, action);
    checks.push(name);
    return result;
  };

  const version = await record("versions", async () => {
    const shared = sharedVersion(packages);
    if (requested !== undefined && requested !== shared) {
      const source = requestedFrom === "env" ? " (from RELEASE_VERSION)" : "";
      throw new Error(
        `The packages are at ${shared}, not ${requested}${source}. Run vp run release:version ${requested} first.`,
      );
    }
    if (shared !== "0.0.0" && !changelogSection(await readFile(changelogPath, "utf8"), shared)) {
      throw new Error(`CHANGELOG.md has no notes for ${shared}`);
    }
    console.log(`${packages.length} packages at ${shared}`);
    return shared;
  });

  await record("build", async () => {
    for (const entry of packages) {
      await runOrThrow("vp", ["run", "--no-cache", `${entry.manifest.name}#build`], {
        inherit: true,
      });
    }
  });
  await record("size", () => checkSizes(packages));
  await record("api", () => checkApiReports(packages));
  const tarballs: PackedTarball[] = await record("pack", () => packPublishedPackages(packages));
  await record("exports", () => checkTarballs(tarballs));
  await record("consumer", () => checkConsumer(tarballs));
  // The registry (#43): its schema smoke, then a build for the packed version into
  // .release/registry. Its install test needs the network, so it runs on its own afterwards:
  // vp run release:registry-e2e.
  const registry = await record("registry", async () => {
    await runOrThrow("vp", ["run", "--no-cache", "registry:smoke"], { inherit: true });
    return buildRegistry(tarballs);
  });

  const end = await gitState();
  if (end.head !== start.head)
    throw new Error(`HEAD moved during the dry run: ${start.head} → ${end.head}`);
  if (start.clean && !end.clean)
    throw new Error(`The dry run changed tracked files:\n${end.status}`);

  await writeManifest(
    {
      status: "passed",
      version,
      commit: start.head,
      clean: start.clean && end.clean,
      createdAt: new Date().toISOString(),
      checks,
      packages: tarballs.map(({ name, file, integrity }) => ({ name, file, integrity })),
      registry,
    },
    manifestFile,
  );
  console.log(`\nDry run passed for ${version} at ${start.head.slice(0, 12)}.`);
  console.log(`Wrote ${relative(workspaceRoot, manifestFile)}.`);
  if (!start.clean)
    console.log("The working tree had changes, so the publish step won't accept this run.");
}

/**
 * The version a dry run checks: `--version` first, else `RELEASE_VERSION`, which the release
 * workflow sets for `release:gate`, whose lane runs the dry run without arguments. Neither means
 * "whatever the manifests say".
 */
export function requestedVersion(
  flag: string | true | undefined,
  environment: string | undefined,
): { readonly version?: string; readonly requestedFrom: "flag" | "env" } {
  if (typeof flag === "string") return { version: flag, requestedFrom: "flag" };
  return { version: environment || undefined, requestedFrom: "env" };
}

runMain(import.meta, async () => {
  const { flags } = parseArguments(process.argv.slice(2), ["require-clean"], ["version"]);
  await dryRun({
    ...requestedVersion(flags.get("version"), process.env.RELEASE_VERSION),
    requireClean: flags.has("require-clean"),
  });
});
