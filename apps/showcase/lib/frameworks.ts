/**
 * The docs exist once for each framework: `/docs/react/…` and `/docs/solid/…`. A page's address
 * names its framework, so a link, a search result and a server render never have to guess it.
 *
 * This file has no imports, so the MDX compiler (`source.config.ts`), the server, the browser and
 * the tests all read the same rules.
 */

export const frameworks = ["react", "solid"] as const;

export type Framework = (typeof frameworks)[number];

/** Where an address without a framework leads when nothing remembers a choice. */
export const defaultFramework: Framework = "react";

export const frameworkNames: Record<Framework, string> = { react: "React", solid: "Solid" };

/**
 * The cookie that remembers the framework a reader last read. `next.config.mjs` reads it to send
 * `/docs` and the packages' short addresses to that framework's pages.
 */
export const frameworkCookie = "docs-framework";

export function isFramework(value: unknown): value is Framework {
  return frameworks.some((framework) => framework === value);
}

export function otherFramework(framework: Framework): Framework {
  return framework === "react" ? "solid" : "react";
}

/** `/docs/react` for `""`, `/docs/react/views/month` for `"views/month"`. */
export function docsUrl(framework: Framework, path = ""): string {
  return path === "" ? `/docs/${framework}` : `/docs/${framework}/${path}`;
}

export interface DocsAddress {
  readonly framework: Framework;
  /** The page inside its framework's docs: `""` for the introduction, else `views/month`. */
  readonly path: string;
}

/** Reads `/docs/solid/api/components` as Solid's `api/components`. Other addresses give nothing. */
export function parseDocsUrl(url: string): DocsAddress | undefined {
  const match = /^\/docs\/([^/?#]+)(?:\/([^?#]*))?/u.exec(url);
  const framework = match?.[1];
  if (!isFramework(framework)) return undefined;
  return { framework, path: (match?.[2] ?? "").replace(/\/+$/u, "") };
}

const docsLink = /^\/docs(?=[/?#]|$)/u;
/** A link that names its framework: a page, or a page's Markdown (`/docs/solid.md`). */
const framedLink = /^\/docs\/(?:react|solid)(?=[/.?#]|$)/u;

/**
 * A link as a page of one framework's docs. Pages are written with links that name no framework
 * (`/docs/installation#temporal`), and each framework's build points them at its own pages. A link
 * that names a framework already (`/docs/react/views`) keeps it, which is how a Solid page links to
 * a React one on purpose.
 */
export function frameworkHref(href: string, framework: Framework): string {
  if (!docsLink.test(href) || framedLink.test(href)) return href;
  return `/docs/${framework}${href.slice("/docs".length)}`;
}

/**
 * The page to open when a reader of `url` switches to `target`: the same page when that framework
 * has it, else the nearest section above it that it has, and its introduction at last.
 */
export function twinUrl(url: string, target: Framework, exists: (url: string) => boolean): string {
  const address = parseDocsUrl(url);
  if (address === undefined) return docsUrl(target);

  const segments = address.path === "" ? [] : address.path.split("/");
  for (let length = segments.length; length > 0; length -= 1) {
    const candidate = docsUrl(target, segments.slice(0, length).join("/"));
    if (exists(candidate)) return candidate;
  }
  return docsUrl(target);
}

/** A page's source file names its framework when only one has it: `quick-start.solid.mdx`. */
const frameworkSuffix = /\.(react|solid)(?=\.mdx?$)/u;

/** `quick-start.solid.mdx` is Solid's `quick-start.mdx`; a file without a suffix is both sets'. */
export function withoutFrameworkSuffix(path: string): string {
  return path.replace(frameworkSuffix, "");
}

/** The framework a source file is written for, when its name says so. */
export function frameworkOfFile(path: string): Framework | undefined {
  const framework = frameworkSuffix.exec(path)?.[1];
  return isFramework(framework) ? framework : undefined;
}
