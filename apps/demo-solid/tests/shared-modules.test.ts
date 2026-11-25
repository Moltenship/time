import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

/**
 * The Solid demo shares the React demo's state and logic (`@demo/*`, apps/demo/src) and must reach
 * no React through them. dependency-cruiser doesn't resolve the alias, so this follows it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const solidSource = resolve(here, "../src");
const demoSource = resolve(here, "../../demo/src");

const specifiers = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/(?:from|import)\s*["']([^"']+)["']/gu)].map(
    (match) => match[1]!,
  );

function filesIn(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesIn(join(directory, entry.name))
      : /\.tsx?$/u.test(entry.name)
        ? [join(directory, entry.name)]
        : [],
  );
}

function resolveModule(path: string) {
  const found = ["", ".ts", ".tsx", "/index.ts"].map((ending) => path + ending).find(existsSync);
  if (found === undefined) throw new Error(`can't resolve ${path}`);
  return found;
}

/** The React demo's files the Solid demo reaches, with the packages each imports. */
function sharedModules() {
  const reached = new Map<string, string[]>();
  const queue = filesIn(solidSource)
    .flatMap(specifiers)
    .filter((specifier) => specifier.startsWith("@demo/"))
    .map((specifier) => resolveModule(join(demoSource, specifier.slice("@demo/".length))));
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (reached.has(file)) continue;
    const imports = specifiers(file);
    reached.set(
      file,
      imports.filter((specifier) => !specifier.startsWith(".")),
    );
    for (const specifier of imports) {
      if (specifier.startsWith(".")) queue.push(resolveModule(resolve(dirname(file), specifier)));
    }
  }
  return reached;
}

describe("the React demo's modules the Solid demo shares", () => {
  test("reach no React", () => {
    const modules = sharedModules();
    const react = /^(?:react|react-dom|lucide-react|@ui-sdk\/react|@dnd-kit\/|@stylexjs\/)/u;
    const offenders = [...modules].flatMap(([file, packages]) =>
      packages
        .filter((name) => react.test(name))
        .map((name) => `${relative(demoSource, file)} imports ${name}`),
    );

    expect(modules.size).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });
});
