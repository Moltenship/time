import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { publishedPackages, type SizeBudget } from "./config";
import {
  parseArguments,
  publishedEntryPoints,
  readPublishedPackages,
  runMain,
  type WorkspacePackage,
} from "./workspace";

export interface SizeMeasurement {
  readonly name: string;
  readonly subpath: string;
  readonly file: string;
  readonly raw: number;
  readonly gzip: number;
  readonly budget?: SizeBudget;
}

/** Measures every published entry point's emitted ESM. */
export async function measureSizes(
  packages: readonly WorkspacePackage[],
): Promise<SizeMeasurement[]> {
  const measurements: SizeMeasurement[] = [];
  for (const entry of packages) {
    const entryPoints = publishedEntryPoints(entry.manifest);
    if (entryPoints.size === 0) {
      throw new Error(`${entry.manifest.name} has no entry point in publishConfig.exports`);
    }
    for (const [subpath, file] of entryPoints) {
      let bytes: Buffer;
      try {
        bytes = await readFile(join(entry.path, file));
      } catch {
        throw new Error(`${entry.manifest.name}: ${file} is missing. Build the packages first.`);
      }
      measurements.push({
        name: entry.manifest.name,
        subpath,
        file,
        raw: bytes.byteLength,
        gzip: gzipSync(bytes, { level: 9 }).byteLength,
        budget: entry.budgets[subpath],
      });
    }
  }
  return measurements;
}

/** Entry points over budget, or without one. */
export function sizeFailures(measurements: readonly SizeMeasurement[]): string[] {
  return measurements.flatMap(({ name, subpath, raw, gzip, budget }) => {
    const label = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
    if (!budget) return [`${label} has no size budget in tools/release/src/config.ts`];
    const failures: string[] = [];
    if (raw > budget.raw)
      failures.push(`${label} is ${raw} bytes raw, over its ${budget.raw} budget`);
    if (gzip > budget.gzip)
      failures.push(`${label} is ${gzip} bytes gzip, over its ${budget.gzip} budget`);
    return failures;
  });
}

export function formatSizes(measurements: readonly SizeMeasurement[]): string {
  const rows = measurements.map(({ name, subpath, raw, gzip, budget }) => {
    const label = subpath === "." ? name : `${name}/${subpath.slice(2)}`;
    const share = (value: number, limit?: number) =>
      limit ? `${value}/${limit} (${Math.round((value / limit) * 100)}%)` : `${value}/none`;
    return `${label.padEnd(34)} raw ${share(raw, budget?.raw).padEnd(24)} gzip ${share(gzip, budget?.gzip)}`;
  });
  return rows.join("\n");
}

/** Throws when an entry point is over budget. */
export async function checkSizes(packages: readonly WorkspacePackage[]): Promise<void> {
  const measurements = await measureSizes(packages);
  console.log(formatSizes(measurements));
  const failures = sizeFailures(measurements);
  if (failures.length > 0) throw new Error(`Size budgets failed:\n- ${failures.join("\n- ")}`);
}

runMain(import.meta, async () => {
  // Directory names narrow the check, as engine:build does for the two engine packages.
  const { positionals } = parseArguments(process.argv.slice(2), [], [], { positionals: true });
  const unknown = positionals.filter(
    (name) => !publishedPackages.some(({ directory }) => directory === name),
  );
  if (unknown.length > 0) throw new Error(`Not published packages: ${unknown.join(", ")}`);
  const packages = (await readPublishedPackages()).filter(
    ({ directory }) => positionals.length === 0 || positionals.includes(directory),
  );
  await checkSizes(packages);
  console.log("Size budgets passed.");
});
