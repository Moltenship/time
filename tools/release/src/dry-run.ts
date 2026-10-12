import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import { checkApiReports } from "./api";
import { checkConsumer } from "./consumer";
import { checkTarballs } from "./exports";
import { manifestPath, removeManifest, writeManifest } from "./manifest";
import { packPublishedPackages, type PackedTarball } from "./pack";
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
}: { readonly version?: string } = {}): Promise<void> {
  // A failed run must not leave an older passing manifest behind.
  await removeManifest();
  const start = await gitState();
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
      throw new Error(
        `The packages are at ${shared}, not ${requested}. Run vp run release:version ${requested} first.`,
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
  // Hook for #43 (PR #176), which adds `registry:build` (the registry JSON the docs site serves) and
  // `registry:e2e` (`shadcn add` into clean apps against packed packages). Once they are on main,
  // run both here, so the dry run builds the registry for the packed version. Until then, the
  // schema smoke covers the registry items.
  await record("registry", () => runOrThrow("vp", ["run", "registry:smoke"], { inherit: true }));

  const end = await gitState();
  if (end.head !== start.head)
    throw new Error(`HEAD moved during the dry run: ${start.head} → ${end.head}`);
  if (start.clean && !end.clean)
    throw new Error(`The dry run changed tracked files:\n${end.status}`);

  await writeManifest({
    status: "passed",
    version,
    commit: start.head,
    clean: start.clean && end.clean,
    createdAt: new Date().toISOString(),
    checks,
    packages: tarballs.map(({ name, file, integrity }) => ({ name, file, integrity })),
  });
  console.log(`\nDry run passed for ${version} at ${start.head.slice(0, 12)}.`);
  console.log(`Wrote ${relative(workspaceRoot, manifestPath)}.`);
  if (!start.clean)
    console.log("The working tree had changes, so the publish step won't accept this run.");
}

runMain(import.meta, async () => {
  const version = parseArguments(process.argv.slice(2)).flags.get("version");
  await dryRun({ version: typeof version === "string" ? version : undefined });
});
