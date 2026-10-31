import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { DemoCalendar } from "../src/calendar";
import { demoViewNames } from "../src/demo-model";

const source = fileURLToPath(new URL("../src", import.meta.url));
const registry = fileURLToPath(new URL("../../../registry", import.meta.url));

// `import x from "y"`, `export * from "y"`, `import "y"` and `import("y")`, keeping `type`.
const importPattern =
  /(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^"'`;]*?\sfrom\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/gu;
const cssImportPattern = /@import\s+["']([^"']+)["']/gu;

interface Found {
  /** The file that imports it. */
  readonly from: string;
  readonly specifier: string;
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = specifier.startsWith("@registry/")
    ? resolve(registry, specifier.slice("@registry/".length))
    : resolve(dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`].find(
    (candidate) => /\.[cm]?tsx?$|\.css$/u.test(candidate) && existsSync(candidate),
  );
}

/**
 * Every import a page's entry reaches through the demo's and the registry's files, CSS included.
 * Type-only ones erase.
 */
function importsFrom(entry: string): readonly Found[] {
  const found: Found[] = [];
  const seen = new Set<string>();
  const queue = [entry];
  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (seen.has(file)) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    const specifiers = file.endsWith(".css")
      ? [...text.matchAll(cssImportPattern)].map((match) => match[1])
      : [...text.matchAll(importPattern)]
          .filter((match) => match[1] === undefined)
          .map((match) => match[2] ?? match[3]);
    for (const specifier of specifiers) {
      if (specifier === undefined) continue;
      found.push({ from: file, specifier });
      const local =
        specifier.startsWith(".") || specifier.startsWith("@registry/")
          ? resolveLocal(file, specifier)
          : undefined;
      if (local !== undefined) queue.push(local);
    }
  }
  return found;
}

const breaking = (entry: string, breaks: (found: Found) => boolean) =>
  importsFrom(resolve(source, entry))
    .filter(breaks)
    .map(({ from, specifier }) => `${from} imports ${specifier}`);

describe("the two pages' import graphs", () => {
  test("reach something: the walk follows both pages' files", () => {
    const specifiers = (entry: string) =>
      importsFrom(resolve(source, entry)).map(({ specifier }) => specifier);

    expect(specifiers("stylex/main.tsx")).toContain("./app");
    expect(specifiers("stylex/main.tsx")).toContain("@astryxdesign/core/AppShell");
    expect(specifiers("stylex/main.tsx")).toContain(
      "@registry/stylex-time-grid-view/time-grid-view",
    );
    expect(specifiers("main.tsx")).toContain("@registry/time-grid-view/time-grid-view");
    expect(specifiers("main.tsx")).toContain("tailwindcss");
    expect(specifiers("stylex/main.tsx")).toContain("@astryxdesign/core/astryx.css");
  });

  test("the StyleX page reaches none of Tailwind's parts", () => {
    expect(
      breaking("stylex/main.tsx", ({ from, specifier }) => {
        if (specifier === "tailwindcss" || specifier.startsWith("tailwindcss/")) return true;
        if (specifier.startsWith("@registry/")) return !specifier.startsWith("@registry/stylex-");
        if (!specifier.startsWith(".")) return false;
        const target = resolve(dirname(from), specifier);
        return (
          target === resolve(source, "styles.css") ||
          target.startsWith(`${resolve(source, "components")}/`)
        );
      }),
    ).toEqual([]);
  });

  test("the Tailwind page reaches none of StyleX's or Astryx's parts", () => {
    expect(
      breaking("main.tsx", ({ from, specifier }) => {
        if (
          specifier.startsWith("@registry/stylex-") ||
          specifier.startsWith("@astryxdesign/") ||
          specifier.startsWith("@stylexjs/")
        ) {
          return true;
        }
        return (
          specifier.startsWith(".") &&
          resolve(dirname(from), specifier).startsWith(`${resolve(source, "stylex")}/`)
        );
      }),
    ).toEqual([]);
  });
});

// The StyleX page's views need StyleX's compiler to import; tools/a11y checks them.
test("the Tailwind page's views have the names the URL takes", () => {
  expect(DemoCalendar.views.map(({ name }) => name).toSorted()).toEqual(
    [...demoViewNames].toSorted(),
  );
});
