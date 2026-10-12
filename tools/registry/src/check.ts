import { readFile } from "node:fs/promises";
import { join, posix } from "node:path";

import { satisfies, validRange } from "semver";
import { registryItemSchema, registrySchema } from "shadcn/schema";

import type { RegistryManifest, RegistryManifestItem } from "./compatibility";
import { consumerPackages, dragAndDropPackages, registryNamespace } from "./config";
import { dependencyName, itemClosure } from "./items";
import { consumerImportForTarget } from "./rewrite-imports";

/** The composition that installs every other item. */
export const fullItemName = "calendar-full";

export interface CheckBuiltRegistryOptions {
  readonly outDir: string;
  readonly manifest: RegistryManifest;
}

const importSpecifier = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu;

function withoutComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//gu, "").replaceAll(/^\s*\/\/.*$/gmu, "");
}

export function importsOf(source: string): string[] {
  return [...withoutComments(source).matchAll(importSpecifier)].map(([, specifier]) => specifier!);
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
}

function targetPath(target: string): string {
  return target.replace(/^@([a-z]+)\//u, "$1/").replace(/\.tsx?$/u, "");
}

/** Can `specifier`, written in the file at `from`, be satisfied by what `closure` installs? */
function importIssue(
  specifier: string,
  from: string,
  item: RegistryManifestItem,
  closure: readonly RegistryManifestItem[],
): string | null {
  const where = `${item.name}: ${from} imports ${specifier}`;
  if (specifier.startsWith(".")) {
    const resolved = posix.normalize(posix.join(posix.dirname(targetPath(from)), specifier));
    return item.targets.some((target) => targetPath(target) === resolved)
      ? null
      : `${where}, which isn't one of the item's own files`;
  }
  if (specifier.startsWith("@/components/ui/")) {
    const component = specifier.slice("@/components/ui/".length);
    return closure.some(({ components }) => components.includes(component))
      ? null
      : `${where}, but no item in its install lists the ${component} component`;
  }
  if (specifier.startsWith("@/")) {
    return closure.some(({ targets }) =>
      targets.some((target) => consumerImportForTarget(target) === specifier),
    )
      ? null
      : `${where}, which no item in its install ships`;
  }
  if (specifier.startsWith("@registry/")) return `${where}, an alias consumers don't have`;
  const name = packageName(specifier);
  return consumerPackages.has(name) ||
    closure.some(({ dependencies }) =>
      dependencies.some((dependency) => dependencyName(dependency) === name),
    )
    ? null
    : `${where}, but no item in its install depends on ${name}`;
}

/**
 * Checks a built registry the way a consumer would meet it: every item parses with shadcn's
 * schema, every import resolves to a file, component, or package its install provides, the full
 * item composes the others without owning files, no two items write the same file, nothing turns
 * on drag and drop, and the runtime ranges hold for the workspace versions.
 */
export async function checkBuiltRegistry({
  outDir,
  manifest,
}: CheckBuiltRegistryOptions): Promise<string[]> {
  const issues: string[] = [];
  const byName = new Map(manifest.items.map((item) => [item.name, item]));
  const owners = new Map<string, string>();

  const index = registrySchema.safeParse(
    JSON.parse(await readFile(join(outDir, "registry.json"), "utf8")),
  );
  if (!index.success) issues.push(`registry.json: ${index.error.message}`);
  else {
    const listed = index.data.items.map(({ name }) => name).sort();
    const built = [...byName.keys()].sort();
    if (listed.join() !== built.join()) issues.push(`registry.json lists ${listed.join(", ")}`);
  }

  for (const item of manifest.items) {
    const raw = JSON.parse(await readFile(join(outDir, `${item.name}.json`), "utf8")) as unknown;
    const parsed = registryItemSchema.safeParse(raw);
    if (!parsed.success) {
      issues.push(`${item.name}: ${parsed.error.message}`);
      continue;
    }
    const built = parsed.data;
    const closure = itemClosure(item.name, byName, ({ items }) => items);

    for (const dependency of item.dependencies) {
      const name = dependencyName(dependency);
      const range = dependency.slice(name.length + 1);
      if (name.startsWith(`${registryNamespace}/`) && (range === "" || !validRange(range))) {
        issues.push(`${item.name}: ${name} has no version range`);
      } else if (!name.startsWith(`${registryNamespace}/`) && dependency !== name) {
        issues.push(`${item.name}: ${dependency} pins a third-party package; list it bare`);
      }
      if (dragAndDropPackages.some((pattern) => pattern.test(name))) {
        issues.push(`${item.name}: depends on ${name}, but drag and drop stays optional`);
      }
    }
    const declared = [...(built.dependencies ?? [])].sort();
    const expected = [...item.dependencies].sort();
    if (declared.join() !== expected.join()) {
      issues.push(
        `${item.name}: dependencies ${declared.join(", ")} should be ${expected.join(", ")}`,
      );
    }

    for (const dependency of built.registryDependencies ?? []) {
      if (!dependency.startsWith("http")) continue;
      const name = dependency.startsWith(`${manifest.baseUrl}/`)
        ? dependency.slice(manifest.baseUrl.length + 1).replace(/\.json$/u, "")
        : null;
      if (!name || !byName.has(name)) {
        issues.push(`${item.name}: ${dependency} isn't an item under ${manifest.baseUrl}`);
      }
    }
    const installs = [...(built.registryDependencies ?? [])].sort();
    const listed = [
      ...item.components,
      ...item.items.map((name) => `${manifest.baseUrl}/${name}.json`),
    ].sort();
    if (installs.join() !== listed.join()) {
      issues.push(`${item.name}: registryDependencies differ from compatibility.json`);
    }
    const files = (built.files ?? []).map(({ target }) => target ?? "");
    if (files.join() !== item.targets.join()) {
      issues.push(`${item.name}: files differ from compatibility.json`);
    }

    const compatibility = (built.meta?.compatibility ?? {}) as Record<string, string>;
    if (JSON.stringify(compatibility) !== JSON.stringify(item.compatibility)) {
      issues.push(`${item.name}: meta.compatibility differs from compatibility.json`);
    }
    for (const [name, range] of Object.entries(compatibility)) {
      const version = manifest.runtime[name];
      if (!version || !satisfies(version, range, { includePrerelease: true })) {
        issues.push(
          `${item.name}: needs ${name}@${range}, but the workspace has ${version ?? "none"}`,
        );
      }
    }

    for (const file of built.files ?? []) {
      const target = file.target ?? "";
      const owner = owners.get(target);
      if (owner) issues.push(`${item.name}: ${target} is also written by ${owner}`);
      owners.set(target, item.name);
      const content = file.content ?? "";
      if (content.length === 0) issues.push(`${item.name}: ${target} is empty`);
      for (const specifier of importsOf(content)) {
        const problem = importIssue(specifier, target, item, closure);
        if (problem) issues.push(problem);
        if (dragAndDropPackages.some((pattern) => pattern.test(packageName(specifier)))) {
          issues.push(
            `${item.name}: ${target} imports ${specifier}, but drag and drop stays optional`,
          );
        }
      }
    }
  }

  const full = byName.get(fullItemName);
  if (!full) issues.push(`There is no ${fullItemName} item`);
  else {
    if (full.targets.length > 0)
      issues.push(`${fullItemName} owns files instead of composing items`);
    const missing = manifest.items
      .filter(({ name }) => name !== fullItemName && !full.items.includes(name))
      .map(({ name }) => name);
    if (missing.length > 0) issues.push(`${fullItemName} doesn't install ${missing.join(", ")}`);
  }

  return issues;
}
