import { createStringifier } from "fumadocs-core/mdx-plugins/stringifier";
import { describe, expect, test } from "vite-plus/test";

import { installTag, tagged, withInstallTag } from "@/lib/install-tag";
import { remarkFramework } from "@/lib/remark-framework";

import { docsFiles } from "./docs-files";

// The npm tag the docs' install commands name has one home, `lib/install-tag.ts`. The pages write
// their commands without it, and the step that compiles a page adds it.

describe("the tag on a command", () => {
  test("goes on each Time package of an install command, and on nothing else", () => {
    expect(
      withInstallTag(
        "pnpm add @moltenship/calendar-solid @moltenship/calendar-core solid-js @ui-sdk/core",
        "next",
      ),
    ).toBe(
      "pnpm add @moltenship/calendar-solid@next @moltenship/calendar-core@next solid-js @ui-sdk/core",
    );
    expect(withInstallTag("npm install -D @moltenship/calendar-testing vitest", "next")).toBe(
      "npm install -D @moltenship/calendar-testing@next vitest",
    );
    expect(withInstallTag("yarn add @moltenship/ics", "next")).toBe(
      "yarn add @moltenship/ics@next",
    );
    expect(withInstallTag("bun add @moltenship/calendar", "next")).toBe(
      "bun add @moltenship/calendar@next",
    );
  });

  test("leaves a package that names a version, and lines that install nothing", () => {
    expect(withInstallTag("pnpm add @moltenship/calendar@2.0.0", "next")).toBe(
      "pnpm add @moltenship/calendar@2.0.0",
    );
    const sample =
      'import { Calendar } from "@moltenship/calendar";\npnpm why @moltenship/calendar';
    expect(withInstallTag(sample, "next")).toBe(sample);
  });

  test("is absent once there is no tag", () => {
    expect(withInstallTag("pnpm add @moltenship/calendar react", undefined)).toBe(
      "pnpm add @moltenship/calendar react",
    );
    expect(tagged("@moltenship/calendar", undefined)).toBe("@moltenship/calendar");
    expect(tagged("@moltenship/calendar", "next")).toBe("@moltenship/calendar@next");
  });
});

interface TreeNode {
  type: string;
  name?: string;
  lang?: string;
  value?: string;
  attributes?: [];
  children?: TreeNode[];
  position?: { start: { offset: number }; end: { offset: number } };
}

const fence = "```bash\npnpm add @moltenship/calendar react\n```";
const note = "<PreRelease>\n\nThe command installs `@next`.\n\n</PreRelease>";
const aside = "<PreRelease> with `@next`</PreRelease>";
const source = `${fence}\n\n${note}\n\nInstall it${aside} first.\n`;

/** `node` at the place `piece` has in the page's source, as the Markdown parser records it. */
function at(piece: string, node: TreeNode, from = 0): TreeNode {
  const start = source.indexOf(piece, from);
  return { ...node, position: { start: { offset: start }, end: { offset: start + piece.length } } };
}

function page(): TreeNode {
  const sentence = "The command installs `@next`.";
  const last = `Install it${aside} first.`;
  return at(source, {
    type: "root",
    children: [
      at(fence, { type: "code", lang: "bash", value: "pnpm add @moltenship/calendar react" }),
      at(note, {
        type: "mdxJsxFlowElement",
        name: "PreRelease",
        attributes: [],
        children: [
          at(sentence, {
            type: "paragraph",
            children: [
              at("The command installs ", { type: "text", value: "The command installs " }),
              at("`@next`", { type: "inlineCode", value: "@next" }),
            ],
          }),
        ],
      }),
      at(last, {
        type: "paragraph",
        children: [
          at("Install it", { type: "text", value: "Install it" }),
          at(aside, {
            type: "mdxJsxTextElement",
            name: "PreRelease",
            attributes: [],
            children: [
              at(" with ", { type: "text", value: " with " }, source.indexOf(aside)),
              at("`@next`", { type: "inlineCode", value: "@next" }, source.indexOf(aside)),
            ],
          }),
          at(" first.", { type: "text", value: " first." }),
        ],
      }),
    ],
  });
}

function compile(tag: string | undefined) {
  const tree = page();
  const file = { data: {} as Record<string, unknown>, toString: () => source };
  remarkFramework("solid", { installTag: tag })()(tree, file);
  type File = Parameters<typeof createStringifier>[0];
  type Root = Parameters<ReturnType<typeof createStringifier>["stringify"]>[0];
  const text = createStringifier(file as unknown as File)
    .stringify(tree as unknown as Root)
    .replace(/\n{3,}/gu, "\n\n");
  return { tree, text, data: file.data };
}

describe("a page compiled with a tag", () => {
  test("names it in its commands and keeps what is said about it", () => {
    const { tree, text, data } = compile("next");

    expect(tree.children?.[0]?.value).toBe("pnpm add @moltenship/calendar@next react");
    expect(tree.children?.map((node) => node.type)).toEqual(["code", "paragraph", "paragraph"]);
    expect(text).toBe(
      "```bash\npnpm add @moltenship/calendar@next react\n```\n\n" +
        "The command installs `@next`.\n\nInstall it with `@next` first.\n",
    );
    // A page with nothing but this is still the same page in both frameworks' docs.
    expect(data.frameworkSpecific).toBe(false);
  });
});

describe("a page compiled without one", () => {
  test("installs the plain package and says nothing of a tag", () => {
    const { tree, text } = compile(undefined);

    expect(tree.children?.[0]?.value).toBe("pnpm add @moltenship/calendar react");
    expect(tree.children?.map((node) => node.type)).toEqual(["code", "paragraph"]);
    expect(text).toBe("```bash\npnpm add @moltenship/calendar react\n```\n\nInstall it first.\n");
  });
});

describe("the pages", () => {
  const pages = docsFiles().map((page) => ({ file: page.file, text: page.source }));

  test("write no tag on a Time package, so the one in lib/install-tag.ts is the only one", () => {
    const literal = /@moltenship\/[a-z-]+@[a-z]/u;
    const outside = (text: string) => text.replace(/<PreRelease>[\s\S]*?<\/PreRelease>/gu, "");
    expect(
      pages.filter((page) => literal.test(outside(page.text))).map((page) => page.file),
    ).toEqual([]);
  });

  test("install a Time package only in a form that gets the tag", () => {
    // The step that adds the tag reads a command as one line that starts with `pnpm add`,
    // `npm install`, `yarn add` or `bun add`. Another form would install `latest`, with no error.
    const installs = /^\s*(?:npm|pnpm|yarn|bun)\s+(?:i|install|add|update|up|upgrade)\b/u;
    const missed = pages.flatMap((page) => {
      let fenced = false;
      let continued = false;
      return page.text.split("\n").flatMap((line, index) => {
        if (/^\s*```/u.test(line)) {
          fenced = !fenced;
          continued = false;
          return [];
        }
        const names = fenced && line.includes("@moltenship/");
        const untagged =
          names && (continued || (installs.test(line) && withInstallTag(line, "tag") === line));
        continued = fenced && line.trimEnd().endsWith("\\");
        return untagged ? [`${page.file}:${index + 1}`] : [];
      });
    });
    expect(missed).toEqual([]);
  });

  test("name the current tag where a pre-release note names one", () => {
    const notes = pages.flatMap((page) =>
      [...page.text.matchAll(/<PreRelease>([\s\S]*?)<\/PreRelease>/gu)].map((match) => ({
        file: page.file,
        tags: [...(match[1] ?? "").matchAll(/@([a-z]+)`/gu)].map((tag) => tag[1]),
      })),
    );

    expect(notes.length).toBeGreaterThan(0);
    expect(
      notes.filter((note) => note.tags.some((tag) => tag !== installTag)).map((note) => note.file),
    ).toEqual([]);
  });

  test("close every pre-release block they open", () => {
    const unbalanced = pages.filter(
      (page) =>
        (page.text.match(/<PreRelease>/gu) ?? []).length !==
        (page.text.match(/<\/PreRelease>/gu) ?? []).length,
    );
    expect(unbalanced.map((page) => page.file)).toEqual([]);
  });
});
