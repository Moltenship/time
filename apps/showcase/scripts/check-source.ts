import { readFileSync } from "node:fs";

import type { Node } from "fumadocs-core/page-tree";

import sitemap from "@/app/sitemap";
import { movedPages, movedTarget } from "#docs-redirects";
import {
  type Framework,
  docsUrl,
  frameworkOfFile,
  frameworks,
  parseDocsUrl,
} from "@/lib/frameworks";
import { searchRecords } from "@/lib/search-index";
import { siteUrl } from "@/lib/site";
import {
  type DocsPage,
  allPages,
  canonicalUrl,
  frameworkOf,
  neighbours,
  qualifiedTitle,
  sourceFile,
  sourceOf,
  twinOf,
} from "@/lib/source";

// What the two sets of docs promise beyond their links, checked on the compiled pages: each
// page's canonical address, the sitemap, each set's sidebar, the links at the foot of a page and
// the search records. The production check (`verify-production.mjs`) proves the same on the built
// site, for releases. This runs with the link check, after every change.

const blockTag = /<\/?(?:React|Solid)>/u;

/** Whether the page's file is one framework's, or holds a block that one framework reads. */
function differsByFramework(page: DocsPage): boolean {
  if (frameworkOfFile(sourceFile(page)) !== undefined) return true;
  return page.absolutePath !== undefined && blockTag.test(readFileSync(page.absolutePath, "utf8"));
}

function canonicalProblems(pages: readonly DocsPage[]): string[] {
  return pages.flatMap((page) => {
    // A page that reads the same in both sets names React's copy. Any other names itself.
    const twin = twinOf(page, "react");
    const expected = differsByFramework(page) || twin === undefined ? page.url : twin.url;
    const canonical = canonicalUrl(page);
    return canonical === expected
      ? []
      : [`${page.url}: its canonical address is ${canonical}, and should be ${expected}.`];
  });
}

function sitemapProblems(pages: readonly DocsPage[]): string[] {
  const listed = sitemap()
    .map((entry) => entry.url)
    .filter((url) => url.startsWith(`${siteUrl}/docs`))
    .map((url) => url.slice(siteUrl.length));
  const canonical = new Set(pages.map(canonicalUrl));
  const once = new Set(listed);

  return [
    ...listed
      .filter((url, index) => listed.indexOf(url) !== index)
      .map((url) => `The sitemap lists ${url} twice.`),
    ...[...once]
      .filter((url) => !canonical.has(url))
      .map((url) => `The sitemap lists ${url}, which is no page's canonical address.`),
    ...[...canonical].filter((url) => !once.has(url)).map((url) => `The sitemap lacks ${url}.`),
  ];
}

/** A sidebar entry's name, which is text in these docs' sidebars. */
function nameOf(node: Node): string {
  return typeof node.name === "string" ? node.name : "(unnamed)";
}

function sidebarProblems(framework: Framework): string[] {
  const source = sourceOf(framework);
  const own = new Set(source.getPages().map((page) => page.url));
  const problems: string[] = [];
  const listed: string[] = [];

  /** Walks one level of the sidebar, and says whether it holds a page of this set. */
  function walk(nodes: readonly Node[], where: string): boolean {
    let hasPage = false;
    nodes.forEach((node, index) => {
      if (node.type === "separator") {
        const next = nodes[index + 1];
        if (next === undefined || next.type === "separator") {
          problems.push(`${where}: the heading "${nameOf(node)}" has nothing under it.`);
        }
      } else if (node.type === "folder") {
        const name = `${where} › ${nameOf(node)}`;
        const index = node.index === undefined ? [] : [node.index];
        if (walk([...index, ...node.children], name)) hasPage = true;
        else problems.push(`${name}: the section holds no page of ${framework}'s docs.`);
      } else if (node.$ref !== undefined) {
        // The set's own page.
        hasPage = true;
        listed.push(node.url);
        if (!own.has(node.url)) problems.push(`${where}: ${node.url} is no page of these docs.`);
      } else {
        // A pointer to a page that moved: its old address, which redirects to the page.
        const old = parseDocsUrl(node.url);
        const moved = old?.framework === framework && Object.hasOwn(movedPages, old.path);
        const target = moved ? movedTarget(old.path) : undefined;
        const leads =
          target !== undefined &&
          (target.framework ?? framework) === framework &&
          own.has(docsUrl(framework, target.path));
        if (!leads) problems.push(`${where}: the pointer ${node.url} leads to no page here.`);
      }
    });
    return hasPage;
  }

  walk(source.getPageTree().children, `${framework}'s sidebar`);

  for (const url of own) {
    const times = listed.filter((entry) => entry === url).length;
    if (times !== 1) problems.push(`${framework}'s sidebar lists ${url} ${times} times.`);
  }
  return problems;
}

function neighbourProblems(pages: readonly DocsPage[]): string[] {
  const urls = new Set(pages.map((page) => page.url));
  return pages.flatMap((page) => {
    const { previous, next } = neighbours(page);
    return [previous, next].flatMap((item) => {
      if (item === undefined) return [];
      const sameDocs = parseDocsUrl(item.url)?.framework === frameworkOf(page);
      return urls.has(item.url) && sameDocs && item.url !== page.url
        ? []
        : [`${page.url}: the link at its foot leads to ${item.url}, which is no page beside it.`];
    });
  });
}

function searchProblems(pages: readonly DocsPage[]): string[] {
  const records = searchRecords();
  const ids = new Set(records.map((record) => record.id));
  return [
    ...(ids.size === pages.length && records.length === pages.length
      ? []
      : [`Search has ${records.length} records for ${pages.length} pages.`]),
    ...records
      .filter((record) => record.tag !== parseDocsUrl(record.url)?.framework)
      .map((record) => `Search tags ${record.url} as ${String(record.tag)}.`),
  ];
}

function titleProblems(): string[] {
  return frameworks.flatMap((framework) => {
    const titles = sourceOf(framework).getPages().map(qualifiedTitle);
    return [...new Set(titles.filter((title, index) => titles.indexOf(title) !== index))].map(
      (title) => `${framework}'s docs have two pages titled "${title}".`,
    );
  });
}

/** Everything wrong with the two sets of docs as compiled. Empty when nothing is. */
export function sourceProblems(): string[] {
  const pages = allPages();
  return [
    ...canonicalProblems(pages),
    ...sitemapProblems(pages),
    ...frameworks.flatMap(sidebarProblems),
    ...neighbourProblems(pages),
    ...searchProblems(pages),
    ...titleProblems(),
  ];
}
