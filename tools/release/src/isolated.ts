import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";

import { parse, parseAllDocuments, stringify } from "yaml";

import type { ReleaseManifest } from "./manifest";
import { tarballDirectory } from "./pack";
import { readJson, run, runOrThrow, workspaceRoot } from "./workspace";

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

type Manifest = { readonly name?: string } & Partial<
  Record<(typeof dependencyFields)[number], Readonly<Record<string, string>>>
>;

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * A copied package's manifest with each workspace dependency swapped for its tarball. `drop` names
 * workspace tools the copy goes without; any other workspace dependency is an error, since nothing
 * published can stand in for it.
 */
export function withTarballs<T extends Manifest>(
  manifest: T,
  tarballs: ReadonlyMap<string, string>,
  drop: readonly string[] = [],
): T {
  const result: Record<string, unknown> = { ...manifest };
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (!dependencies) continue;
    const rewritten: Record<string, string> = {};
    for (const [name, range] of Object.entries(dependencies)) {
      if (!range.startsWith("workspace:")) rewritten[name] = range;
      else if (tarballs.has(name)) rewritten[name] = `file:${tarballs.get(name)!}`;
      else if (!drop.includes(name)) {
        throw new Error(
          `${manifest.name} depends on ${name}, a workspace package that doesn't publish`,
        );
      }
    }
    result[field] = rewritten;
  }
  return result as T;
}

/**
 * The workspace's pnpm settings (catalog, overrides, build and peer rules) for a workspace of just
 * `directories`. Overrides send every `@moltenship` dependency, direct or not, to its tarball.
 */
export function workspaceSettings(
  source: string,
  directories: readonly string[],
  tarballs: ReadonlyMap<string, string>,
): string {
  const settings = parse(source) as { readonly overrides?: Record<string, string> };
  const overrides = { ...settings.overrides };
  for (const [name, path] of tarballs) overrides[name] = `file:${path}`;
  return stringify({ ...settings, packages: [...directories], overrides });
}

/**
 * Checks what a consumer's lockfile installed of ours: each `@moltenship` package must have the
 * hash of the dry run's tarball, and each one the consumer asks for must be there, from a tarball
 * rather than a link.
 */
export function lockfileProblems(
  lockfile: string,
  packages: ReleaseManifest["packages"],
  expected: readonly string[],
): string[] {
  // pnpm writes the package manager's own lockfile as a first document.
  const entries = parseAllDocuments(lockfile).flatMap((document) =>
    Object.entries(
      (
        document.toJS() as {
          readonly packages?: Record<
            string,
            { readonly resolution?: { readonly integrity?: string } }
          >;
        } | null
      )?.packages ?? {},
    ),
  );
  const integrity = new Map(packages.map(({ name, integrity }) => [name, integrity]));
  const installed = new Set<string>();
  const problems: string[] = [];
  for (const [key, entry] of entries) {
    const name = /^(@moltenship\/[^@]+)@/u.exec(key)?.[1];
    if (name === undefined) continue;
    installed.add(name);
    const packed = integrity.get(name);
    const actual = entry.resolution?.integrity;
    if (packed === undefined) problems.push(`${name} is installed, but the dry run didn't pack it`);
    else if (actual !== packed) {
      problems.push(
        `${name} is installed with ${actual ?? "no hash"}, not the dry run's ${packed}`,
      );
    }
  }
  for (const name of expected) {
    if (!installed.has(name)) problems.push(`${name} isn't installed from the dry run's tarball`);
  }
  return problems;
}

function isInside(path: string, directory: string): boolean {
  const relation = relative(directory, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/**
 * The environment for a command in a copy: the copy's binaries first, and none of the workspace's,
 * so nothing can fall back on the workspace's packages.
 */
export function isolatedEnvironment(
  directory: string,
  environment: NodeJS.ProcessEnv = process.env,
  root = workspaceRoot,
): NodeJS.ProcessEnv {
  const path = (environment.PATH ?? "")
    .split(delimiter)
    .filter((entry) => entry !== "" && !isInside(entry, root));
  return {
    ...environment,
    PATH: [join(directory, "node_modules", ".bin"), ...path].join(delimiter),
    NEXT_TELEMETRY_DISABLED: "1",
  };
}

/** The last `count` lines of a command's output. */
export function lastLines(output: string, count = 60): string {
  const lines = output.trimEnd().split("\n");
  return (lines.length > count ? ["…", ...lines.slice(-count)] : lines).join("\n");
}

/** Files under `directories` that git tracks or would track, as they are in the working tree. */
async function workspaceFiles(directories: readonly string[]): Promise<string[]> {
  const { stdout } = await runOrThrow("git", [
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    "--",
    ...directories,
  ]);
  const files = [...new Set(stdout.split("\0").filter(Boolean))];
  const present = await Promise.all(
    files.map((file) =>
      access(join(workspaceRoot, file)).then(
        () => file,
        () => undefined,
      ),
    ),
  );
  return present.filter((file) => file !== undefined);
}

/**
 * Installs a project offline from the pnpm store that `vp install` filled. Inside a `vp run` task,
 * `vp` on PATH is the workspace's local CLI, whose pnpm tries to fetch the pinned pnpm version from
 * the registry; VP_CLI_BIN is the global vp that started the task.
 */
export async function installOffline(directory: string): Promise<void> {
  const install = await run(
    process.env.VP_CLI_BIN ?? "vp",
    ["install", "--offline", "--ignore-scripts", "--no-frozen-lockfile"],
    { cwd: directory },
  );
  if (install.code !== 0) {
    throw new Error(
      `The offline install failed in ${directory}. Run vp install in the workspace first, so the pnpm store has every dependency.\n${lastLines(`${install.stdout}${install.stderr}`)}`,
    );
  }
}

export interface IsolatedWorkspace {
  readonly root: string;
  /** Runs a command in a copied folder and returns its output; a failure shows the end of it. */
  readonly run: (
    directory: string,
    command: string,
    args: readonly string[],
    environment?: NodeJS.ProcessEnv,
  ) => Promise<string>;
}

/** An empty folder outside the workspace for a copy. */
export function temporaryRoot(name: string): Promise<string> {
  return mkdtemp(join(tmpdir(), `moltenship-${name}-`));
}

/**
 * Copies workspace folders into a new pnpm workspace in `root`, outside this one, and installs it
 * offline, with every published package from the dry run's tarballs instead of linked from source.
 * The folders keep their paths, so relative imports between them still resolve. The copy has no
 * package source and no `paths` into it, so `@moltenship` imports can only reach the tarballs; its
 * lockfile starts from the workspace's, so third-party packages keep their versions.
 */
export async function isolatedWorkspace({
  root,
  directories,
  manifest,
  drop = [],
}: {
  /** An empty folder outside the workspace. */
  readonly root: string;
  readonly directories: readonly string[];
  readonly manifest: ReleaseManifest;
  /** Workspace tools the copied packages depend on but don't need here. */
  readonly drop?: readonly string[];
}): Promise<IsolatedWorkspace> {
  const tarballs = new Map(
    manifest.packages.map(({ name, file }) => [name, join(tarballDirectory, file)]),
  );
  for (const file of await workspaceFiles(directories)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(workspaceRoot, file), join(root, file));
  }

  const expected = new Set<string>();
  for (const directory of directories) {
    const path = join(root, directory, "package.json");
    const copied = withTarballs(await readJson<Manifest>(path), tarballs, drop);
    await writeFile(path, json(copied));
    for (const field of dependencyFields) {
      for (const dependency of Object.keys(copied[field] ?? {})) {
        if (tarballs.has(dependency)) expected.add(dependency);
      }
    }
  }
  if (expected.size === 0) throw new Error(`${directories.join(", ")} use no published package`);

  const { devEngines } = await readJson<{
    devEngines: { packageManager: { name: string; version: string } };
  }>(join(workspaceRoot, "package.json"));
  const { name: packageManager, version } = devEngines.packageManager;
  await writeFile(
    join(root, "package.json"),
    json({
      name: "moltenship-release-consumer",
      private: true,
      packageManager: `${packageManager}@${version}`,
    }),
  );
  await writeFile(
    join(root, "pnpm-workspace.yaml"),
    workspaceSettings(
      await readFile(join(workspaceRoot, "pnpm-workspace.yaml"), "utf8"),
      directories,
      tarballs,
    ),
  );
  await copyFile(join(workspaceRoot, "pnpm-lock.yaml"), join(root, "pnpm-lock.yaml"));
  // The base maps `@moltenship` imports to package source for the workspace's own type checks.
  const { compilerOptions, ...base } = await readJson<{
    compilerOptions: Record<string, unknown>;
  }>(join(workspaceRoot, "tsconfig.base.json"));
  const options = { ...compilerOptions };
  delete options.paths;
  await writeFile(join(root, "tsconfig.base.json"), json({ ...base, compilerOptions: options }));

  await installOffline(root);
  const problems = lockfileProblems(
    await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
    manifest.packages,
    [...expected],
  );
  if (problems.length > 0) {
    throw new Error(`The install isn't the dry run's tarballs:\n- ${problems.join("\n- ")}`);
  }

  return {
    root,
    run: async (directory, command, args, environment = {}) => {
      const cwd = join(root, directory);
      const result = await run(command, args, {
        cwd,
        env: { ...isolatedEnvironment(cwd), ...environment },
      });
      const output = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0) {
        throw new Error(
          `${[command, ...args].join(" ")} exited with ${result.code} in ${cwd}\n${lastLines(output)}`,
        );
      }
      return output;
    },
  };
}
