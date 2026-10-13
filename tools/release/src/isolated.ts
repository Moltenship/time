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

/** Each package a pnpm lockfile installs, by its key, such as `react@19.3.0`, with its hash. */
export function lockfileEntries(lockfile: string): Map<string, string | undefined> {
  // pnpm writes the package manager's own lockfile as a first document.
  return new Map(
    parseAllDocuments(lockfile).flatMap((document) =>
      Object.entries(
        (
          document.toJS() as {
            readonly packages?: Record<
              string,
              { readonly resolution?: { readonly integrity?: string } }
            >;
          } | null
        )?.packages ?? {},
      ).map(([key, entry]) => [key, entry.resolution?.integrity] as const),
    ),
  );
}

/**
 * Checks what a copy's lockfile installed. Each `@moltenship` package must have the hash of the
 * dry run's tarball, and each one the copy asks for must be there, from a tarball rather than a
 * link. Every other package must be one the workspace's lockfile has, with the same hash.
 */
export function lockfileProblems({
  lockfile,
  packages,
  expected,
  workspaceLockfile,
}: {
  readonly lockfile: string;
  readonly packages: ReleaseManifest["packages"];
  /** The published packages the copy depends on directly. */
  readonly expected: readonly string[];
  readonly workspaceLockfile: string;
}): string[] {
  const packed = new Map(packages.map(({ name, integrity }) => [name, integrity]));
  const workspace = lockfileEntries(workspaceLockfile);
  const installed = new Set<string>();
  const problems: string[] = [];
  for (const [key, integrity] of lockfileEntries(lockfile)) {
    const name = /^(@moltenship\/[^@]+)@/u.exec(key)?.[1];
    if (name === undefined) {
      if (!workspace.has(key)) problems.push(`${key} isn't in the workspace's lockfile`);
      else if (workspace.get(key) !== integrity) {
        problems.push(`${key} has another hash than the workspace's`);
      }
      continue;
    }
    installed.add(name);
    const hash = packed.get(name);
    if (hash === undefined) problems.push(`${name} is installed, but the dry run didn't pack it`);
    else if (integrity !== hash) {
      problems.push(
        `${name} is installed with ${integrity ?? "no hash"}, not the dry run's ${hash}`,
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

// Inside a `vp run` task, `vp` on PATH is the workspace's local CLI, whose pnpm tries to fetch the
// pinned pnpm version from the registry. VP_CLI_BIN is the global vp that started the task.
const install = (directory: string, mode: "--offline" | "--prefer-offline") =>
  run(
    process.env.VP_CLI_BIN ?? "vp",
    ["install", mode, "--ignore-scripts", "--no-frozen-lockfile"],
    { cwd: directory },
  );

function installFailure(directory: string, result: { stdout: string; stderr: string }) {
  return new Error(
    `The install failed in ${directory}. Run vp install in the workspace first, so the pnpm store has every package.\n${lastLines(`${result.stdout}\n${result.stderr}`)}`,
  );
}

/**
 * Whether an offline install failed only for package metadata a cold cache lacks: a package's
 * (`ERR_PNPM_NO_OFFLINE_META`), or that of the pinned pnpm itself, which the `packageManager`
 * field makes a config dependency (`ERR_PNPM_BAD_CONFIG_DEP` in the package mirror).
 */
export function lacksMetadata(output: string): boolean {
  // pnpm wraps its messages to the terminal's width, and frames the causes it lists.
  const text = output.replace(/[│├╰─▶×]/g, " ").replace(/\s+/g, " ");
  return (
    text.includes("ERR_PNPM_NO_OFFLINE_META") ||
    (text.includes("ERR_PNPM_BAD_CONFIG_DEP") && text.includes("package mirror"))
  );
}

/**
 * Installs a project from the pnpm store, offline when pnpm's metadata cache has what resolving
 * it needs. A fresh machine's cache may not: `vp install --frozen-lockfile` skips resolution, and
 * keeps only part of the metadata. Then pnpm reads the missing metadata from npm, and still takes
 * every package from the store. Says whether it read from npm.
 */
export async function installFromStore(directory: string): Promise<{ readonly online: boolean }> {
  const offline = await install(directory, "--offline");
  if (offline.code === 0) return { online: false };
  if (!lacksMetadata(`${offline.stdout}${offline.stderr}`)) {
    throw installFailure(directory, offline);
  }
  const online = await install(directory, "--prefer-offline");
  if (online.code !== 0) throw installFailure(directory, online);
  return { online: true };
}

export interface IsolatedWorkspace {
  readonly root: string;
  /** Whether the install read package metadata from npm, which a cold pnpm cache needs. */
  readonly online: boolean;
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
 * from the pnpm store (`installFromStore`), with every published package from the dry run's
 * tarballs instead of linked from source.
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

  const { online } = await installFromStore(root);
  const problems = lockfileProblems({
    lockfile: await readFile(join(root, "pnpm-lock.yaml"), "utf8"),
    packages: manifest.packages,
    expected: [...expected],
    workspaceLockfile: await readFile(join(workspaceRoot, "pnpm-lock.yaml"), "utf8"),
  });
  if (problems.length > 0) {
    throw new Error(`The install isn't the dry run's tarballs:\n- ${problems.join("\n- ")}`);
  }

  return {
    root,
    online,
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
