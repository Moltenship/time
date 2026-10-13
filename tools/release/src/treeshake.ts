import { join } from "node:path";

import { build } from "esbuild";

import { facadePackage, optionalFeatures, type OptionalFeature } from "./config";
import {
  parseArguments,
  publishedEntryPoints,
  readPublishedPackages,
  runMain,
  workspaceRoot,
} from "./workspace";

/** Each published package resolved to its built ESM entry, as npm will ship it. */
async function builtEntries(): Promise<Record<string, string>> {
  const entries: Record<string, string> = {};
  for (const entry of await readPublishedPackages()) {
    const file = publishedEntryPoints(entry.manifest).get(".");
    if (file) entries[entry.manifest.name] = join(entry.path, file);
  }
  return entries;
}

/** Bundles `contents` with esbuild, minified, React left out; returns the code and its exports. */
async function bundle(contents: string, alias: Record<string, string>) {
  const result = await build({
    alias,
    bundle: true,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    minify: true,
    platform: "browser",
    stdin: { contents, loader: "js", resolveDir: workspaceRoot },
    write: false,
  });
  const [output] = Object.values(result.metafile.outputs);
  return { code: result.outputFiles[0]!.text, exports: output?.exports ?? [] };
}

/**
 * Bundles some of the facade's exports from source, unminified, as if every module had side
 * effects (`sideEffects: false` and annotations ignored), so a statement left at a module's top
 * level stays. Returns each file's code in the output, from the repository root, by the comment
 * esbuild puts before it, without imports of React, which stays out.
 */
async function bundleSource(names: readonly string[]): Promise<Map<string, string>> {
  const result = await build({
    absWorkingDir: workspaceRoot,
    bundle: true,
    external: ["react", "react/*", "react-dom", "react-dom/*"],
    format: "esm",
    ignoreAnnotations: true,
    logLevel: "silent",
    platform: "browser",
    stdin: {
      contents: `export { ${names.join(", ")} } from "./index.ts";`,
      loader: "ts",
      resolveDir: join(workspaceRoot, "packages/calendar/src"),
    },
    write: false,
  });
  return moduleSections(result.outputFiles[0]!.text);
}

/** An unminified esbuild bundle's code by the module each `// path` comment starts. */
export function moduleSections(code: string): Map<string, string> {
  const sections = new Map<string, string[]>();
  let current: string[] | null = null;
  for (const line of code.split("\n")) {
    const start = /^\/\/ (\S+\.(?:[cm]?[jt]sx?))$/.exec(line);
    if (start !== null) {
      current = [];
      sections.set(start[1]!, current);
    } else if (line.startsWith("export {")) {
      // The bundle's own exports, after the last module.
      current = null;
    } else {
      current?.push(line);
    }
  }
  return new Map(
    Array.from(sections, ([file, lines]) => [
      file,
      lines
        .join("\n")
        .replace(/^import\b[^;]*;/gm, "")
        .trim(),
    ]),
  );
}

/**
 * What's wrong with a feature's source bundles: code from its files in the bundle without its
 * exports, and none in the bundle with them, which would mean the check can't see its files.
 */
export function sourceProblems(
  feature: OptionalFeature,
  without: ReadonlyMap<string, string>,
  within: ReadonlyMap<string, string>,
): string[] {
  const problems = feature.files
    .filter((file) => (without.get(file) ?? "") !== "")
    .map(
      (file) =>
        `${facadePackage} without ${feature.name}, bundled from source, keeps code from ${file}: ${without.get(file)!.slice(0, 120)}`,
    );
  if (!feature.files.some((file) => (within.get(file) ?? "") !== "")) {
    problems.push(
      `a source bundle of ${feature.name} has none of its files, so the check can't see them`,
    );
  }
  return problems;
}

/**
 * What's wrong with a feature's bundles: markers in the bundle without its exports, and markers
 * missing from the bundle with them, which would mean the check can't see the feature.
 */
export function featureProblems(feature: OptionalFeature, without: string, within: string) {
  return [
    ...feature.markers
      .filter((marker) => without.includes(marker))
      .map((marker) => `${facadePackage} without ${feature.name} still bundles "${marker}"`),
    ...feature.markers
      .filter((marker) => !within.includes(marker))
      .map(
        (marker) =>
          `a bundle of ${feature.name} has no "${marker}", so the check can't see the feature`,
      ),
  ];
}

/** Bundles the facade's exports from the built packages, with and without each optional feature. */
export async function optionalFeatureProblems(
  features: readonly OptionalFeature[] = optionalFeatures,
): Promise<string[]> {
  const alias = await builtEntries();
  const { exports: names } = await bundle(`export * from ${JSON.stringify(facadePackage)};`, alias);
  const problems: string[] = [];
  for (const feature of features) {
    const missing = feature.exports.filter((name) => !names.includes(name));
    if (missing.length > 0) {
      problems.push(`${facadePackage} doesn't export ${missing.join(", ")}`);
      continue;
    }
    const list = (exports: readonly string[]) =>
      `export { ${exports.join(", ")} } from ${JSON.stringify(facadePackage)};`;
    const without = await bundle(
      list(names.filter((name) => !feature.exports.includes(name))),
      alias,
    );
    const within = await bundle(list(feature.exports), alias);
    problems.push(...featureProblems(feature, without.code, within.code));
    const others = names.filter((name) => !feature.exports.includes(name));
    problems.push(
      ...sourceProblems(feature, await bundleSource(others), await bundleSource(feature.exports)),
    );
  }
  return problems;
}

runMain(import.meta, async () => {
  parseArguments(process.argv.slice(2));
  const problems = await optionalFeatureProblems();
  if (problems.length > 0) {
    throw new Error(`Tree-shaking checks failed:\n- ${problems.join("\n- ")}`);
  }
  console.log(
    `Tree-shaking checks passed: a bundle of ${facadePackage}'s other exports, from the built packages and from source with every module's side effects kept, keeps none of ${optionalFeatures.map(({ name }) => name).join(", ")}.`,
  );
});
