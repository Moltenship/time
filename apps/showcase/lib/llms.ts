import type { InferPageType } from "fumadocs-core/source";

import { llmsComponents } from "@/lib/llms-components";
import {
  formatIndex,
  formatPage,
  rewriteLinks,
  siteLink,
  siteUrl,
  type DocLink,
  type IndexSection,
} from "@/lib/llms-format";
import { source } from "@/lib/source";

export type DocsPage = InferPageType<typeof source>;

const summary =
  "A headless calendar for React, with a Solid preview: week, day, month, year, agenda and " +
  "resource views, drag and keyboard editing, time zones and recurrence, built on ui-sdk so an AI " +
  "agent can read the calendar and act on it.";

/** Pages a reader short of context can skip; llms.txt lists them under "Optional". */
const optional: ReadonlySet<string> = new Set([
  "/docs/comparison",
  "/docs/migrating-to-2",
  "/docs/theme-builder",
]);

interface PageGroup {
  readonly title: string;
  readonly pages: readonly DocsPage[];
}

/** The pages in the sidebar's order: the top-level pages first, then each folder as a group. */
export function pageGroups(): PageGroup[] {
  const tree = source.getPageTree();
  const top: DocsPage[] = [];
  const folders: PageGroup[] = [];
  const page = (url: string) => source.getPageByUrl(url);

  type Node = (typeof tree.children)[number];
  const collect = (nodes: readonly Node[], into: DocsPage[]) => {
    for (const node of nodes) {
      if (node.type === "page") {
        const found = page(node.url);
        if (found !== undefined) into.push(found);
      } else if (node.type === "folder") {
        const index = node.index === undefined ? undefined : page(node.index.url);
        if (index !== undefined) into.push(index);
        collect(node.children, into);
      }
    }
  };

  for (const node of tree.children) {
    if (node.type === "page") {
      const found = page(node.url);
      if (found !== undefined) top.push(found);
    } else if (node.type === "folder") {
      const pages: DocsPage[] = [];
      collect([node], pages);
      folders.push({ title: typeof node.name === "string" ? node.name : "More", pages });
    }
  }

  return [{ title: "Docs", pages: top }, ...folders];
}

/** Every page once, in the sidebar's order. */
export function orderedPages(): DocsPage[] {
  return pageGroups().flatMap((group) => group.pages);
}

/** A page as Markdown, with no JSX left in it and its links to other pages made by `link`. */
export async function pageMarkdown(page: DocsPage, link: DocLink = siteLink): Promise<string> {
  const source = `${siteUrl}${page.url}`;
  const body = await page.data.getText("processed", { components: llmsComponents(source) });

  return formatPage({
    title: page.data.title,
    description: page.data.description,
    source,
    body: rewriteLinks(body, link),
  });
}

/** The llms.txt index. `link` says where each page's Markdown is; `notes` follow the summary. */
export function llmsIndex(link: DocLink, notes: readonly string[]): string {
  const sections: IndexSection[] = [];
  const skippable: DocsPage[] = [];

  for (const group of pageGroups()) {
    const pages = group.pages.filter((page) => {
      if (!optional.has(page.url)) return true;
      skippable.push(page);
      return false;
    });
    sections.push({ title: group.title, links: pages.map((page) => indexLink(page, link)) });
  }
  sections.push({ title: "Optional", links: skippable.map((page) => indexLink(page, link)) });

  return formatIndex({ title: "Moltenship Time", summary, notes, sections });
}

function indexLink(page: DocsPage, link: DocLink) {
  return {
    title: page.data.title,
    href: link(page.url, ""),
    description: page.data.description,
  };
}

/** Every page's Markdown in one document, in the sidebar's order. */
export async function llmsFull(link: DocLink = siteLink): Promise<string> {
  const pages = await Promise.all(orderedPages().map((page) => pageMarkdown(page, link)));
  return pages.join("\n");
}
