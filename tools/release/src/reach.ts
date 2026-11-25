import { readFile } from "node:fs/promises";
import { dirname, join, normalize, posix } from "node:path";

import { copiedRootFiles, workspaceFiles } from "./isolated";
import { workspaceRoot } from "./workspace";

/** A reference from a copied file to a path the copy doesn't have. */
export interface OutsideReference {
  /** The file that refers, relative to the workspace. */
  readonly file: string;
  /** What it wrote. */
  readonly reference: string;
  /** Where that lands, relative to the workspace. */
  readonly target: string;
}

const code = /\.(?:[cm]?[jt]sx?)$/u;
const styles = /\.css$/u;
const docs = /\.mdx?$/u;
const tsconfig = /(?:^|\/)tsconfig(?:\.[\w-]+)?\.json$/u;

/** `from "…"`, `import "…"`, `import("…")`, `require("…")` and `export … from "…"`. */
const codeReference =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'](\.{1,2}\/[^"']*)["']/gu;
/** `@import`, `@source`, `@plugin`, `@config` and `@reference` with a relative path. */
const styleReference = /@(?:import|source|plugin|config|reference)\s+["'](\.{1,2}\/[^"']*)["']/gu;
/** The docs site's `<include>` of a source file, with an optional `#region`. */
const includeReference = /<include\b[^>]*>\s*(\.{1,2}\/[^<#\s]+)/gu;
/** A fenced code block in Markdown: its imports are examples, not the page's. */
const fence = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gmu;

function* matches(source: string, pattern: RegExp): Generator<string> {
  for (const match of source.matchAll(pattern)) yield match[1]!;
}

/** The relative paths a file refers to, as written. */
export function referencesIn(file: string, source: string): string[] {
  if (tsconfig.test(file)) {
    const config = JSON.parse(source) as {
      readonly extends?: string | readonly string[];
      readonly compilerOptions?: {
        readonly baseUrl?: string;
        readonly paths?: Readonly<Record<string, readonly string[]>>;
      };
    };
    const base = config.compilerOptions?.baseUrl ?? ".";
    const extended = [config.extends ?? []].flat().filter((path) => path.startsWith("."));
    const mapped = Object.values(config.compilerOptions?.paths ?? {})
      .flat()
      .map((target) => posix.join(base, target).replace(/\*.*$/u, ""));
    return [...extended, ...mapped];
  }
  if (code.test(file)) return [...matches(source, codeReference)];
  if (styles.test(file)) return [...matches(source, styleReference)];
  if (docs.test(file)) {
    const page = source.replace(fence, "");
    return [...matches(page, codeReference), ...matches(page, includeReference)];
  }
  return [];
}

/**
 * Every relative reference in the copied folders' files, from imports and styles to MDX includes
 * and tsconfig `extends` and `paths`, that lands outside them and the root files the copy writes.
 * A copy outside the workspace can't resolve it, so its build fails only in the release gate.
 */
export async function referencesOutside(
  directories: readonly string[],
): Promise<OutsideReference[]> {
  // An import may leave out the file's extension.
  const inside = (target: string) =>
    copiedRootFiles.some((file) => file === target || file.replace(/\.[^./]+$/u, "") === target) ||
    directories.some((directory) => target === directory || target.startsWith(`${directory}/`));
  const outside: OutsideReference[] = [];
  for (const file of await workspaceFiles(directories)) {
    if (![code, styles, docs, tsconfig].some((kind) => kind.test(file))) continue;
    const source = await readFile(join(workspaceRoot, file), "utf8");
    for (const reference of referencesIn(file, source)) {
      const target = normalize(join(dirname(file), reference.replace(/[?#].*$/u, "")))
        .split("\\")
        .join("/")
        .replace(/\/$/u, "");
      if (!inside(target)) outside.push({ file, reference, target });
    }
  }
  return outside;
}
