import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".source",
  ".vite",
  "coverage",
  "dist",
  "node_modules",
]);
// Build output under a folder that also holds source: the docs' live Solid examples, which Vite
// writes into the folder Next.js serves.
const ignoredPaths = new Set([join("apps", "showcase", "public", "examples")]);
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const explicitSourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

async function findSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) || ignoredPaths.has(path)
          ? []
          : findSourceFiles(path);
      }
      return entry.isFile() &&
        entry.name !== "next-env.d.ts" &&
        sourceExtensions.has(extname(entry.name))
        ? [path]
        : [];
    }),
  );
  return files.flat();
}

/** Every static and dynamic import or re-export specifier in a source file, with its line. */
function findSpecifiers(
  source: string,
): readonly { readonly line: number; readonly text: string }[] {
  const specifiers: { line: number; text: string }[] = [];
  const linePatterns = [/\bfrom\s+["']([^"']+)["']/g, /^\s*import\s*["']([^"']+)["']/g];

  for (const [index, line] of source.split("\n").entries()) {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;
    for (const pattern of linePatterns) {
      for (const match of line.matchAll(pattern)) {
        const prefix = line.slice(0, match.index);
        const specifier = match[1];
        if (!/["'`]/.test(prefix) && specifier) {
          specifiers.push({ line: index + 1, text: specifier });
        }
      }
    }
  }

  for (const match of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/gs)) {
    const specifier = match[1];
    if (specifier) {
      const specifierOffset = match.index + match[0].indexOf(specifier);
      specifiers.push({
        line: source.slice(0, specifierOffset).split("\n").length,
        text: specifier,
      });
    }
  }

  return specifiers;
}

function findExplicitSpecifiers(
  source: string,
): readonly { readonly line: number; readonly text: string }[] {
  return findSpecifiers(source).filter(({ text }) => explicitSourceExtension.test(text));
}

/**
 * Why a `@ui-sdk/*` specifier isn't a public entry point of its package, or null when it is.
 * ui-sdk is pre-1.0: only the subpaths its `exports` lists are its API, and `internal` never is.
 * `exported` is that list, or undefined when the package can't be found from the importing file.
 */
function uiSdkSpecifierProblem(
  specifier: string,
  exported: readonly string[] | undefined,
): string | null {
  const match = /^@ui-sdk\/([^/]+)(?:\/(.+))?$/u.exec(specifier);
  if (match === null) return null;
  const subpath = match[2] === undefined ? "." : `./${match[2]}`;
  if (/(?:^|\/)internal(?:\/|$)/u.test(subpath)) return "imports ui-sdk's internals";
  if (exported === undefined) return `@ui-sdk/${match[1]} isn't a dependency here`;
  const isExported = exported.some((entry) =>
    entry.includes("*")
      ? subpath.startsWith(entry.slice(0, entry.indexOf("*")))
      : entry === subpath,
  );
  return isExported ? null : `@ui-sdk/${match[1]} doesn't export ${subpath}`;
}

/** The subpaths a ui-sdk package exports, as installed for the file that imports it. */
async function uiSdkExports(fromFile: string, packageName: string) {
  try {
    const manifestPath = createRequire(resolve(fromFile)).resolve(`${packageName}/package.json`);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as {
      readonly exports?: Readonly<Record<string, unknown>>;
    };
    return Object.keys(manifest.exports ?? {});
  } catch {
    return undefined;
  }
}

// The boundary test's deliberately invalid imports, ui-sdk's internals among them.
const invalidBoundaryFixtures = join("tests", "fixtures", "dependency-boundaries");

describe("module specifier conventions", () => {
  test("detects explicit extensions in multiline dynamic imports", () => {
    const source = ["const load = import(", '  "./module.ts"', ");"].join("\n");

    expect(findExplicitSpecifiers(source)).toEqual([{ line: 2, text: "./module.ts" }]);
  });

  test("keeps source import and export specifiers extensionless", async () => {
    const violations: string[] = [];

    for (const path of await findSourceFiles(".")) {
      const source = await readFile(path, "utf8");
      violations.push(
        ...findExplicitSpecifiers(source).map(
          ({ line, text }) => `${path}:${line} ${JSON.stringify(text)}`,
        ),
      );
    }

    expect(violations).toEqual([]);
  });

  test("a ui-sdk specifier must name an entry point its package exports", () => {
    const exported = [".", "./agent", "./calendar", "./package.json"];

    expect(uiSdkSpecifierProblem("@ui-sdk/core", exported)).toBeNull();
    expect(uiSdkSpecifierProblem("@ui-sdk/core/agent", exported)).toBeNull();
    expect(uiSdkSpecifierProblem("react", undefined)).toBeNull();
    expect(uiSdkSpecifierProblem("@ui-sdk/core/internal/store", exported)).toBe(
      "imports ui-sdk's internals",
    );
    expect(uiSdkSpecifierProblem("@ui-sdk/core/internal", [...exported, "./internal"])).toBe(
      "imports ui-sdk's internals",
    );
    expect(uiSdkSpecifierProblem("@ui-sdk/core/dist/index.js", exported)).toBe(
      "@ui-sdk/core doesn't export ./dist/index.js",
    );
    expect(uiSdkSpecifierProblem("@ui-sdk/solid", undefined)).toBe(
      "@ui-sdk/solid isn't a dependency here",
    );
  });

  test("source imports ui-sdk only through the entry points its packages export", async () => {
    const violations: string[] = [];

    // Dot directories hold copies of the repository, such as agent worktrees.
    for (const path of await findSourceFiles(".")) {
      if (path.startsWith(invalidBoundaryFixtures) || path.startsWith(".")) continue;
      const source = await readFile(path, "utf8");
      for (const { line, text } of findSpecifiers(source)) {
        if (!text.startsWith("@ui-sdk/")) continue;
        const packageName = text.split("/").slice(0, 2).join("/");
        const problem = uiSdkSpecifierProblem(text, await uiSdkExports(path, packageName));
        if (problem !== null)
          violations.push(`${path}:${line} ${JSON.stringify(text)}: ${problem}`);
      }
    }

    expect(violations).toEqual([]);
  });
});
