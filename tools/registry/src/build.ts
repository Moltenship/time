import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { registryItemSchema } from "shadcn/schema";

import type { RegistryManifest, RegistryManifestItem } from "./compatibility";
import {
  baseTokensItemName,
  defaultRegistryBaseUrl,
  frameworkBaseUrl,
  reactRegistry,
  registryNamespace,
  registrySharedDirectory,
  type RegistryFramework,
} from "./config";
import { itemClosure } from "./items";
import { consumerImportForTarget, rewriteRegistryImports } from "./rewrite-imports";
import { themeCssToRegistry } from "./theme-css";
import { findRegistryManifests, validateRegistryWorkspace } from "./validation";
import { readWorkspacePackages } from "./workspace";

const execFileAsync = promisify(execFile);
/** Our items in `registryDependencies`, and our packages in `dependencies`. */
const ownScope = `${registryNamespace}/`;

type SourceItem = ReturnType<typeof registryItemSchema.parse>;

interface BuildRegistryOptions {
  readonly workspaceRoot: string;
  /** Where the item JSON lands, such as `apps/showcase/public/r`. */
  readonly outDir: string;
  /**
   * The registry's base URL. A framework with a `path` is built for, and served from, the folder
   * of that name under it, and its JSON belongs in the same folder under `outDir`'s base: the
   * caller passes `<out>/solid` for Solid.
   */
  readonly baseUrl?: string;
  readonly framework?: RegistryFramework;
}

function ownItemName(dependency: string): string | null {
  return dependency.startsWith(ownScope) ? dependency.slice(ownScope.length) : null;
}

function withoutExtension(path: string): string {
  return path.replace(/\.tsx?$/u, "");
}

async function readSourceItems(
  workspaceRoot: string,
  framework: RegistryFramework,
): Promise<SourceItem[]> {
  const report = await validateRegistryWorkspace(workspaceRoot, { framework });
  if (!report.valid) {
    throw new Error(
      `Registry source is invalid:\n${report.issues.map(({ path, message }) => `- ${path}: ${message}`).join("\n")}`,
    );
  }
  const items: SourceItem[] = [];
  for (const manifestPath of await findRegistryManifests(workspaceRoot, framework)) {
    items.push(
      registryItemSchema.parse(
        JSON.parse(await readFile(join(workspaceRoot, manifestPath), "utf8")),
      ),
    );
  }
  return items;
}

/** Items in install order: every item after the items it installs, ties broken by name. */
function sortByDependencies(items: readonly SourceItem[]): SourceItem[] {
  const byName = new Map(items.map((item) => [item.name, item]));
  const sorted: SourceItem[] = [];
  const visiting = new Set<string>();
  const visit = (item: SourceItem): void => {
    if (sorted.includes(item)) return;
    if (visiting.has(item.name))
      throw new Error(`Registry items depend on each other: ${item.name}`);
    visiting.add(item.name);
    for (const dependency of [...(item.registryDependencies ?? [])].sort()) {
      const name = ownItemName(dependency);
      if (name) visit(byName.get(name)!);
    }
    visiting.delete(item.name);
    sorted.push(item);
  };
  for (const item of [...items].sort((a, b) => a.name.localeCompare(b.name))) visit(item);
  return sorted;
}

function shadcnCli(): string {
  return createRequire(import.meta.url).resolve("shadcn");
}

/**
 * Moves a finished build into `outDir`. It removes only what an earlier build wrote there, the
 * items its `registry.json` lists and the two index files, so a removed item doesn't linger and
 * nothing else in the folder is touched.
 */
async function replaceOutput(built: string, outDir: string): Promise<void> {
  await mkdir(outDir, { recursive: true });
  let previous: string[] = [];
  try {
    const index = JSON.parse(await readFile(join(outDir, "registry.json"), "utf8")) as {
      readonly items?: readonly { readonly name?: unknown }[];
    };
    previous = (index.items ?? []).flatMap(({ name }) =>
      typeof name === "string" && /^[a-z0-9-]+$/u.test(name) ? [`${name}.json`] : [],
    );
  } catch {
    // No earlier build here.
  }
  for (const file of [...previous, "registry.json", "compatibility.json"]) {
    await rm(join(outDir, file), { force: true });
  }
  for (const file of await readdir(built)) await copyFile(join(built, file), join(outDir, file));
}

const facadeImport = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(["'])@moltenship\/calendar\2/gu;

/** A shared file imports `@moltenship/calendar`; in another framework's items it imports that one's facade. */
function withFacade(source: string, framework: RegistryFramework): string {
  return framework.facade === reactRegistry.facade
    ? source
    : source.replaceAll(facadeImport, `$1$2${framework.facade}$2`);
}

/** The workspace path an `@registry/…` import names, without its extension. */
function importedPath(path: string, framework: RegistryFramework): string {
  return path.startsWith("shared/")
    ? `${registrySharedDirectory}/${path.slice("shared/".length)}`
    : `${framework.sourceDirectory}/${path}`;
}

/** Puts back the source paths of files staged under another path, in a built item's JSON. */
async function restorePaths(
  built: string,
  name: string,
  paths: ReadonlyMap<number, string>,
): Promise<void> {
  const file = join(built, `${name}.json`);
  const item = JSON.parse(await readFile(file, "utf8")) as { files: { path: string }[] };
  for (const [index, path] of paths) item.files[index]!.path = path;
  await writeFile(file, JSON.stringify(item, null, 2));
}

/**
 * Builds the registry with the official `shadcn build`: stages the source with consumer imports,
 * writes a `registry.json` with a range on our runtime and URL registry dependencies, builds the
 * item JSON and `compatibility.json` into a temporary folder, then moves them into `outDir`.
 */
export async function buildRegistry({
  workspaceRoot,
  outDir,
  baseUrl = defaultRegistryBaseUrl,
  framework = reactRegistry,
}: BuildRegistryOptions): Promise<RegistryManifest> {
  const root = resolve(workspaceRoot);
  const output = resolve(outDir);
  const registryBase = baseUrl.replace(/\/$/u, "");
  const base = frameworkBaseUrl(registryBase, framework);
  const items = sortByDependencies(await readSourceItems(root, framework));
  const packages = await readWorkspacePackages(root, framework);
  const byName = new Map(items.map((item) => [item.name, item]));
  const itemsOf = (item: SourceItem) =>
    (item.registryDependencies ?? []).flatMap((dependency) => ownItemName(dependency) ?? []);

  // Where each file lands. A shared file can land in two places, one per flavour, so an import
  // resolves to the target an item in the importer's own install gives it.
  const targetsOf = (members: readonly SourceItem[]) => {
    const targets = new Map<string, string[]>();
    for (const member of members) {
      for (const file of member.files ?? []) {
        const key = withoutExtension(file.path);
        targets.set(key, [...new Set([...(targets.get(key) ?? []), file.target!])]);
      }
    }
    return targets;
  };
  const allTargets = targetsOf(items);
  const resolveImport =
    (from: string, closureTargets: ReadonlyMap<string, string[]>) => (specifier: string) => {
      const path = specifier.slice("@registry/".length);
      const key = importedPath(path, framework);
      const [target, ...others] = closureTargets.get(key) ??
        closureTargets.get(`${key}/index`) ??
        allTargets.get(key) ??
        allTargets.get(`${key}/index`) ?? [undefined];
      if (!target) throw new Error(`${from} imports ${specifier}, which no registry item ships`);
      if (others.length > 0) {
        throw new Error(`${from} imports ${specifier}, which lands in more than one place`);
      }
      return consumerImportForTarget(target);
    };

  const stage = await mkdtemp(join(tmpdir(), "time-registry-build-"));
  try {
    const registryItems = [];
    const manifestItems: RegistryManifestItem[] = [];
    // What each staged path holds, and the items whose files were staged elsewhere, since one
    // shared file can read differently in two flavours' items.
    const staged = new Map<string, string>();
    const restored = new Map<string, Map<number, string>>();

    for (const item of items) {
      const closureTargets = targetsOf(itemClosure(item.name, byName, itemsOf));
      const stagedPaths: string[] = [];
      for (const [index, file] of (item.files ?? []).entries()) {
        const raw = await readFile(join(root, file.path), "utf8");
        const source = file.path.startsWith(`${registrySharedDirectory}/`)
          ? withFacade(raw, framework)
          : raw;
        const content = rewriteRegistryImports(source, resolveImport(file.path, closureTargets));
        let path = file.path;
        if (staged.has(path) && staged.get(path) !== content) {
          path = `variants/${item.name}/${file.path}`;
          const paths = restored.get(item.name) ?? new Map<number, string>();
          restored.set(item.name, paths.set(index, file.path));
        }
        staged.set(path, content);
        stagedPaths.push(path);
        await mkdir(dirname(join(stage, path)), { recursive: true });
        await writeFile(join(stage, path), content);
      }

      // Our packages carry the range the source was built against. Third-party ones stay bare, as
      // in stock shadcn items, so `shadcn add` keeps the version an app already has.
      const dependencies = (item.dependencies ?? []).map((name) =>
        name.startsWith(ownScope) ? `${name}@${packages.ranges.get(name)!}` : name,
      );
      const compatibility: Record<string, string> = {};
      for (const member of itemClosure(item.name, byName, itemsOf)) {
        for (const name of member.dependencies ?? []) {
          if (name.startsWith(ownScope)) compatibility[name] = packages.ranges.get(name)!;
        }
      }
      const { stylesheet, ...meta } = item.meta ?? {};
      const theme =
        typeof stylesheet === "string"
          ? themeCssToRegistry(await readFile(join(root, stylesheet), "utf8"), stylesheet, {
              // The one item whose job is shadcn's own tokens, for an app that has none.
              standard: item.name === baseTokensItemName,
            })
          : null;

      registryItems.push({
        name: item.name,
        type: item.type,
        title: item.title,
        description: item.description,
        ...(item.docs ? { docs: item.docs } : {}),
        ...(dependencies.length ? { dependencies } : {}),
        ...(item.registryDependencies?.length
          ? {
              registryDependencies: item.registryDependencies.map((dependency) => {
                const name = ownItemName(dependency);
                return name ? `${base}/${name}.json` : dependency;
              }),
            }
          : {}),
        ...(item.files?.length
          ? {
              files: item.files.map(({ type, target }, index) => ({
                path: stagedPaths[index]!,
                type,
                target,
              })),
            }
          : {}),
        ...(theme ? { cssVars: theme.cssVars, css: theme.css } : {}),
        meta: { ...meta, compatibility },
      });
      manifestItems.push({
        name: item.name,
        type: item.type,
        url: `${base}/${item.name}.json`,
        compatibility,
        dependencies,
        items: itemsOf(item),
        components: (item.registryDependencies ?? []).filter(
          (dependency) => !ownItemName(dependency),
        ),
        targets: (item.files ?? []).map(({ target }) => target!),
      });
    }

    await writeFile(
      join(stage, "registry.json"),
      `${JSON.stringify(
        {
          $schema: "https://ui.shadcn.com/schema/registry.json",
          name: framework.registryName,
          homepage: registryBase.replace(/\/r$/u, ""),
          items: registryItems,
        },
        null,
        2,
      )}\n`,
    );

    const built = join(stage, "out");
    try {
      await execFileAsync(
        process.execPath,
        [shadcnCli(), "build", "registry.json", "--output", built, "--cwd", stage],
        { cwd: stage, env: { ...process.env, NO_COLOR: "1" } },
      );
    } catch (error) {
      const { stdout = "", stderr = "" } = error as { stdout?: string; stderr?: string };
      throw new Error(`shadcn build failed:\n${stdout}\n${stderr}`, { cause: error });
    }
    for (const [name, paths] of restored) await restorePaths(built, name, paths);

    const manifest: RegistryManifest = {
      registry: framework.registryName,
      baseUrl: base,
      runtime: Object.fromEntries(
        [...packages.versions]
          .filter(([name]) => packages.ranges.has(name))
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
      items: manifestItems,
    };
    await writeFile(join(built, "compatibility.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await replaceOutput(built, output);
    return manifest;
  } finally {
    await rm(stage, { force: true, recursive: true });
  }
}
