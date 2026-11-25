import { renderToMarkdown } from "fumadocs-core/server";
import type { ElementType } from "react";
import { describe, expect, test } from "vite-plus/test";

import { llmsComponents } from "@/lib/llms-components";
import {
  fileLink,
  formatIndex,
  formatPage,
  groupedLabel,
  markdownPath,
  rewriteLinks,
  siteLink,
} from "@/lib/llms-format";

// The docs as Markdown (`/llms.txt`, the `.md` pages, the docs packaged with the facade): the
// links, the index and the Markdown form of the MDX components.

describe("links", () => {
  test("a page's file follows its URL, and the docs' root is index.md", () => {
    expect(markdownPath("/docs")).toBe("index.md");
    expect(markdownPath("/docs/agents")).toBe("agents.md");
    expect(markdownPath("/docs/agents/connect")).toBe("agents/connect.md");
  });

  test("the site links to each page's Markdown by an absolute URL", () => {
    expect(siteLink("/docs", "")).toBe("https://time.molten.sh/docs.md");
    expect(siteLink("/docs/agents/connect", "#create-the-bridge")).toBe(
      "https://time.molten.sh/docs/agents/connect.md#create-the-bridge",
    );
  });

  test("packaged docs link to the file beside them by a relative path", () => {
    expect(fileLink("/docs")("/docs/agents/connect", "")).toBe("./agents/connect.md");
    expect(fileLink("/docs/agents/connect")("/docs/agents/changes", "#undo")).toBe(
      "./changes.md#undo",
    );
    expect(fileLink("/docs/agents/connect")("/docs/installation", "")).toBe("../installation.md");
    expect(fileLink("/docs/agents/connect")("/docs", "")).toBe("../index.md");
    expect(fileLink("/docs/views/month")("/docs/api/react", "#root")).toBe("../api/react.md#root");
  });

  test("links in prose are rewritten, and paths in code samples are left alone", () => {
    const markdown = [
      "See [Connect](/docs/agents/connect#name-the-calendar) and the [index](/llms.txt).",
      "```ts",
      'const href = "[x](/docs/agents/connect)";',
      "```",
      "Then [Installation](/docs/installation).",
    ].join("\n");

    expect(rewriteLinks(markdown, fileLink("/docs/agents/changes"))).toBe(
      [
        "See [Connect](./connect.md#name-the-calendar) and the [index](https://time.molten.sh/llms.txt).",
        "```ts",
        'const href = "[x](/docs/agents/connect)";',
        "```",
        "Then [Installation](../installation.md).",
      ].join("\n"),
    );
  });

  test("a site address that only starts like a docs page becomes absolute", () => {
    expect(rewriteLinks("[`/docs.md`](/docs.md) and [docs](/docs)", fileLink("/docs/agents"))).toBe(
      "[`/docs.md`](https://time.molten.sh/docs.md) and [docs](./index.md)",
    );
  });
});

describe("documents", () => {
  test("a page starts with its title, its description and where it runs live", () => {
    expect(
      formatPage({
        title: "Connect an agent",
        description: "Create the bridge.",
        source: "https://time.molten.sh/docs/agents/connect",
        body: "\nThe bridge lists the calendar.\n\n",
      }),
    ).toBe(
      "# Connect an agent\n\nCreate the bridge.\n\nSource: https://time.molten.sh/docs/agents/connect\n\nThe bridge lists the calendar.\n",
    );
  });

  test("the index follows llmstxt.org: a title, a summary, notes, then a list per section", () => {
    expect(
      formatIndex({
        title: "Moltenship Time",
        summary: "A headless calendar.",
        notes: ["Read this first."],
        sections: [
          {
            title: "Docs",
            links: [
              { title: "Introduction", href: "./index.md", description: "What it\n  is." },
              { title: "Installation", href: "./installation.md" },
            ],
          },
          { title: "Empty", links: [] },
          { title: "Optional", links: [{ title: "Comparison", href: "./comparison.md" }] },
        ],
      }),
    ).toBe(
      [
        "# Moltenship Time",
        "",
        "> A headless calendar.",
        "",
        "Read this first.",
        "",
        "## Docs",
        "",
        "- [Introduction](./index.md): What it is.",
        "- [Installation](./installation.md)",
        "",
        "## Optional",
        "",
        "- [Comparison](./comparison.md)",
        "",
      ].join("\n"),
    );
  });
});

describe("the index's page names", () => {
  test("a page in a folder carries the folder's name", () => {
    expect(groupedLabel("Quick start", undefined)).toBe("Quick start");
    expect(groupedLabel("Month", "Views")).toBe("Views: Month");
    expect(groupedLabel("Overview", "API reference")).toBe("API reference: Overview");
  });

  test("a folder whose name holds the page's title stands alone", () => {
    expect(groupedLabel("Agents", "Agents in your app")).toBe("Agents in your app");
    expect(groupedLabel("Concepts", "Concepts")).toBe("Concepts");
  });
});

describe("MDX components as Markdown", () => {
  const live = "https://time.molten.sh/docs/agents/connect";
  const components = llmsComponents(live) as Record<string, ElementType>;
  const { Callout, Card, Cards, Step, Steps, Tab, Tabs, TypeTable } = components;
  const render = async (node: React.ReactNode) => (await renderToMarkdown(node)).trim();

  test("a callout is a quote with its title", async () => {
    expect(await render(<Callout title="2.0 is a pre-release">The API can change.</Callout>)).toBe(
      "> **2.0 is a pre-release**\n>\n> The API can change.",
    );
    expect(await render(<Callout type="warn">Careful.</Callout>)).toBe(
      "> **Warning**\n>\n> Careful.",
    );
  });

  test("cards are a list of links", async () => {
    expect(
      await render(
        <Cards>
          <Card title="Connect an agent" href="/docs/agents/connect" description="The bridge." />
          <Card title="Deleting" href="/docs/agents/deleting">
            Ask the person.
          </Card>
        </Cards>,
      ),
    ).toBe(
      "- [Connect an agent](/docs/agents/connect): The bridge.\n- [Deleting](/docs/agents/deleting): Ask the person.",
    );
  });

  test("steps are numbered, and every tab shows under its name", async () => {
    const steps = await render(
      <Steps>
        <Step>Install it.</Step>
        <Step>Render it.</Step>
      </Steps>,
    );
    expect(steps).toContain("**Step 1**\n\nInstall it.");
    expect(steps).toContain("**Step 2**\n\nRender it.");

    const tabs = await render(
      <Tabs items={["pnpm", "npm"]}>
        <Tab value="pnpm">pnpm add it</Tab>
        <Tab value="npm">npm install it</Tab>
      </Tabs>,
    );
    expect(tabs).toContain("**pnpm**\n\npnpm add it");
    expect(tabs).toContain("**npm**\n\nnpm install it");
  });

  test("a type table is a Markdown table that says what's required", async () => {
    const table = await render(
      <TypeTable
        type={{
          label: { type: "string", description: "The calendar's name." },
          events: {
            type: "readonly TEvent[] | Source",
            description: "Your events.",
            required: true,
          },
          allowAgentDelete: {
            type: "boolean",
            default: "false",
            description: "Lets agents delete.",
          },
        }}
      />,
    );

    // A pipe in a type would end the cell, so it's escaped.
    expect(table).toBe(
      [
        "| Name               | Type                          | Default | Description            |",
        "| ------------------ | ----------------------------- | ------- | ---------------------- |",
        "| `label`            | `string`                      |         | The calendar's name.   |",
        "| `events`           | `readonly TEvent[] \\| Source` |         | Required. Your events. |",
        "| `allowAgentDelete` | `boolean`                     | `false` | Lets agents delete.    |",
      ].join("\n"),
    );
  });

  test("a live example becomes a line that says where it runs", async () => {
    const { AgentPreview, CalendarPreview, WeekAnatomy } = components;

    expect(await render(<AgentPreview />)).toBe(`> Live example: see it at ${live}`);
    expect(await render(<CalendarPreview view="month" />)).toBe(
      `> Live example of the \`month\` view: see it at ${live}`,
    );
    expect(await render(<WeekAnatomy />)).toBe(`> Diagram: see it at ${live}`);
  });
});
