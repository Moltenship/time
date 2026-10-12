import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

import { registryItemSchema } from "shadcn/schema";

import type { RegistryManifest, RegistryManifestItem } from "./compatibility";
import { defaultRegistryBaseUrl, registryName, registryNamespace } from "./config";
import { itemClosure } from "./items";
import { consumerImportForTarget, rewriteRegistryImports } from "./rewrite-imports";
import { themeCssToRegistry } from "./theme-css";
import { findRegistryManifests, validateRegistryWorkspace } from "./validation";
import { readWorkspacePackages } from "./workspace";

const execFileAsync = promisify(execFile);
/** Our items in `registryDependencies`, and our packages in `dependencies`. */
const ownScope = `${registryNamespace}/`;

type SourceItem = ReturnType<typeof registryItemSchema.parse>;

export interface BuildRegistryOptions {
  readonly workspaceRoot: string;
  /** Where the item JSON lands, such as `apps/showcase/public/r`. */
  readonly outDir: string;
  /** The URL `outDir` is served from. Items reach each other through it. */
  readonly baseUrl?: string;
}

function ownItemName(dependency: string): string | null {
  return dependency.startsWith(ownScope) ? dependency.slice(ownScope.length) : null;
}

function withoutExtension(path: string): string {
  return path.replace(/\.tsx?$/u, "");
}

async function readSourceItems(workspaceRoot: string): Promise<SourceItem[]> {
  const report = await validateRegistryWorkspace(workspaceRoot);
  if (!report.valid) {
    throw new Error(
      `Registry source is invalid:\n${report.issues.map(({ path, message }) => `- ${path}: ${message}`).join("\n")}`,
    );
  }
  const items: SourceItem[] = [];
  for (const manifestPath of await findRegistryManifests(workspaceRoot)) {
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

/**
 * Builds the registry with the official `shadcn build`: stages the source with consumer imports,
 * writes a `registry.json` with a range on our runtime and URL registry dependencies, builds the
 * item JSON and `compatibility.json` into a temporary folder, then moves them into `outDir`.
 */
export async function buildRegistry({
  workspaceRoot,
  outDir,
  baseUrl = defaultRegistryBaseUrl,
}: BuildRegistryOptions): Promise<RegistryManifest> {
  const root = resolve(workspaceRoot);
  const output = resolve(outDir);
  const base = baseUrl.replace(/\/$/u, "");
  const items = sortByDependencies(await readSourceItems(root));
  const packages = await readWorkspacePackages(root);
  const byName = new Map(items.map((item) => [item.name, item]));
  const itemsOf = (item: SourceItem) =>
    (item.registryDependencies ?? []).flatMap((dependency) => ownItemName(dependency) ?? []);

  const targets = new Map<string, string>();
  for (const item of items) {
    for (const file of item.files ?? []) targets.set(withoutExtension(file.path), file.target!);
  }
  const resolveImport = (from: string) => (specifier: string) => {
    const path = specifier.slice("@registry/".length);
    if (path.startsWith("ui/")) return `@/components/${path}`;
    const target = targets.get(`registry/${path}`) ?? targets.get(`registry/${path}/index`);
    if (!target) throw new Error(`${from} imports ${specifier}, which no registry item ships`);
    return consumerImportForTarget(target);
  };

  const stage = await mkdtemp(join(tmpdir(), "time-registry-build-"));
  try {
    const registryItems = [];
    const manifestItems: RegistryManifestItem[] = [];

    for (const item of items) {
      for (const file of item.files ?? []) {
        const source = await readFile(join(root, file.path), "utf8");
        const staged = join(stage, file.path);
        await mkdir(dirname(staged), { recursive: true });
        await writeFile(staged, rewriteRegistryImports(source, resolveImport(file.path)));
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
          ? themeCssToRegistry(await readFile(join(root, stylesheet), "utf8"), stylesheet)
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
              files: item.files.map(({ path, type, target }) => ({ path, type, target })),
            }
          : {}),
        ...(theme ? { cssVars: theme.cssVars, css: theme.css } : {}),
        ...(item.cssVars ? { cssVars: item.cssVars } : {}),
        ...(item.css ? { css: item.css } : {}),
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
          name: registryName,
          homepage: base.replace(/\/r$/u, ""),
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

    const manifest: RegistryManifest = {
      registry: registryName,
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
