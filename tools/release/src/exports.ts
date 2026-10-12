import { readFile } from "node:fs/promises";

import { checkPackage, createPackageFromTarballData } from "@arethetypeswrong/core";
import { problemAffectsResolutionKind } from "@arethetypeswrong/core/problems";
import { publint } from "publint";
import { formatMessage } from "publint/utils";

import { facadePackage, optionalAdapters } from "./config";
import { withPackedPackages, type PackedTarball } from "./pack";
import { parseArguments, runMain } from "./workspace";

/** The packages are ESM-only, so only the ESM resolutions count, like attw's `esm-only` profile. */
const esmResolutionKinds = ["node16-esm", "bundler"] as const;

const adapterSpecifier = new RegExp(
  `["'\`](${optionalAdapters.map((name) => name.replace(/[/.]/g, "\\$&")).join("|")})`,
);

/** Problems with one packed tarball: publint, are-the-types-wrong, LICENSE, and adapter imports. */
export async function tarballProblems(path: string): Promise<string[]> {
  const bytes = await readFile(path);
  const problems: string[] = [];

  const { messages, pkg } = await publint({
    pack: { tarball: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) },
    strict: true,
    level: "warning",
  });
  for (const message of messages) {
    problems.push(`publint: ${formatMessage(message, pkg, { color: false }) ?? message.code}`);
  }

  const archive = createPackageFromTarballData(new Uint8Array(bytes));
  const analysis = await checkPackage(archive);
  if (!analysis.types) {
    problems.push("are-the-types-wrong: the package has no types");
  } else {
    for (const problem of analysis.problems) {
      if (
        esmResolutionKinds.some((kind) => problemAffectsResolutionKind(problem, kind, analysis))
      ) {
        problems.push(`are-the-types-wrong: ${problem.kind} ${JSON.stringify(problem)}`);
      }
    }
  }

  const root = `/node_modules/${archive.packageName}`;
  const files = archive.listFiles(root).map((file) => file.slice(root.length + 1));
  if (!files.includes("LICENSE")) problems.push("the tarball has no LICENSE");

  // Base packages must work without the optional adapters. The facade re-exports the pointer
  // adapter; the clean-consumer check proves it tree-shakes away.
  const isAdapter = optionalAdapters.some((name) => archive.packageName.startsWith(name));
  if (!isAdapter && archive.packageName !== facadePackage) {
    const manifest = JSON.parse(archive.readFile(`${root}/package.json`)) as {
      readonly dependencies?: Record<string, string>;
      readonly peerDependencies?: Record<string, string>;
    };
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      if (optionalAdapters.some((name) => dependency.startsWith(name))) {
        problems.push(`depends on the optional adapter ${dependency}`);
      }
    }
    for (const file of files.filter((name) => /\.(c|m)?js$|\.d\.(c|m)?ts$/.test(name))) {
      const match = adapterSpecifier.exec(archive.readFile(`${root}/${file}`));
      if (match) problems.push(`${file} imports the optional adapter ${match[1]}`);
    }
  }
  return problems;
}

/** Throws when any tarball has a problem. */
export async function checkTarballs(tarballs: readonly PackedTarball[]): Promise<void> {
  const failures: string[] = [];
  for (const tarball of tarballs) {
    const problems = await tarballProblems(tarball.path);
    console.log(`${tarball.name}: ${problems.length === 0 ? "ok" : `${problems.length} problems`}`);
    for (const problem of problems) failures.push(`${tarball.name}: ${problem}`);
  }
  if (failures.length > 0) throw new Error(`Export checks failed:\n- ${failures.join("\n- ")}`);
}

runMain(import.meta, async () => {
  parseArguments(process.argv.slice(2));
  await withPackedPackages(checkTarballs);
  console.log(
    "Export checks passed: publint, are-the-types-wrong (ESM), LICENSE, no adapter in base packages.",
  );
});
