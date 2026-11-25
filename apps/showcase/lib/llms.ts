import { installTag } from "@/lib/install-tag";
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
import { type Framework, frameworkHref, frameworkNames, frameworks } from "@/lib/frameworks";
import { type DocsPage, frameworkOf, isSharedPage, pathOf, sourceOf } from "@/lib/source";

export type { DocsPage };

const summary =
  "A calendar on the Temporal API whose engine imports no UI framework. React renders it, with " +
  "week, day, month, year, agenda and resource views you copy and own, and drag and keyboard " +
  "editing. SolidJS 2 renders it as a preview, with the week, day, month, year and agenda, and " +
  "the scrolling week, day, month and agenda, and the resource columns, so far. " +
  "It is built on ui-sdk, so an " +
  "AI agent can read a calendar and act on it once the app creates a bridge." +
  // Only while the version these docs are built for is one (`lib/install-tag.ts`).
  (installTag === undefined ? "" : " Version 2.0 is a pre-release.");

/** Pages a reader short of context can skip; llms.txt lists them under "Optional". */
const optional: ReadonlySet<string> = new Set(["comparison", "migrating-to-2", "theme-builder"]);

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
 * One framework's pages in its sidebar's order, grouped as the sidebar's separators group them. A
 * folder's pages join the group the folder sits in, each labelled with the folder's name.
 */
export function pageGroups(framework: Framework): PageGroup[] {
  const source = sourceOf(framework);
  const tree = source.getPageTree();
  const groups: { title: string; pages: GroupedPage[] }[] = [];
  let current: GroupedPage[] | undefined;

  type Node = (typeof tree.children)[number];
  const name = (node: Node) => (typeof node.name === "string" ? node.name : undefined);
  const add = (url: string, folder: string | undefined) => {
    // A pointer to a page in another section has that page's old address, which is no page.
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

/** Every page of one framework's docs once, in the sidebar's order. */
export function orderedPages(framework: Framework): DocsPage[] {
  return pageGroups(framework).flatMap((group) => group.pages.map(({ page }) => page));
}

/**
 * A page as Markdown, with no JSX left in it and its links to other pages made by `link`. The
 * Markdown is written from the page's source, where a link names no framework, so each link gets
 * the page's own here, as the page's links do (`lib/remark-framework.ts`).
 */
export async function pageMarkdown(page: DocsPage, link: DocLink = siteLink): Promise<string> {
  const source = `${siteUrl}${page.url}`;
  const framework = frameworkOf(page);
  const body = await page.data.getText("processed", { components: llmsComponents(source) });

  return formatPage({
    title: page.data.title,
    description: page.data.description,
    source,
    body: rewriteLinks(body, (url, hash) => link(frameworkHref(url, framework), hash)),
  });
}

/**
 * The llms.txt index of the given frameworks' docs. `link` says where each page's Markdown is;
 * `notes` follow the summary. With more than one framework, each section names its own.
 */
export function llmsIndex(
  link: DocLink,
  notes: readonly string[],
  listed: readonly Framework[] = frameworks,
): string {
  const sections: IndexSection[] = [];
  const skippable: IndexSection["links"][number][] = [];

  for (const framework of listed) {
    const prefix = listed.length > 1 ? `${frameworkNames[framework]}: ` : "";
    for (const group of pageGroups(framework)) {
      const pages = group.pages.filter((entry) => {
        if (!optional.has(pathOf(entry.page))) return true;
        skippable.push(indexLink({ ...entry, label: `${prefix}${entry.label}` }, link));
        return false;
      });
      sections.push({
        title: `${prefix}${group.title}`,
        links: pages.map((entry) => indexLink(entry, link)),
      });
    }
  }
  sections.push({ title: "Optional", links: skippable });

  return formatIndex({ title: "Moltenship Time", summary, notes, sections });
}

function indexLink({ label, page }: GroupedPage, link: DocLink) {
  return {
    title: label,
    href: link(page.url, ""),
    description: page.data.description,
  };
}

/**
 * Every page's Markdown in one document: React's docs in the sidebar's order, then the pages of
 * Solid's docs that differ from React's. A page both sets share is there once.
 */
export async function llmsFull(link: DocLink = siteLink): Promise<string> {
  const pages = [
    ...orderedPages("react"),
    ...orderedPages("solid").filter((page) => !isSharedPage(page)),
  ];
  return (await Promise.all(pages.map((page) => pageMarkdown(page, link)))).join("\n");
}
