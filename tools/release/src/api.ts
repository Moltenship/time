import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { parseSync } from "vite-plus";

import {
  compare,
  parseArguments,
  readPublishedPackages,
  runMain,
  type PackageManifest,
  type WorkspacePackage,
} from "./workspace";

export const apiReportFile = "api-report.md";

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Comment extends Span {
  readonly type: string;
  readonly value: string;
}

interface Node extends Span {
  readonly type: string;
  readonly id?: { readonly name?: string; readonly value?: string } | null;
  readonly declarations?: readonly { readonly id: { readonly name?: string } }[];
  readonly declaration?: Node | null;
  readonly specifiers?: readonly (Span & { readonly type: string })[];
  readonly source?: { readonly raw?: string } | null;
  readonly exportKind?: string;
  readonly importKind?: string;
}

const deprecatedMarker = "/** @deprecated */";

function isDeprecation(comment: Comment): boolean {
  return comment.type === "Block" && /@deprecated\b/.test(comment.value);
}

/**
 * The public API of one declaration file, as text that only changes when the API does. Comments
 * and region markers are dropped, except `/// <reference>` directives and a `@deprecated` marker
 * where docs deprecate something. Declarations are sorted by name (overloads keep their order),
 * and imports and exports are listed one per line.
 */
export function apiDeclarations(source: string, fileName = "index.d.mts"): string {
  const { program, comments, errors } = parseSync(fileName, source, { lang: "dts" }) as unknown as {
    readonly program: { readonly body: readonly Node[] };
    readonly comments: readonly Comment[];
    readonly errors: readonly { readonly message: string }[];
  };
  if (errors.length > 0) throw new Error(`Cannot parse ${fileName}: ${errors[0]!.message}`);

  const text = (span: Span) => normalize(withoutComments(source, span, comments));
  const references = comments
    .filter(({ type, value }) => type === "Line" && /^\/\s*<reference\b/.test(value))
    .map(({ value }) => `//${value.trim()}`);
  const imports: string[] = [];
  const declarations: { readonly name: string; readonly text: string }[] = [];
  const exported: string[] = [];
  const reexports: string[] = [];

  let previousEnd = 0;
  for (const statement of program.body) {
    const leading = comments.filter(
      ({ start, end }) => start >= previousEnd && end <= statement.start,
    );
    previousEnd = statement.end;
    const from = statement.source?.raw;
    // One declaration file per entry point is all the report reads. A chunk would hide its API.
    if (from && /^["']\./.test(from)) {
      throw new Error(
        `${fileName} imports ${from}. API reports read one declaration file per entry point; teach tools/release/src/api.ts to follow chunks.`,
      );
    }
    const specifiers = statement.specifiers ?? [];
    if (
      statement.type === "ImportDeclaration" &&
      specifiers.length > 0 &&
      specifiers.every(({ type }) => type === "ImportSpecifier")
    ) {
      const keyword = statement.importKind === "type" ? "import type" : "import";
      imports.push(`${keyword} ${list(specifiers.map(text))} from ${from};`);
    } else if (
      statement.type === "ImportDeclaration" ||
      statement.type === "ExportAllDeclaration"
    ) {
      (statement.type === "ImportDeclaration" ? imports : reexports).push(text(statement));
    } else if (statement.type === "ExportNamedDeclaration" && !statement.declaration) {
      const prefix = statement.exportKind === "type" ? "type " : "";
      const names = specifiers.map((specifier) => prefix + text(specifier));
      if (from) reexports.push(`export ${list(names)} from ${from};`);
      else exported.push(...names);
    } else {
      const marker = leading.some(isDeprecation) ? `${deprecatedMarker}\n` : "";
      declarations.push({ name: declarationName(statement), text: marker + text(statement) });
    }
  }

  const sections = [
    references.join("\n"),
    imports.sort(compare).join("\n"),
    // Array#sort is stable, so overloads and merged declarations keep their source order.
    declarations
      .sort((a, b) => compare(a.name, b.name))
      .map((declaration) => declaration.text)
      .join("\n"),
    reexports.sort(compare).join("\n"),
    exported.length > 0 ? `export ${list(exported)};` : "",
  ];
  return sections.filter(Boolean).join("\n\n");
}

/** Import or export specifiers, one per line, sorted by name whether or not they are types. */
function list(specifiers: readonly string[]): string {
  const name = (specifier: string) => specifier.replace(/^type /, "");
  const lines = [...specifiers]
    .sort((a, b) => compare(name(a), name(b)) || compare(a, b))
    .map((specifier) => `  ${specifier},`);
  return `{\n${lines.join("\n")}\n}`;
}

function declarationName(node: Node): string {
  const target = node.declaration ?? node;
  if (target.id) return target.id.name ?? target.id.value ?? target.type;
  if (target.declarations) return target.declarations.map(({ id }) => id.name ?? "").join(", ");
  return target.type === "ExportDefaultDeclaration" ? "default" : target.type;
}

function withoutComments(source: string, span: Span, comments: readonly Comment[]): string {
  let text = "";
  let cursor = span.start;
  for (const comment of comments) {
    if (comment.end <= span.start || comment.start >= span.end) continue;
    text += source.slice(cursor, comment.start) + (isDeprecation(comment) ? deprecatedMarker : "");
    cursor = comment.end;
  }
  return text + source.slice(cursor, span.end);
}

function normalize(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n");
}

/** The committed report for a package: one section per entry point. */
export async function apiReport(entry: WorkspacePackage): Promise<string> {
  const sections: string[] = [];
  const entryPoints = typeEntryPoints(entry.manifest);
  if (entryPoints.size === 0) {
    throw new Error(`${entry.manifest.name} has no typed entry point in publishConfig.exports`);
  }
  for (const [subpath, file] of entryPoints) {
    let source: string;
    try {
      source = await readFile(join(entry.path, file), "utf8");
    } catch {
      throw new Error(`${entry.manifest.name}: ${file} is missing. Build the packages first.`);
    }
    const label =
      subpath === "." ? entry.manifest.name : `${entry.manifest.name}/${subpath.slice(2)}`;
    sections.push(`## \`${label}\`\n\n\`\`\`ts\n${apiDeclarations(source, file)}\n\`\`\``);
  }
  return (
    [
      `# ${entry.manifest.name} API report`,
      "Made by `vp run release:api:update` from the built declarations. Don't edit it by hand. When the public API changes on purpose, regenerate the report and review its diff with the change.",
      ...sections,
    ].join("\n\n") + "\n"
  );
}

function typeEntryPoints(manifest: PackageManifest): Map<string, string> {
  const entries = new Map<string, string>();
  for (const [subpath, target] of Object.entries(manifest.publishConfig?.exports ?? {})) {
    if (subpath === "./package.json" || typeof target === "string") continue;
    if (target.types) entries.set(subpath, target.types);
  }
  return entries;
}

/** Lines only in `before` (-) or only in `after` (+), from a longest-common-subsequence diff. */
export function lineDiff(before: string, after: string, limit = 60): string[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const width = b.length + 1;
  const lengths = new Int32Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        a[i] === b[j]
          ? lengths[(i + 1) * width + j + 1]! + 1
          : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!);
    }
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      i += 1;
      j += 1;
    } else if (
      i < a.length &&
      (j === b.length || lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!)
    ) {
      // On a tie, removals come first, as in `git diff`.
      lines.push(`- ${a[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${b[j]}`);
      j += 1;
    }
  }
  return lines.length > limit
    ? [...lines.slice(0, limit), `… and ${lines.length - limit} more changed lines`]
    : lines;
}

/** Packages whose built API differs from their committed report. With `update`, rewrites the reports. */
export async function checkApiReports(
  packages: readonly WorkspacePackage[],
  { update = false } = {},
): Promise<void> {
  const changed: string[] = [];
  for (const entry of packages) {
    const reportPath = join(entry.path, apiReportFile);
    const next = await apiReport(entry);
    const current = await readFile(reportPath, "utf8").catch(() => "");
    if (current === next) continue;
    if (update) {
      await writeFile(reportPath, next);
      console.log(`Updated packages/${entry.directory}/${apiReportFile}`);
      continue;
    }
    const diff = current ? lineDiff(current, next) : ["(no report yet)"];
    changed.push(`${entry.manifest.name}:\n${diff.map((line) => `    ${line}`).join("\n")}`);
  }
  if (changed.length > 0) {
    throw new Error(
      [
        "The public API differs from the committed API reports:",
        ...changed,
        "If the change is intended, run `vp run release:api:update` and commit the reports.",
      ].join("\n"),
    );
  }
}

runMain(import.meta, async () => {
  const update = parseArguments(process.argv.slice(2), ["update"]).flags.has("update");
  await checkApiReports(await readPublishedPackages(), { update });
  if (!update) console.log("API reports match the build.");
});
