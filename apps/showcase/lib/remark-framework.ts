import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";

import { type Framework, frameworkHref } from "./frameworks";

/**
 * Compiles a docs page for one framework. Every page is compiled twice, once for React's docs and
 * once for Solid's (`source.config.ts`), and this plugin makes the two differ:
 *
 * - `<React>…</React>` and `<Solid>…</Solid>` hold what only one framework's reader sees: a block
 *   of prose, a code sample, or a word inside a sentence. The plugin keeps the content of the
 *   block that names its framework and drops the other block whole, so nothing downstream sees it:
 *   not the page, its table of contents, the search index or the Markdown for agents.
 * - Links name no framework in the source (`/docs/installation`). The plugin points each at its
 *   own framework's page (`/docs/solid/installation`).
 *
 * Fumadocs writes the search index and the Markdown for agents from the page's source text, not
 * from the tree, so the plugin edits that text as well: a dropped block's text is removed, and a
 * kept block's text loses its tags. The Markdown's links get their framework where the Markdown
 * is written (`pageMarkdown` in `lib/llms.ts`).
 *
 * It reports two things on the file, which `source.config.ts` exports from the page:
 * `frameworkSpecific`, whether the page had any such block, and `docLinks`, every link on the
 * page after the rewrite, which the link check reads.
 */
export function remarkFramework(framework: Framework) {
  return () =>
    (tree: Node, file: SourceFile): void => {
      const state: State = { framework, file, links: [], specific: false };
      transform(tree, state);
      file.data.frameworkSpecific = state.specific;
      file.data.docLinks = state.links;
    };
}

/** The file being compiled, which Fumadocs' source edits are kept by. */
interface SourceFile {
  data: Record<string, unknown>;
}

type SourceEdit = Parameters<typeof replaceSource>;

interface Node {
  type: string;
  name?: string | null;
  url?: string;
  value?: unknown;
  children?: Node[];
  attributes?: Attribute[];
  data?: { estree?: unknown };
}

interface Attribute {
  type: string;
  name?: string;
  value?: string | { type: string; value: string; data?: { estree?: unknown } } | null;
}

interface State {
  readonly framework: Framework;
  readonly file: SourceFile;
  readonly links: string[];
  specific: boolean;
}

const jsxElements: ReadonlySet<string> = new Set(["mdxJsxFlowElement", "mdxJsxTextElement"]);
/** What a paragraph holds. A block that held only these stood alone on its line. */
const phrasing: ReadonlySet<string> = new Set([
  "text",
  "inlineCode",
  "emphasis",
  "strong",
  "delete",
  "link",
  "break",
  "mdxJsxTextElement",
  "mdxTextExpression",
]);

function blockFramework(node: Node): Framework | undefined {
  if (!jsxElements.has(node.type)) return undefined;
  if (node.name === "React") return "react";
  if (node.name === "Solid") return "solid";
  return undefined;
}

function transform(parent: Node, state: State): void {
  if (parent.children === undefined) return;
  const children: Node[] = [];

  for (const node of parent.children) {
    const only = blockFramework(node);
    if (only === undefined) {
      rewriteLinks(node, state);
      transform(node, state);
      children.push(node);
      continue;
    }

    state.specific = true;
    if (only !== state.framework) {
      editSource(state, node, "");
      continue;
    }

    transform(node, state);
    editSource(state, node, (source) => source.inner(node as SourceEdit[1]));
    const kept = node.children ?? [];
    // `<Solid>one line</Solid>` alone on a line parses as a block that holds bare text.
    if (node.type === "mdxJsxFlowElement" && kept.length > 0 && kept.every(isPhrasing)) {
      children.push({ type: "paragraph", children: kept });
    } else {
      children.push(...kept);
    }
  }

  parent.children = children;
}

/** Replaces a block's text in the page's source, which has the tags the tree no longer has. */
function editSource(state: State, node: Node, text: SourceEdit[2]): void {
  replaceSource(state.file as SourceEdit[0], node as SourceEdit[1], text);
}

function isPhrasing(node: Node): boolean {
  return phrasing.has(node.type);
}

function rewriteLinks(node: Node, state: State): void {
  if ((node.type === "link" || node.type === "definition") && typeof node.url === "string") {
    node.url = link(node.url, state);
    return;
  }
  if (!jsxElements.has(node.type)) return;

  for (const attribute of node.attributes ?? []) {
    if (attribute.type !== "mdxJsxAttribute") continue;
    const value = attribute.value;
    if (typeof value === "string") {
      if (attribute.name === "href") attribute.value = link(value, state);
    } else if (value !== null && value !== undefined) {
      // JSX inside a prop, such as a `TypeTable` description with a link in it. MDX compiles the
      // parsed program, and the Markdown for agents reads the source text, so both change.
      value.value = value.value.replace(
        /(\bhref=")(\/docs[^"]*)(")/gu,
        (_match, before: string, href: string, after: string) =>
          `${before}${frameworkHref(href, state.framework)}${after}`,
      );
      rewriteProgramLinks(value.data?.estree, state);
    }
  }
}

function link(href: string, state: State): string {
  const rewritten = frameworkHref(href, state.framework);
  state.links.push(rewritten);
  return rewritten;
}

/** Walks a parsed JavaScript program for `href="…"` on JSX elements. */
function rewriteProgramLinks(program: unknown, state: State): void {
  if (program === null || typeof program !== "object") return;
  if (Array.isArray(program)) {
    for (const item of program) rewriteProgramLinks(item, state);
    return;
  }

  const node = program as {
    type?: string;
    name?: { name?: string };
    value?: { type?: string; value?: unknown; raw?: string };
  };
  if (
    node.type === "JSXAttribute" &&
    node.name?.name === "href" &&
    node.value?.type === "Literal" &&
    typeof node.value.value === "string"
  ) {
    const href = link(node.value.value, state);
    node.value.value = href;
    node.value.raw = JSON.stringify(href);
    return;
  }
  for (const [key, child] of Object.entries(program)) {
    if (key === "loc" || key === "range" || key === "position") continue;
    rewriteProgramLinks(child, state);
  }
}
