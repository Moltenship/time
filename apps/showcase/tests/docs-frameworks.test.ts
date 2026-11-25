import { createStringifier } from "fumadocs-core/mdx-plugins/stringifier";
import { describe, expect, test } from "vite-plus/test";

import {
  docsUrl,
  frameworkHref,
  frameworkOfFile,
  isFramework,
  otherFramework,
  parseDocsUrl,
  twinUrl,
  withoutFrameworkSuffix,
} from "@/lib/frameworks";
import { type LinkedPage, brokenLinks } from "@/lib/link-check";
import { remarkFramework } from "@/lib/remark-framework";

// How one folder of pages becomes two sets of docs: the addresses, the files' names, the blocks
// one framework's reader sees, and the link check that reads each set's own links.

describe("addresses", () => {
  test("a page's address names its framework", () => {
    expect(docsUrl("react")).toBe("/docs/react");
    expect(docsUrl("solid", "api/components")).toBe("/docs/solid/api/components");
  });

  test("an address reads back as a framework and a page", () => {
    expect(parseDocsUrl("/docs/react")).toEqual({ framework: "react", path: "" });
    expect(parseDocsUrl("/docs/solid/")).toEqual({ framework: "solid", path: "" });
    expect(parseDocsUrl("/docs/solid/api/components")).toEqual({
      framework: "solid",
      path: "api/components",
    });
    expect(parseDocsUrl("/docs/react/views/month/?tab=1#drag")).toEqual({
      framework: "react",
      path: "views/month",
    });
  });

  test("an address without a framework is no page", () => {
    expect(parseDocsUrl("/docs")).toBeUndefined();
    expect(parseDocsUrl("/docs/installation")).toBeUndefined();
    expect(parseDocsUrl("/docs/reactive")).toBeUndefined();
    expect(parseDocsUrl("/examples/nextjs")).toBeUndefined();
  });

  test("the frameworks are React and Solid", () => {
    expect(isFramework("react")).toBe(true);
    expect(isFramework("solid")).toBe(true);
    expect(isFramework("vue")).toBe(false);
    expect(isFramework(undefined)).toBe(false);
    expect(otherFramework("react")).toBe("solid");
    expect(otherFramework("solid")).toBe("react");
  });
});

describe("links in a page's source", () => {
  test("a link that names no framework leads to the reader's own docs", () => {
    expect(frameworkHref("/docs", "solid")).toBe("/docs/solid");
    expect(frameworkHref("/docs/installation", "react")).toBe("/docs/react/installation");
    expect(frameworkHref("/docs/installation#temporal", "solid")).toBe(
      "/docs/solid/installation#temporal",
    );
    expect(frameworkHref("/docs#install", "solid")).toBe("/docs/solid#install");
  });

  test("a link that names a framework keeps it", () => {
    expect(frameworkHref("/docs/react/views", "solid")).toBe("/docs/react/views");
    expect(frameworkHref("/docs/solid", "react")).toBe("/docs/solid");
    expect(frameworkHref("/docs/solid#agents", "react")).toBe("/docs/solid#agents");
    expect(frameworkHref("/docs/react.md", "solid")).toBe("/docs/react.md");
  });

  test("a page whose name starts as a framework's does is still a page", () => {
    expect(frameworkHref("/docs/reactive", "solid")).toBe("/docs/solid/reactive");
    expect(frameworkHref("/docs/solid-start", "react")).toBe("/docs/react/solid-start");
  });

  test("a link out of the docs is left alone", () => {
    expect(frameworkHref("/llms.txt", "solid")).toBe("/llms.txt");
    expect(frameworkHref("/docsearch", "solid")).toBe("/docsearch");
    expect(frameworkHref("https://time.molten.sh/docs", "solid")).toBe(
      "https://time.molten.sh/docs",
    );
    expect(frameworkHref("#install", "solid")).toBe("#install");
  });
});

describe("the page to switch to", () => {
  const solid = new Set([
    "/docs/solid",
    "/docs/solid/quick-start",
    "/docs/solid/api",
    "/docs/solid/api/components",
  ]);
  const inSolid = (url: string) => solid.has(url);

  test("the same page, when the other framework has it", () => {
    expect(twinUrl("/docs/react/quick-start", "solid", inSolid)).toBe("/docs/solid/quick-start");
    expect(twinUrl("/docs/react/api/components", "solid", inSolid)).toBe(
      "/docs/solid/api/components",
    );
    expect(twinUrl("/docs/react", "solid", inSolid)).toBe("/docs/solid");
  });

  test("else the nearest section above it that the framework has", () => {
    expect(twinUrl("/docs/react/api/store", "solid", inSolid)).toBe("/docs/solid/api");
    expect(twinUrl("/docs/react/api/store/deep", "solid", inSolid)).toBe("/docs/solid/api");
  });

  test("else the framework's introduction", () => {
    expect(twinUrl("/docs/react/views/month", "solid", inSolid)).toBe("/docs/solid");
    expect(twinUrl("/docs/react/theming", "solid", inSolid)).toBe("/docs/solid");
    expect(twinUrl("/examples/nextjs", "solid", inSolid)).toBe("/docs/solid");
  });

  test("a trailing slash, a query and a hash don't change the page", () => {
    expect(twinUrl("/docs/react/quick-start/", "solid", inSolid)).toBe("/docs/solid/quick-start");
    expect(twinUrl("/docs/react/quick-start?x=1#install", "solid", inSolid)).toBe(
      "/docs/solid/quick-start",
    );
  });
});

describe("a file's name", () => {
  test("names the one framework that has the page", () => {
    expect(frameworkOfFile("quick-start.solid.mdx")).toBe("solid");
    expect(frameworkOfFile("views/index.react.mdx")).toBe("react");
    expect(frameworkOfFile("installation.mdx")).toBeUndefined();
    // A page about a framework is not a page for it.
    expect(frameworkOfFile("solid.mdx")).toBeUndefined();
    expect(frameworkOfFile("guides/react.solid/page.mdx")).toBeUndefined();
  });

  test("gives the page the same address in either set", () => {
    expect(withoutFrameworkSuffix("quick-start.solid.mdx")).toBe("quick-start.mdx");
    expect(withoutFrameworkSuffix("views/index.react.mdx")).toBe("views/index.mdx");
    expect(withoutFrameworkSuffix("installation.mdx")).toBe("installation.mdx");
    expect(withoutFrameworkSuffix("api/meta.json")).toBe("api/meta.json");
  });
});

// The plugin runs on the tree remark-mdx parses, so the tests build that tree by hand.
interface TreeNode {
  type: string;
  name?: string;
  url?: string;
  value?: unknown;
  children?: TreeNode[];
  position?: { start: { offset: number }; end: { offset: number } };
  attributes?: {
    type: string;
    name?: string;
    value?: string | { type: string; value: string; data?: { estree?: unknown } } | null;
  }[];
}

const text = (value: string): TreeNode => ({ type: "text", value });
const paragraph = (...children: TreeNode[]): TreeNode => ({ type: "paragraph", children });
const link = (url: string, label = "a page"): TreeNode => ({
  type: "link",
  url,
  children: [text(label)],
});
const block = (name: string, ...children: TreeNode[]): TreeNode => ({
  type: "mdxJsxFlowElement",
  name,
  attributes: [],
  children,
});
const inline = (name: string, ...children: TreeNode[]): TreeNode => ({
  type: "mdxJsxTextElement",
  name,
  attributes: [],
  children,
});

function compile(framework: "react" | "solid", ...children: TreeNode[]) {
  const tree: TreeNode = { type: "root", children: structuredClone(children) };
  const file = { data: {} as Record<string, unknown> };
  remarkFramework(framework)()(tree, file);
  return { tree, data: file.data };
}

describe("a page compiled for one framework", () => {
  test("keeps its own framework's block without the wrapper, and drops the other's whole", () => {
    const page = [
      paragraph(text("Both read this.")),
      block("React", paragraph(text("React only."))),
      block("Solid", paragraph(text("Solid only.")), paragraph(text("Second paragraph."))),
    ];

    expect(compile("react", ...page).tree.children).toEqual([
      paragraph(text("Both read this.")),
      paragraph(text("React only.")),
    ]);
    expect(compile("solid", ...page).tree.children).toEqual([
      paragraph(text("Both read this.")),
      paragraph(text("Solid only.")),
      paragraph(text("Second paragraph.")),
    ]);
  });

  test("a word inside a sentence can differ", () => {
    const sentence = paragraph(
      text("Install "),
      inline("React", { type: "inlineCode", value: "@moltenship/calendar" }),
      inline("Solid", { type: "inlineCode", value: "@moltenship/calendar-solid" }),
      text("."),
    );

    expect(compile("solid", sentence).tree.children).toEqual([
      paragraph(
        text("Install "),
        { type: "inlineCode", value: "@moltenship/calendar-solid" },
        text("."),
      ),
    ]);
  });

  test("a block that holds one bare line becomes a paragraph", () => {
    const { tree } = compile("solid", block("Solid", text("One line, with "), link("/docs")));
    expect(tree.children).toEqual([paragraph(text("One line, with "), link("/docs/solid"))]);
  });

  test("blocks work inside other elements, such as a step", () => {
    const step = block(
      "Step",
      block("React", paragraph(text("React's step."))),
      block("Solid", paragraph(text("Solid's step."))),
    );
    expect(compile("react", step).tree.children).toEqual([
      block("Step", paragraph(text("React's step."))),
    ]);
  });

  test("says whether the page had a block, which decides its canonical address", () => {
    expect(compile("react", paragraph(text("Shared."))).data.frameworkSpecific).toBe(false);
    // The other framework's block counts: the two pages differ, though this one lost nothing.
    expect(
      compile("react", block("Solid", paragraph(text("Solid only.")))).data.frameworkSpecific,
    ).toBe(true);
  });

  test("points every link at its own framework's page, and reports the links it kept", () => {
    const page = [
      paragraph(link("/docs/installation#install"), link("/docs/react/views"), link("/llms.txt")),
      { type: "definition", url: "/docs/api" },
      block("Solid", paragraph(link("/docs/quick-start"))),
      block("React", paragraph(link("/docs/views/month"))),
    ];
    const { tree, data } = compile("solid", ...page);

    expect(tree.children).toEqual([
      paragraph(
        link("/docs/solid/installation#install"),
        link("/docs/react/views"),
        link("/llms.txt"),
      ),
      { type: "definition", url: "/docs/solid/api" },
      paragraph(link("/docs/solid/quick-start")),
    ]);
    // The dropped block's link is not on this page, so the link check never sees it.
    expect(data.docLinks).toEqual([
      "/docs/solid/installation#install",
      "/docs/react/views",
      "/llms.txt",
      "/docs/solid/api",
      "/docs/solid/quick-start",
    ]);
  });

  test("rewrites a component's href, and links in JSX passed as a prop", () => {
    const card: TreeNode = {
      type: "mdxJsxFlowElement",
      name: "Card",
      attributes: [
        { type: "mdxJsxAttribute", name: "href", value: "/docs/quick-start" },
        { type: "mdxJsxAttribute", name: "title", value: "/docs/quick-start" },
        {
          type: "mdxJsxAttribute",
          name: "description",
          value: {
            type: "mdxJsxAttributeValueExpression",
            value: '<a href="/docs/api#events">events</a>',
            data: {
              estree: {
                type: "Program",
                body: [
                  {
                    type: "JSXAttribute",
                    name: { name: "href" },
                    value: {
                      type: "Literal",
                      value: "/docs/api#events",
                      raw: '"/docs/api#events"',
                    },
                  },
                ],
              },
            },
          },
        },
      ],
      children: [],
    };
    const { tree, data } = compile("solid", card);
    const [href, title, description] = tree.children?.[0]?.attributes ?? [];

    expect(href?.value).toBe("/docs/solid/quick-start");
    // Only `href` is a link; other text that looks like an address is left alone.
    expect(title?.value).toBe("/docs/quick-start");
    expect(description?.value).toMatchObject({
      value: '<a href="/docs/solid/api#events">events</a>',
      data: {
        estree: {
          body: [{ value: { value: "/docs/solid/api#events", raw: '"/docs/solid/api#events"' } }],
        },
      },
    });
    expect(data.docLinks).toEqual(["/docs/solid/quick-start", "/docs/solid/api#events"]);
  });
});

describe("the link check", () => {
  const page = (url: string, links: readonly string[], hashes: readonly string[] = []) =>
    ({ url, file: `${url}.mdx`, links, hashes }) satisfies LinkedPage;
  const site = new Set(["/llms.txt", "/docs/react.md", "/examples/nextjs"]);

  test("passes links to pages, headings, the site's other addresses and other sites", () => {
    const pages = [
      page(
        "/docs/react",
        [
          "/docs/react/views",
          "/docs/react/views/",
          "/docs/react/views#month",
          "/docs/react/views?tab=1#month",
          "#install",
          "/llms.txt",
          "/docs/react.md",
          "/examples/nextjs",
          "https://example.com/docs/nowhere",
          "mailto:someone@example.com",
          "/docs/solid",
        ],
        ["install"],
      ),
      page("/docs/react/views", [], ["month"]),
      page("/docs/solid", []),
    ];
    expect(brokenLinks(pages, site)).toEqual([]);
  });

  test("fails a link to a page the reader's own docs lack", () => {
    const pages = [
      page("/docs/react", ["/docs/react/views"]),
      page("/docs/react/views", []),
      // The same link in the source, compiled for Solid, whose docs have no such page.
      page("/docs/solid", ["/docs/solid/views"]),
    ];
    expect(brokenLinks(pages, site)).toEqual([
      {
        page: "/docs/solid",
        file: "/docs/solid.mdx",
        link: "/docs/solid/views",
        reason: "no such page in these docs",
      },
    ]);
  });

  test("fails a link that kept no framework, a missing heading and a relative link", () => {
    const pages = [
      page("/docs/react", [
        "/docs/installation",
        "/docs/react/views#year",
        "#missing",
        "./views",
        "/pricing",
      ]),
      page("/docs/react/views", [], ["month"]),
    ];
    expect(brokenLinks(pages, site).map(({ link: url, reason }) => [url, reason])).toEqual([
      ["/docs/installation", "no such page in these docs"],
      ["/docs/react/views#year", "no heading with that id on /docs/react/views"],
      ["#missing", "no heading with that id on this page"],
      ["./views", "a relative link: write the page's address from /docs"],
      ["/pricing", "no such address on the site"],
    ]);
  });
});

describe("the page's source text", () => {
  // Fumadocs writes the search index and the Markdown for agents from the source text, by each
  // node's position in it, so a block must leave that text as it leaves the tree.
  const source = [
    "Both read this.",
    "<React>\n\nReact only.\n\n</React>",
    "<Solid>\n\nSolid only.\n\n</Solid>",
    "Install <React>`calendar`</React><Solid>`calendar-solid`</Solid> first.",
    "",
  ].join("\n\n");

  /** A node at the place in the source where `text` is. */
  const at = (text: string, node: TreeNode): TreeNode => {
    const start = source.indexOf(text);
    if (start === -1) throw new Error(`The source has no "${text}".`);
    return {
      ...node,
      position: { start: { offset: start }, end: { offset: start + text.length } },
    };
  };

  const page = (): TreeNode =>
    at(source, {
      type: "root",
      children: [
        at("Both read this.", paragraph(text("Both read this."))),
        at(
          "<React>\n\nReact only.\n\n</React>",
          block("React", at("React only.", paragraph(text("React only.")))),
        ),
        at(
          "<Solid>\n\nSolid only.\n\n</Solid>",
          block("Solid", at("Solid only.", paragraph(text("Solid only.")))),
        ),
        at(
          "Install <React>`calendar`</React><Solid>`calendar-solid`</Solid> first.",
          paragraph(
            at("Install ", text("Install ")),
            at(
              "<React>`calendar`</React>",
              inline("React", at("`calendar`", { type: "inlineCode", value: "calendar" })),
            ),
            at(
              "<Solid>`calendar-solid`</Solid>",
              inline(
                "Solid",
                at("`calendar-solid`", { type: "inlineCode", value: "calendar-solid" }),
              ),
            ),
            at(" first.", text(" first.")),
          ),
        ),
      ],
    });

  function textFor(framework: "react" | "solid"): string {
    const tree = page();
    const file = { data: {} as Record<string, unknown>, toString: () => source };
    remarkFramework(framework)()(tree, file);
    type File = Parameters<typeof createStringifier>[0];
    type Root = Parameters<ReturnType<typeof createStringifier>["stringify"]>[0];
    return createStringifier(file as unknown as File)
      .stringify(tree as unknown as Root)
      .replace(/\n{3,}/gu, "\n\n");
  }

  test("keeps one framework's text, without the tags of its blocks", () => {
    expect(textFor("react")).toBe(
      "Both read this.\n\nReact only.\n\nInstall `calendar` first.\n\n",
    );
    expect(textFor("solid")).toBe(
      "Both read this.\n\nSolid only.\n\nInstall `calendar-solid` first.\n\n",
    );
  });
});
