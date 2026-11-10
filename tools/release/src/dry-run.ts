import { relative } from "node:path";

import { checkApiReports } from "./api";
import { checkConsumer } from "./consumer";
import { checkTarballs } from "./exports";
import { manifestPath, removeManifest, writeManifest } from "./manifest";
import { packPublishedPackages, type PackedTarball } from "./pack";
import { buildRegistry } from "./registry";
import { checkSizes } from "./size";
import { sharedVersion } from "./version";
import {
  gitState,
  parseArguments,
  readPublishedPackages,
  runMain,
  runOrThrow,
  step,
  workspaceRoot,
} from "./workspace";

/**
 * Builds every published artifact from scratch, runs every release check on it, and writes a
 * manifest the publish step requires. Nothing here publishes; the clean consumer installs from
 * the pnpm store, and reads package metadata from npm only when a cold cache lacks it.
 */
export async function dryRun({
  version: requested,
  manifestFile = manifestPath,
  requireClean = false,
}: {
  /** The version the packages must be at; the release workflow sets it through RELEASE_VERSION. */
  readonly version?: string;
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
  const version = await step("versions", async () => {
    const shared = sharedVersion(packages);
    if (requested !== undefined && requested !== shared) {
      throw new Error(`The packages are at ${shared}, not ${requested} (from RELEASE_VERSION).`);
    }
    console.log(`${packages.length} packages at ${shared}`);
    return shared;
  });

  await step("build", async () => {
    for (const entry of packages) {
      await runOrThrow("vp", ["run", "--no-cache", `${entry.manifest.name}#build`], {
        inherit: true,
      });
    }
  });
  await step("size", () => checkSizes(packages));
  await step("api", () => checkApiReports(packages));
  const tarballs: PackedTarball[] = await step("pack", () => packPublishedPackages(packages));
  await step("exports", () => checkTarballs(tarballs));
  await step("consumer", () => checkConsumer(tarballs));
  // The registry (#43), built for the packed version into .release/registry; ci:test runs its
  // tests. What uses the artifacts, its install test included, runs on its own afterwards:
  // vp run release:artifacts.
  const registry = await step("registry", () => buildRegistry(tarballs));

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

runMain(import.meta, async () => {
  const { flags } = parseArguments(process.argv.slice(2), ["require-clean"]);
  await dryRun({
    // Without it, as in CI's release-gate job, the dry run checks the version the manifests have.
    version: process.env.RELEASE_VERSION || undefined,
    requireClean: flags.has("require-clean"),
  });
});
