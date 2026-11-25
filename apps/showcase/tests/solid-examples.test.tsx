// @vitest-environment jsdom

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vite-plus/test";

import { SolidExample, solidExampleUrl } from "@/components/solid-example";

import { contentRoot, docsFiles } from "./docs-files";

// The live examples of Solid's docs: each `<SolidExample name>` on a page has an entry in
// `content/examples/solid/live`, and the frame around it has a name and a size of its own.
// `docs/internal/solid-examples.md` says how a view adds one.

const liveRoot = path.join(contentRoot, "../examples/solid/live");
const entries = readdirSync(liveRoot)
  .filter((file) => file.endsWith(".example.tsx"))
  .map((file) => file.replace(/\.example\.tsx$/u, ""));

interface Use {
  readonly file: string;
  readonly framework: string | undefined;
  readonly props: Readonly<Record<string, string>>;
}

const uses: Use[] = docsFiles().flatMap((file) =>
  [...file.source.matchAll(/<SolidExample\b([^>]*)\/>/gu)].map(([, attributes = ""]) => ({
    file: file.file,
    framework: file.framework,
    props: Object.fromEntries(
      [...attributes.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, key = "", value = ""]) => [
        key,
        value,
      ]),
    ),
  })),
);

describe("the live examples on Solid's pages", () => {
  test("every example a page shows has an entry", () => {
    expect(uses.length).toBeGreaterThan(0);
    const missing = uses
      .filter((use) => !entries.includes(use.props.name ?? ""))
      .map((use) => `${use.file}: ${use.props.name}`);
    expect(missing).toEqual([]);
  });

  test("every entry is shown on a page, so none is built unseen", () => {
    const shown = new Set(uses.map((use) => use.props.name));
    expect(entries.filter((entry) => !shown.has(entry))).toEqual([]);
  });

  test("they are on Solid's own pages: a React reader never loads one", () => {
    expect(uses.filter((use) => use.framework !== "solid").map((use) => use.file)).toEqual([]);
  });

  test("each frame has a name, which no other frame on its page has", () => {
    for (const use of uses) expect(use.props.title, use.file).toMatch(/\S/u);
    const names = uses.map((use) => `${use.file}: ${use.props.title}`);
    expect(names).toEqual([...new Set(names)]);
  });

  test("an entry is named as its address spells it", () => {
    for (const entry of entries) {
      expect(entry).toMatch(/^[a-z][a-z0-9-]*$/u);
      expect(solidExampleUrl(entry)).toBe(`/examples/solid/index.html?example=${entry}`);
    }
  });

  test("an entry brings its styles: the registry's theme, or the browser's own", () => {
    for (const entry of entries) {
      const source = readFileSync(path.join(liveRoot, `${entry}.example.tsx`), "utf8");
      expect(source, entry).toMatch(/^import "\.\/(?:registry|plain)\.css";$/mu);
      expect(source, entry).toMatch(/export \{[^}]*\bdefault\b[^}]*\} from "\.\.\//u);
    }
  });
});

describe("the frame", () => {
  const html = renderToStaticMarkup(
    <SolidExample name="agenda" title="The agenda view" size="h-80" caption="Live." />,
  );

  test("is an iframe with an accessible name, loaded when the reader reaches it", () => {
    expect(html).toContain('title="The agenda view"');
    expect(html).toContain('src="/examples/solid/index.html?example=agenda"');
    expect(html).toContain('loading="lazy"');
  });

  test("has its height before the example loads, so the page doesn't move", () => {
    expect(html).toMatch(/<div class="[^"]*\bh-80\b[^"]*"><iframe class="[^"]*\bsize-full\b/u);
    expect(renderToStaticMarkup(<SolidExample name="agenda" title="The agenda view" />)).toMatch(
      /<div class="[^"]*h-\[30rem\]/u,
    );
  });

  test("has a caption, in a figure", () => {
    expect(html).toMatch(/^<figure[^>]*>.*<figcaption[^>]*>Live\.<\/figcaption><\/figure>$/su);
  });
});

describe("the page the examples run in", () => {
  const page = readFileSync(path.join(liveRoot, "index.html"), "utf8");

  const script = /<script>([\s\S]*?)<\/script>/u.exec(page)?.[1] ?? "";
  const settled = () => new Promise((resolve) => setTimeout(resolve));

  /** Runs the page's script in a document of its own, under `parent` and the system's theme. */
  function open(parent: object | undefined, systemDark: boolean) {
    const frame = document.implementation.createHTMLDocument("example");
    const changes: (() => void)[] = [];
    const system = {
      addEventListener: (_: string, listener: () => void) => changes.push(listener),
      matches: systemDark,
    };
    const frameWindow: { parent?: object } = {};
    frameWindow.parent = parent ?? frameWindow;
    // oxlint-disable-next-line typescript/no-implied-eval -- the page's own inline script
    new Function("window", "document", "matchMedia", script)(frameWindow, frame, () => system);
    return {
      root: frame.documentElement,
      setSystem(dark: boolean) {
        system.matches = dark;
        for (const change of changes) change();
      },
    };
  }

  test("takes the docs site's theme, and follows it when the reader switches", async () => {
    expect(script).not.toBe("");
    const docs = document.implementation.createHTMLDocument("docs");
    docs.documentElement.classList.add("dark");
    const { root } = open({ document: docs }, false);
    expect(root.classList.contains("dark")).toBe(true);
    expect(root.style.colorScheme).toBe("dark");

    docs.documentElement.classList.remove("dark");
    await settled();
    expect(root.classList.contains("dark")).toBe(false);
    expect(root.style.colorScheme).toBe("light");
  });

  test("follows the system's theme on its own, or under a page it can't read", () => {
    const alone = open(undefined, true);
    expect(alone.root.classList.contains("dark")).toBe(true);
    alone.setSystem(false);
    expect(alone.root.classList.contains("dark")).toBe(false);

    const foreign = {
      get document(): Document {
        throw new DOMException("Blocked a frame from accessing a cross-origin frame.");
      },
    };
    expect(open(foreign, true).root.classList.contains("dark")).toBe(true);
  });

  test("stays out of search engines: the docs page around it is what a reader should find", () => {
    expect(page).toContain('<meta name="robots" content="noindex"');
  });
});
