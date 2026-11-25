import type { InferPageType } from "fumadocs-core/source";

import { llmsComponents } from "@/lib/llms-components";
import {
  formatIndex,
  formatPage,
  groupedLabel,
  rewriteLinks,
  siteLink,
  siteUrl,
  type DocLink,
  type IndexSection,
} from "@/lib/llms-format";
import { source } from "@/lib/source";

export type DocsPage = InferPageType<typeof source>;

const summary =
  "A calendar on the Temporal API whose engine imports no UI framework. React renders it, with " +
  "week, day, month, year, agenda and resource views you copy and own, and drag and keyboard " +
  "editing. SolidJS 2 renders it as a preview, without those views. It is built on ui-sdk, so an " +
  "AI agent can read a calendar and act on it once the app creates a bridge. Version 2.0 is a " +
  "pre-release.";

/** Pages a reader short of context can skip; llms.txt lists them under "Optional". */
const optional: ReadonlySet<string> = new Set([
  "/docs/comparison",
  "/docs/migrating-to-2",
  "/docs/theme-builder",
]);

interface GroupedPage {
  readonly page: DocsPage;
  /** The page's title, with its folder's name before it for a page inside a folder. */
  readonly label: string;
}

interface PageGroup {
  readonly title: string;
  readonly pages: readonly GroupedPage[];
}

/**
 * The pages in the sidebar's order, grouped as the sidebar's separators group them. A folder's
 * pages join the group the folder sits in, each labelled with the folder's name.
 */
export function pageGroups(): PageGroup[] {
  const tree = source.getPageTree();
  const groups: { title: string; pages: GroupedPage[] }[] = [];
  let current: GroupedPage[] | undefined;

  type Node = (typeof tree.children)[number];
  const name = (node: Node) => (typeof node.name === "string" ? node.name : undefined);
  const add = (url: string, folder: string | undefined) => {
    const page = source.getPageByUrl(url);
    if (page === undefined) return;
    if (current === undefined) {
      current = [];
      groups.push({ title: "Docs", pages: current });
    }
    current.push({ page, label: groupedLabel(page.data.title, folder) });
  };
  const collect = (nodes: readonly Node[], folder: string | undefined) => {
    for (const node of nodes) {
      if (node.type === "page") {
        add(node.url, folder);
      } else if (node.type === "folder") {
        const inner = name(node) ?? folder;
        if (node.index !== undefined) add(node.index.url, inner);
        collect(node.children, inner);
      } else if (folder === undefined) {
        current = [];
        groups.push({ title: name(node) ?? "More", pages: current });
      }
    }
  };
  collect(tree.children, undefined);

  return groups;
}

/** Every page once, in the sidebar's order. */
export function orderedPages(): DocsPage[] {
  return pageGroups().flatMap((group) => group.pages.map(({ page }) => page));
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
  const skippable: GroupedPage[] = [];

  for (const group of pageGroups()) {
    const pages = group.pages.filter((entry) => {
      if (!optional.has(entry.page.url)) return true;
      skippable.push(entry);
      return false;
    });
    sections.push({ title: group.title, links: pages.map((entry) => indexLink(entry, link)) });
  }
  sections.push({ title: "Optional", links: skippable.map((entry) => indexLink(entry, link)) });

  return formatIndex({ title: "Moltenship Time", summary, notes, sections });
}

function indexLink({ label, page }: GroupedPage, link: DocLink) {
  return {
    title: label,
    href: link(page.url, ""),
    description: page.data.description,
  };
}

/** Every page's Markdown in one document, in the sidebar's order. */
export async function llmsFull(link: DocLink = siteLink): Promise<string> {
  const pages = await Promise.all(orderedPages().map((page) => pageMarkdown(page, link)));
  return pages.join("\n");
}
