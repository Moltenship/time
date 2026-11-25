import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { type Framework, frameworkOfFile, withoutFrameworkSuffix } from "@/lib/frameworks";

/**
 * The docs' pages as their files say they are, for the tests of the routing and of the Solid
 * pages. It reads `content/docs` alone, not the compiled pages, so it runs before any build and
 * in a copy of this app outside the workspace.
 */
export const contentRoot = path.join(import.meta.dirname, "../content/docs");

export interface DocsFile {
  /** From `content/docs`: `quick-start.solid.mdx`. */
  readonly file: string;
  /** The one framework whose docs have the page, when the file's name says so. */
  readonly framework: Framework | undefined;
  /** The page's address inside a framework's docs: `""`, `views/month`. */
  readonly path: string;
  readonly source: string;
}

export function docsFiles(): DocsFile[] {
  return readdirSync(contentRoot, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.split(path.sep).join("/"))
    .sort()
    .map((file) => ({
      file,
      framework: frameworkOfFile(file),
      path: withoutFrameworkSuffix(file)
        .replace(/\.mdx$/u, "")
        .replace(/(?:^|\/)index$/u, ""),
      source: readFileSync(path.join(contentRoot, file), "utf8"),
    }));
}

/** The pages one framework's docs have: its own files, and the files that name no framework. */
export function pagesOf(framework: Framework): Set<string> {
  return new Set(
    docsFiles()
      .filter((file) => file.framework === undefined || file.framework === framework)
      .map((file) => file.path),
  );
}

/** Every link a sidebar file (`meta.json`) holds: `[Recurrence](/docs/api/recurrence)`. */
export function sidebarLinks(): { readonly file: string; readonly url: string }[] {
  return readdirSync(contentRoot, { recursive: true, encoding: "utf8" })
    .filter((file) => path.basename(file) === "meta.json")
    .flatMap((file) => {
      const meta: unknown = JSON.parse(readFileSync(path.join(contentRoot, file), "utf8"));
      const pages = isRecord(meta) && Array.isArray(meta.pages) ? meta.pages : [];
      return pages.flatMap((entry) => {
        const url =
          typeof entry === "string" ? /^\[[^\]]*\]\((.+)\)$/u.exec(entry)?.[1] : undefined;
        return url === undefined ? [] : [{ file, url }];
      });
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
