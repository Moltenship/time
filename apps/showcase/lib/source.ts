import { react, solid } from "@/.source/server";
import { movedTarget } from "#docs-redirects";
import {
  type Framework,
  docsUrl,
  frameworkOfFile,
  frameworks,
  parseDocsUrl,
  withoutFrameworkSuffix,
} from "@/lib/frameworks";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import type { Folder, Item, Node, Root } from "fumadocs-core/page-tree";
import {
  type InferPageType,
  type MetaData,
  type PageData,
  type StaticSource,
  loader,
} from "fumadocs-core/source";

type DocsFiles<Page extends PageData, Meta extends MetaData> = StaticSource<{
  pageData: Page;
  metaData: Meta;
}>;

/**
 * The docs, once for each framework. Both sets are compiled from `content/docs`
 * (`source.config.ts`), and a file's name says which set has it:
 *
 * - `installation.mdx` is in both. `<React>` and `<Solid>` blocks hold what differs.
 * - `quick-start.react.mdx` and `quick-start.solid.mdx` are one page each, at the same address in
 *   their own set: `/docs/react/quick-start` and `/docs/solid/quick-start`.
 * - A page only one framework has is one file with that framework's suffix, and the other set
 *   lacks it.
 *
 * The sidebar comes from the same `meta.json` files for both. An entry whose page a set lacks is
 * left out of that set's sidebar, and so is a section left with nothing in it.
 */
function docsFor<Page extends PageData, Meta extends MetaData>(
  framework: Framework,
  source: DocsFiles<Page, Meta>,
) {
  const paths = new Set<string>();
  for (const file of source.files) {
    if (file.type === "page") paths.add(pagePath(withoutFrameworkSuffix(file.path)));
  }

  const renamed: DocsFiles<Page, Meta> = {
    ...source,
    files: source.files.map((file) => ({ ...file, path: withoutFrameworkSuffix(file.path) })),
  };

  return loader({
    baseUrl: docsUrl(framework),
    source: renamed,
    pageTree: {
      transformers: [
        {
          // A link in `meta.json` points to a page that moved to another section. It names the
          // page's old address, which redirects (`docs-redirects.mjs`), so the page's own entry
          // stays the only one in the sidebar with its address.
          file(node, file) {
            if (file !== undefined) return node;
            const old = /^\/docs\/(.+)$/u.exec(node.url)?.[1];
            if (old === undefined) return node;
            const target = movedTarget(old);
            const here = (target.framework ?? framework) === framework && paths.has(target.path);
            return { ...node, url: here ? docsUrl(framework, old) : missingPointer };
          },
          root(root) {
            return { ...root, children: prune(root.children) };
          },
        },
      ],
    },
  });
}

/** `ics/index.mdx` is the page `ics`; `index.mdx` is the page `""`. */
function pagePath(file: string): string {
  return file.replace(/\.mdx?$/u, "").replace(/(?:^|\/)index$/u, "");
}

/** Marks a pointer to a page this set doesn't have, until `prune` removes it. */
const missingPointer = "#missing";

/** A sidebar entry that is a page of this set, not a pointer to one elsewhere. */
function isOwnPage(node: Node): node is Item {
  return node.type === "page" && node.$ref !== undefined;
}

function hasOwnPage(folder: Folder): boolean {
  return (
    folder.index !== undefined ||
    folder.children.some((node) => isOwnPage(node) || (node.type === "folder" && hasOwnPage(node)))
  );
}

/** Drops pointers to missing pages, folders without a page of their own, and empty sections. */
function prune(nodes: readonly Node[]): Node[] {
  const kept: Node[] = [];
  for (const node of nodes) {
    if (node.type === "page") {
      if (node.url !== missingPointer) kept.push(node);
    } else if (node.type === "folder") {
      const folder = { ...node, children: prune(node.children) };
      if (hasOwnPage(folder)) kept.push(folder);
    } else {
      // A separator that the last one's entries all fell under was a section with nothing in it.
      if (kept.at(-1)?.type === "separator") kept.pop();
      kept.push(node);
    }
  }
  if (kept.at(-1)?.type === "separator") kept.pop();
  return kept;
}

/** A set's own pages in the sidebar's order, a folder's index page before the pages in it. */
function ownPages(nodes: readonly Node[]): Item[] {
  return nodes.flatMap((node) => {
    if (node.type === "folder") {
      const index = node.index !== undefined && isOwnPage(node.index) ? [node.index] : [];
      return [...index, ...ownPages(node.children)];
    }
    return isOwnPage(node) ? [node] : [];
  });
}

export const sources = {
  react: docsFor("react", react.toFumadocsSource()),
  solid: docsFor("solid", solid.toFumadocsSource()),
} as const satisfies Record<Framework, unknown>;

export type DocsSource = (typeof sources)[Framework];
export type DocsPage = InferPageType<DocsSource>;

export function sourceOf(framework: Framework): DocsSource {
  return sources[framework];
}

/** Every page of both sets, React's first. */
export function allPages(): DocsPage[] {
  return frameworks.flatMap((framework) => sources[framework].getPages());
}

export function frameworkOf(page: DocsPage): Framework {
  const framework = parseDocsUrl(page.url)?.framework;
  if (framework === undefined) throw new Error(`${page.url} is not a docs page.`);
  return framework;
}

/** The page's address inside its framework's docs: `""`, `views/month`. */
export function pathOf(page: DocsPage): string {
  return page.slugs.join("/");
}

/**
 * The page's file from the app's folder: `content/docs/quick-start.solid.mdx`. Its name can carry
 * a framework, which the page's `path` and address don't.
 */
export function sourceFile(page: DocsPage): string {
  const file = page.absolutePath;
  if (file === undefined) return `content/docs/${page.path}`;
  return file.slice(file.lastIndexOf("content/docs/"));
}

/** The page at the same address in the other framework's docs, when it has one. */
export function twinOf(page: DocsPage, framework: Framework): DocsPage | undefined {
  return sources[framework].getPage(page.slugs);
}

export interface Neighbours {
  readonly previous?: Item;
  readonly next?: Item;
}

/**
 * The pages before and after one in its sidebar, for the links at the foot of the page. A pointer
 * to a page that moved is neither: that page is a neighbour where it's listed, in its own section.
 */
export function neighbours(page: DocsPage): Neighbours {
  const pages = ownPages(sourceOf(frameworkOf(page)).getPageTree().children);
  const index = pages.findIndex((item) => item.url === page.url);
  const previous = index > 0 ? pages[index - 1] : undefined;
  const next = index === -1 ? undefined : pages[index + 1];
  return { ...(previous && { previous }), ...(next && { next }) };
}

/**
 * Whether the page reads the same in both sets: one source file, with no `<React>` or `<Solid>`
 * block in it. Its links differ, each set's pointing at its own pages, and nothing else does.
 */
export function isSharedPage(page: DocsPage): boolean {
  return frameworkOfFile(sourceFile(page)) === undefined && !isSpecific(page);
}

function isSpecific(page: DocsPage): boolean {
  return page.data._exports.frameworkSpecific === true;
}

/**
 * The address search engines index a page at. A page that reads the same in both sets would be
 * duplicate content, so both copies name React's as the canonical one.
 */
export function canonicalUrl(page: DocsPage): string {
  if (!isSharedPage(page)) return page.url;
  return twinOf(page, "react")?.url ?? page.url;
}

/** Every link on the page to another docs page, as the page's framework has them. */
export function docLinks(page: DocsPage): readonly string[] {
  const links = page.data._exports.docLinks;
  return Array.isArray(links)
    ? links.filter((link): link is string => typeof link === "string")
    : [];
}

/**
 * The names of the sidebar sections a page sits in, outermost first. A section is a folder, or a
 * group under a heading that a package's pages form: the ICS pages are files in `ics/` that the
 * sidebar lists flat under "iCalendar (ICS)".
 */
export function pageSections(page: DocsPage): string[] {
  const tree: Root = sourceOf(frameworkOf(page)).getPageTree();
  const folders = getBreadcrumbItems(page.url, tree).flatMap((item) =>
    typeof item.name === "string" ? [item.name] : [],
  );
  if (folders.length > 0 || !page.path.includes("/")) return folders;

  let heading: string | undefined;
  for (const node of tree.children) {
    if (node.type === "separator") heading = typeof node.name === "string" ? node.name : undefined;
    else if (node.type === "page" && node.url === page.url) return heading ? [heading] : [];
  }
  return [];
}

/**
 * A page's title with its sections, since two pages are both named "Overview". A section named as
 * the page is, which a folder's index page can be, isn't repeated.
 */
export function qualifiedTitle(page: DocsPage): string {
  const title = page.data.title;
  const sections = pageSections(page).filter((section) => section !== title);
  return [title, ...sections.reverse()].join(" · ");
}
