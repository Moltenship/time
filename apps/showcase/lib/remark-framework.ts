import { replaceSource } from "fumadocs-core/mdx-plugins/stringifier";

import { type Framework, frameworkHref } from "./frameworks";
import { installTag, installTagSource, withInstallTag } from "./install-tag";

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
 * - Install commands name no npm tag in the source (`pnpm add @moltenship/calendar`). The plugin
 *   adds the one in `lib/install-tag.ts` to each Time package, and keeps
 *   `<PreRelease>…</PreRelease>`, which holds what is only true while there is a tag, such as the
 *   sentence that explains it. With no tag it drops those blocks, as it drops the other
 *   framework's.
 *
 * Fumadocs writes the search index and the Markdown for agents from the page's source text, not
 * from the tree, so the plugin edits that text as well: a dropped block's text is removed, a kept
 * block's text loses its tags, and a command's text gains its tag. The Markdown's links get their
 * framework where the Markdown is written (`pageMarkdown` in `lib/llms.ts`).
 *
 * It reports two things on the file, which `source.config.ts` exports from the page:
 * `frameworkSpecific`, whether the page had any such block, and `docLinks`, every link on the
 * page after the rewrite, which the link check reads.
 */
export function remarkFramework(framework: Framework, options: Options = { installTag }) {
  return () =>
    (tree: Node, file: SourceFile): void => {
      // The page reads differently for another version of the package, so the build must compile
      // it again when the manifest changes (`installTagSource`).
      (file.data._compiler as Compiler | undefined)?.addDependency(installTagSource());
      const state: State = {
        framework,
        tag: options.installTag,
        file,
        links: [],
        specific: false,
      };
      transform(tree, state);
      file.data.frameworkSpecific = state.specific;
      file.data.docLinks = state.links;
    };
}

interface Options {
  /** The npm tag install commands name. The site passes none and takes `lib/install-tag.ts`'s. */
  readonly installTag: string | undefined;
}

/** The file being compiled, which Fumadocs' source edits are kept by. */
interface SourceFile {
  data: Record<string, unknown>;
}

/** The loader compiling the file, which Fumadocs puts on its data as `_compiler`. */
interface Compiler {
  addDependency(file: string): void;
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
  /** The npm tag install commands name, if any. */
  readonly tag: string | undefined;
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

/** Whether this page keeps a block's content, or `undefined` for a node that is no such block. */
function blockKept(node: Node, state: State): boolean | undefined {
  if (!jsxElements.has(node.type)) return undefined;
  if (node.name === "PreRelease") return state.tag !== undefined;
  const only = node.name === "React" ? "react" : node.name === "Solid" ? "solid" : undefined;
  if (only === undefined) return undefined;
  state.specific = true;
  return only === state.framework;
}

function transform(parent: Node, state: State): void {
  if (parent.children === undefined) return;
  const children: Node[] = [];

  for (const node of parent.children) {
    const kept = blockKept(node, state);
    if (kept === undefined) {
      rewriteLinks(node, state);
      tagInstallCommands(node, state);
      transform(node, state);
      children.push(node);
      continue;
    }

    if (!kept) {
      editSource(state, node, "");
      continue;
    }

    transform(node, state);
    editSource(state, node, (source) => source.inner(node as SourceEdit[1]));
    const content = node.children ?? [];
    // `<Solid>one line</Solid>` alone on a line parses as a block that holds bare text.
    if (node.type === "mdxJsxFlowElement" && content.length > 0 && content.every(isPhrasing)) {
      children.push({ type: "paragraph", children: content });
    } else {
      children.push(...content);
    }
  }

  parent.children = children;
}

/** Replaces a block's text in the page's source, which has the tags the tree no longer has. */
function editSource(state: State, node: Node, text: SourceEdit[2]): void {
  replaceSource(state.file as SourceEdit[0], node as SourceEdit[1], text);
}

/** Adds the npm tag to the install commands of a code block, in the tree and in its text. */
function tagInstallCommands(node: Node, state: State): void {
  if (node.type !== "code" || typeof node.value !== "string") return;
  const tagged = withInstallTag(node.value, state.tag);
  if (tagged === node.value) return;
  node.value = tagged;
  editSource(state, node, (source) =>
    withInstallTag(source.stringify(node as SourceEdit[1]), state.tag),
  );
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
