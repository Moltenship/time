import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { publishedPackages, type PublishedPackage } from "./config";

export const workspaceRoot = resolve(import.meta.dirname, "../../..");

export interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly private?: boolean;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
  readonly publishConfig?: {
    readonly exports?: Readonly<Record<string, string | Readonly<Record<string, string>>>>;
  };
}

export interface WorkspacePackage extends PublishedPackage {
  readonly path: string;
  readonly manifest: PackageManifest;
}

export async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/** The published packages with their manifests, dependencies before dependents. */
export async function readPublishedPackages(
  root = workspaceRoot,
  packages: readonly PublishedPackage[] = publishedPackages,
): Promise<WorkspacePackage[]> {
  const loaded = await Promise.all(
    packages.map(async (entry) => {
      const path = join(root, "packages", entry.directory);
      const manifest = await readJson<PackageManifest>(join(path, "package.json"));
      return { ...entry, path, manifest };
    }),
  );
  return dependencyOrder(loaded);
}

/** Sorts packages so each comes after the published packages it depends on. */
export function dependencyOrder<T extends { readonly manifest: PackageManifest }>(
  packages: readonly T[],
): T[] {
  const byName = new Map(packages.map((entry) => [entry.manifest.name, entry]));
  const ordered: T[] = [];
  const visiting = new Set<string>();
  const visit = (entry: T) => {
    const { name } = entry.manifest;
    if (ordered.includes(entry)) return;
    if (visiting.has(name)) throw new Error(`Dependency cycle through ${name}`);
    visiting.add(name);
    const names = Object.keys({
      ...entry.manifest.dependencies,
      ...entry.manifest.peerDependencies,
    });
    for (const dependency of names.sort()) {
      const target = byName.get(dependency);
      if (target) visit(target);
    }
    visiting.delete(name);
    ordered.push(entry);
  };
  for (const entry of [...packages].sort((a, b) => compare(a.manifest.name, b.manifest.name))) {
    visit(entry);
  }
  return ordered;
}

/** Subpaths in `publishConfig.exports` that point at code, with the ESM file each one imports. */
export function publishedEntryPoints(manifest: PackageManifest): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [subpath, target] of Object.entries(manifest.publishConfig?.exports ?? {})) {
    if (subpath === "./package.json") continue;
    const file = typeof target === "string" ? target : (target.import ?? target.default);
    if (file) entries.set(subpath, file);
  }
  return entries;
}

/** The tarball name pnpm gives a package: `@scope/name` 1.0.0 → `scope-name-1.0.0.tgz`. */
export function tarballName(name: string, version: string): string {
  return `${name.replace(/^@/, "").replace("/", "-")}-${version}.tgz`;
}

export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface RunResult {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Stream output to the terminal instead of capturing it. */
  readonly inherit?: boolean;
}

/** Runs a command without a shell. Resolves with its exit code; never rejects on failure. */
export function run(command: string, args: readonly string[], options: RunOptions = {}) {
  return new Promise<RunResult>((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? workspaceRoot,
      env: options.env ?? process.env,
      stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr?.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

/** Runs a command and throws with its output when it fails. */
export async function runOrThrow(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  const result = await run(command, args, options);
  if (result.code !== 0) {
    const output = `${result.stdout}\n${result.stderr}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed (exit ${result.code})\n${output}`);
  }
  return result;
}

/** The commit and whether the working tree is clean, untracked files included. */
export async function gitState(root = workspaceRoot) {
  const head = (await runOrThrow("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const { stdout } = await runOrThrow("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
  });
  const status = stdout.trim();
  return { head, clean: status === "", status };
}

/** Whether `commit` is on `origin/main` as last fetched. Works offline. */
export async function isOnMain(commit: string, root = workspaceRoot): Promise<boolean> {
  const result = await run("git", ["merge-base", "--is-ancestor", commit, "origin/main"], {
    cwd: root,
  });
  return result.code === 0;
}

/**
 * Parses `--flag value`, `--flag=value` and boolean `--flag` arguments, with the rest as
 * positionals. Any flag that is neither a boolean nor one of `strings` is an error, and so is a
 * string flag without a value or a positional where none is taken, so a typo such as `--dry-run`
 * can't be silently ignored.
 */
export function parseArguments(
  argv: readonly string[],
  booleans: readonly string[] = [],
  strings: readonly string[] = [],
  { positionals: allowPositionals = false } = {},
) {
  const flags = new Map<string, string | true>();
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!;
    if (argument === "--") continue;
    if (!argument.startsWith("--")) {
      if (!allowPositionals) throw new Error(`Unexpected argument ${argument}`);
      positionals.push(argument);
      continue;
    }
    // Split at the first "=" only, so a value may contain one.
    const equals = argument.indexOf("=");
    const key = equals === -1 ? argument.slice(2) : argument.slice(2, equals);
    const inline = equals === -1 ? undefined : argument.slice(equals + 1);
    if (!booleans.includes(key) && !strings.includes(key))
      throw new Error(`Unknown option --${key}`);
    const next = argv[index + 1];
    if (inline !== undefined && booleans.includes(key)) {
      throw new Error(`--${key} takes no value`);
    }
    if (inline === "") throw new Error(`--${key} needs a value`);
    if (inline !== undefined) flags.set(key, inline);
    else if (!booleans.includes(key) && next !== undefined && !next.startsWith("--")) {
      flags.set(key, next);
      index += 1;
    } else if (strings.includes(key)) {
      throw new Error(`--${key} needs a value`);
    } else flags.set(key, true);
  }
  return { flags, positionals };
}

/** Runs `main` when the file is the entry script, printing the error and exiting non-zero on failure. */
export function runMain(meta: ImportMeta, main: () => Promise<void>) {
  if (process.argv[1] !== meta.filename) return;
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
