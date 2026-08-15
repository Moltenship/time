import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

const ignoredDirectories = new Set([".git", ".vite", "coverage", "dist", "node_modules"]);
const sourceExtensions = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const explicitSourceExtension = /\.(?:[cm]?[jt]s|[jt]sx)$/;

async function findSourceFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return ignoredDirectories.has(entry.name) ? [] : findSourceFiles(path);
      }
      return entry.isFile() && sourceExtensions.has(extname(entry.name)) ? [path] : [];
    }),
  );
  return files.flat();
}

function findExplicitSpecifiers(
  source: string,
): readonly { readonly line: number; readonly text: string }[] {
  const specifiers: { line: number; text: string }[] = [];
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /^\s*import\s*["']([^"']+)["']/g,
  ];

  for (const [index, line] of source.split("\n").entries()) {
    if (/^\s*(?:\/\/|\/\*|\*)/.test(line)) continue;
    for (const pattern of patterns) {
      for (const match of line.matchAll(pattern)) {
        const prefix = line.slice(0, match.index);
        const specifier = match[1];
        if (!/["'`]/.test(prefix) && specifier && explicitSourceExtension.test(specifier)) {
          specifiers.push({ line: index + 1, text: specifier });
        }
      }
    }
  }

  return specifiers;
}

describe("module specifier conventions", () => {
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
});
