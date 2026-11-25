/**
 * The text side of the docs for agents: the `llms.txt` index, a page's Markdown and its links.
 * Pure functions, so the site's routes and the docs packaged with `@moltenship/calendar` format
 * the same pages the same way (`lib/llms.ts` reads the pages; `scripts/package-docs.ts` writes the
 * packaged copy).
 */

import { siteUrl } from "./site";

export { siteUrl };

/** Turns a docs URL such as `/docs/agents/connect`, and its `#hash` if any, into a link target. */
export type DocLink = (url: string, hash: string) => string;

/** A page's file in a folder of Markdown docs: `/docs` is `index.md`, `/docs/a/b` is `a/b.md`. */
export function markdownPath(url: string): string {
  const path = url.replace(/^\/docs\/?/u, "").replace(/\/$/u, "");
  return path === "" ? "index.md" : `${path}.md`;
}

/** Links for the site: each page's Markdown version, as an absolute URL an agent can fetch. */
export const siteLink: DocLink = (url, hash) =>
  `${siteUrl}${url === "/docs" ? "/docs.md" : `${url.replace(/\/$/u, "")}.md`}${hash}`;

/** Links for a folder of Markdown files: relative paths from the file that has the link. */
export function fileLink(from: string): DocLink {
  const here = markdownPath(from).split("/").slice(0, -1);
  return (url, hash) => {
    const target = markdownPath(url).split("/");
    let shared = 0;
    while (shared < here.length && shared < target.length - 1 && here[shared] === target[shared]) {
      shared += 1;
    }
    const up = here.length - shared;
    const path = [...Array.from({ length: up }, () => ".."), ...target.slice(shared)].join("/");
    return `${up === 0 ? "./" : ""}${path}${hash}`;
  };
}

const fence = /^ {0,3}(`{3,}|~{3,})/u;
const docsLink = /\]\((\/docs(?:\/[^\s)#]*)?)(#[^\s)]*)?\)/gu;
const siteRootLink = /\]\((\/(?!\/)[^\s)]*)\)/gu;

/**
 * Rewrites the docs' own links (`/docs/...`) with `link`, and makes any other link to the site
 * absolute. Code samples are left alone: a path in a fenced block is code, not a link.
 */
export function rewriteLinks(markdown: string, link: DocLink): string {
  let closing: string | undefined;

  return markdown
    .split("\n")
    .map((line) => {
      const marker = fence.exec(line)?.[1];
      if (closing !== undefined) {
        if (marker !== undefined && marker[0] === closing[0] && marker.length >= closing.length) {
          closing = undefined;
        }
        return line;
      }
      if (marker !== undefined) {
        closing = marker;
        return line;
      }
      return line
        .replace(docsLink, (_match, url: string, hash: string | undefined) => {
          return `](${link(url, hash ?? "")})`;
        })
        .replace(siteRootLink, (match, path: string) =>
          // A docs page was rewritten above. `/docs.md` is a site address, not a page.
          /^\/docs(?:[/#]|$)/u.test(path) ? match : `](${siteUrl}${path})`,
        );
    })
    .join("\n");
}

export interface PageText {
  readonly title: string;
  readonly description?: string | undefined;
  /** The page on the site, where its live examples run. */
  readonly source: string;
  readonly body: string;
}

/** One page as a Markdown document. */
export function formatPage({ title, description, source, body }: PageText): string {
  return [
    `# ${title}`,
    ...(description === undefined || description === "" ? [] : [description]),
    `Source: ${source}`,
    body.trim(),
  ]
    .join("\n\n")
    .concat("\n");
}

export interface IndexLink {
  readonly title: string;
  readonly href: string;
  readonly description?: string | undefined;
}

export interface IndexSection {
  readonly title: string;
  readonly links: readonly IndexLink[];
}

export interface IndexText {
  readonly title: string;
  readonly summary: string;
  /** Paragraphs between the summary and the first section. */
  readonly notes: readonly string[];
  readonly sections: readonly IndexSection[];
}

/**
 * An index in the llms.txt format (https://llmstxt.org): an H1 with the project's name, a
 * blockquote that sums it up, free text, then an H2 for each list of links. A section named
 * "Optional" holds what a reader short of context can skip.
 */
export function formatIndex({ title, summary, notes, sections }: IndexText): string {
  const lists = sections
    .filter((section) => section.links.length > 0)
    .map((section) =>
      [
        `## ${section.title}`,
        "",
        ...section.links.map(({ title: name, href, description }) => {
          const text = description?.replace(/\s+/gu, " ").trim();
          return `- [${name}](${href})${text === undefined || text === "" ? "" : `: ${text}`}`;
        }),
      ].join("\n"),
    );

  return [`# ${title}`, `> ${summary}`, ...notes, ...lists].join("\n\n").concat("\n");
}

/**
 * A page's name in the index: "Views: Month" for a page in a folder. A page named as its folder
 * is, such as a folder's index page, isn't named twice.
 */
export function groupedLabel(title: string, folder: string | undefined): string {
  if (folder === undefined) return title;
  if (folder === title) return title;
  return `${folder}: ${title}`;
}
