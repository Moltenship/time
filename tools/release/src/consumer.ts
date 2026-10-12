import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { build } from "vite-plus";
import { parse, stringify } from "yaml";

import { facadePackage, pointerAdapterPackage } from "./config";
import { withPackedPackages, type PackedTarball } from "./pack";
import { parseArguments, readJson, run, runMain, runOrThrow, workspaceRoot } from "./workspace";

const require = createRequire(import.meta.url);

/** React and its types come from the workspace catalog, so they are already in the pnpm store. */
const consumerPeers = ["react", "react-dom", "@types/react", "@types/react-dom"] as const;

/**
 * Installs the tarballs into a new project outside the workspace, offline, from the pnpm store
 * that `vp install` filled. Outside the workspace, Node and TypeScript can't fall back on the
 * workspace's node_modules. Overrides make every `@moltenship/*` dependency, direct or not,
 * resolve to its tarball.
 */
export async function installConsumer(tarballs: readonly PackedTarball[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "moltenship-consumer-"));
  const { catalog } = parse(await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8")) as {
    readonly catalog: Record<string, string>;
  };
  // The workspace's pnpm, which vp has already downloaded. Through devEngines, pnpm would look
  // the version up in the registry, which an offline install can't do.
  const { devEngines } = await readJson<{
    devEngines: { packageManager: { name: string; version: string } };
  }>(join(workspaceRoot, "package.json"));
  const { name: packageManager, version: packageManagerVersion } = devEngines.packageManager;
  const files = Object.fromEntries(tarballs.map(({ name, path }) => [name, `file:${path}`]));
  const peers = Object.fromEntries(consumerPeers.map((name) => [name, catalog[name]!]));

  await writeFile(
    join(directory, "package.json"),
    `${JSON.stringify(
      {
        name: "moltenship-clean-consumer",
        private: true,
        type: "module",
        packageManager: `${packageManager}@${packageManagerVersion}`,
        dependencies: { ...files, ...peers },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(directory, "pnpm-workspace.yaml"), stringify({ overrides: files }));
  // Inside a `vp run` task, `vp` on PATH is the workspace's local CLI, whose pnpm tries to fetch
  // the pinned pnpm version from the registry. VP_CLI_BIN is the global vp that started the task.
  const vp = process.env.VP_CLI_BIN ?? "vp";
  const install = await run(
    vp,
    ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"],
    {
      cwd: directory,
    },
  );
  if (install.code !== 0) {
    throw new Error(
      `The offline install failed in ${directory}. Run vp install in the workspace first, so the pnpm store has every dependency.\n${install.stdout}${install.stderr}`.trim(),
    );
  }
  return directory;
}

/**
 * Imports every package in Node from the consumer, and tries a deep import into each. Each root
 * import must expose at least one export; each deep import must fail with
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
export async function runtimeProblems(
  directory: string,
  names: readonly string[],
): Promise<string[]> {
  const script = `
const report = {};
for (const name of ${JSON.stringify(names)}) {
  const entry = { exports: 0, deep: "allowed" };
  try {
    entry.exports = Object.keys(await import(name)).length;
  } catch (error) {
    entry.error = String(error?.message ?? error).split("\\n")[0];
  }
  try {
    await import(name + "/dist/index.mjs");
  } catch (error) {
    entry.deep = error?.code ?? String(error);
  }
  report[name] = entry;
}
console.log(JSON.stringify(report));
`;
  await writeFile(join(directory, "runtime-check.mjs"), script);
  const { stdout } = await runOrThrow(process.execPath, ["runtime-check.mjs"], { cwd: directory });
  const report = JSON.parse(stdout) as Record<
    string,
    { readonly exports: number; readonly deep: string; readonly error?: string }
  >;
  return names.flatMap((name) => {
    const entry = report[name]!;
    const problems: string[] = [];
    if (entry.error) problems.push(`${name}: import failed: ${entry.error}`);
    else if (entry.exports === 0) problems.push(`${name}: the import has no exports`);
    if (entry.deep !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      problems.push(
        `${name}: a deep import of dist/index.mjs gave ${entry.deep}, not ERR_PACKAGE_PATH_NOT_EXPORTED`,
      );
    }
    return problems;
  });
}

/** TypeScript 7, which the workspace uses, and TypeScript 6, the oldest the README supports. */
const compilers = [
  ["TypeScript 7", "typescript"],
  ["TypeScript 6", "typescript-6"],
].map(([label, name]) => ({
  label: label!,
  tsc: join(dirname(require.resolve(`${name}/package.json`)), "bin/tsc"),
}));

/**
 * Type-checks an import of every package with each compiler, under `NodeNext` and `Bundler`,
 * library files included.
 */
export async function typeProblems(directory: string, names: readonly string[]): Promise<string[]> {
  const source = [
    ...names.map((name, index) => `import * as package${index} from ${JSON.stringify(name)};`),
    `export const packages = [${names.map((_, index) => `package${index}`).join(", ")}];`,
  ].join("\n");
  await writeFile(join(directory, "types-check.ts"), `${source}\n`);
  const problems: string[] = [];
  const settings = [
    ["NodeNext", "NodeNext"],
    ["Bundler", "ESNext"],
  ] as const;
  for (const { label, tsc } of compilers) {
    for (const [resolution, module] of settings) {
      const result = await run(
        process.execPath,
        [
          tsc,
          "--ignoreConfig",
          "--noEmit",
          "--strict",
          "--skipLibCheck",
          "false",
          "--target",
          "ES2023",
          "--lib",
          "ESNext,DOM,DOM.Iterable",
          "--jsx",
          "react-jsx",
          "--module",
          module,
          "--moduleResolution",
          resolution,
          "types-check.ts",
        ],
        { cwd: directory },
      );
      if (result.code !== 0)
        problems.push(`${label} (${resolution}):\n${result.stdout}${result.stderr}`.trim());
    }
  }
  return problems;
}

/** Bundles some named exports of `from` and returns the modules that kept code, with their sizes. */
async function bundledModules(
  directory: string,
  from: string,
  names: readonly string[],
  file: string,
) {
  await writeFile(
    join(directory, file),
    `export { ${names.join(", ")} } from ${JSON.stringify(from)};\n`,
  );
  const output = await build({
    configFile: false,
    envFile: false,
    logLevel: "silent",
    root: directory,
    build: {
      write: false,
      minify: true,
      lib: { entry: join(directory, file), formats: ["es"], fileName: "bundle" },
      rollupOptions: { external: [/^react(-dom)?($|\/)/] },
    },
  });
  const [result] = Array.isArray(output) ? output : [output];
  if (!result || !("output" in result)) throw new Error("The bundle check expected a build result");
  const modules = new Map<string, number>();
  for (const chunk of result.output) {
    if (chunk.type !== "chunk") continue;
    for (const [id, module] of Object.entries(chunk.modules)) {
      if (module.renderedLength > 0) modules.set(id, module.renderedLength);
    }
  }
  return modules;
}

/**
 * The facade re-exports the pointer adapter. A bundle of the facade's other exports must not keep
 * any adapter code, and a bundle of the pointer exports must keep some, which shows the check can
 * see the adapter at all.
 */
export async function adapterBundleProblems(
  directory: string,
  facade = facadePackage,
  adapter = pointerAdapterPackage,
): Promise<string[]> {
  const script = `
const facade = Object.keys(await import(${JSON.stringify(facade)}));
const adapter = new Set(Object.keys(await import(${JSON.stringify(adapter)})));
console.log(JSON.stringify({ base: facade.filter((name) => !adapter.has(name)), pointer: facade.filter((name) => adapter.has(name)) }));
`;
  await writeFile(join(directory, "exports-list.mjs"), script);
  const { stdout } = await runOrThrow(process.execPath, ["exports-list.mjs"], { cwd: directory });
  const { base, pointer } = JSON.parse(stdout) as {
    readonly base: string[];
    readonly pointer: string[];
  };
  const isAdapter = (id: string) => id.replaceAll("\\", "/").includes(`/node_modules/${adapter}/`);
  const problems: string[] = [];

  const baseModules = await bundledModules(directory, facade, base, "base-entry.mjs");
  const leaked = [...baseModules].filter(([id]) => isAdapter(id));
  if (leaked.length > 0) {
    const bytes = leaked.reduce((total, [, size]) => total + size, 0);
    problems.push(
      `${facade} without its pointer exports still bundles ${bytes} bytes of ${adapter}`,
    );
  }
  if (pointer.length > 0) {
    const pointerModules = await bundledModules(directory, facade, pointer, "pointer-entry.mjs");
    if (![...pointerModules.keys()].some(isAdapter)) {
      problems.push(
        `a bundle of ${facade}'s pointer exports has no ${adapter} code, so the check can't see the adapter`,
      );
    }
  }
  console.log(
    `${facade}: ${base.length} exports bundle without ${adapter}; ${pointer.length} pointer exports bundle with it.`,
  );
  return problems;
}

/** Installs the tarballs into a clean project and runs every consumer check. */
export async function checkConsumer(
  tarballs: readonly PackedTarball[],
  { keep = false } = {},
): Promise<void> {
  const directory = await installConsumer(tarballs);
  const names = tarballs.map(({ name }) => name);
  const problems = [
    ...(await runtimeProblems(directory, names)),
    ...(await typeProblems(directory, names)),
    ...(await adapterBundleProblems(directory)),
  ];
  // A failed run keeps the project, so the failure can be reproduced in it.
  if (problems.length > 0) {
    throw new Error(`Clean-consumer checks failed in ${directory}:\n- ${problems.join("\n- ")}`);
  }
  if (keep) console.log(`Kept the consumer project at ${directory}`);
  else await rm(directory, { force: true, recursive: true });
  console.log(
    `Clean consumer passed: ${names.length} packages installed offline, imported, type-checked and bundled.`,
  );
}

runMain(import.meta, async () => {
  const keep = parseArguments(process.argv.slice(2), ["keep"]).flags.has("keep");
  await withPackedPackages((tarballs) => checkConsumer(tarballs, { keep }));
});
