import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { type DocsFile, contentRoot, docsFiles } from "./docs-files";

// What a reader of Solid's docs sees, checked on the pages' source: Solid's own pages, and the
// shared pages without their `<React>` blocks. The samples must be Solid code that a compiler has
// checked, and the pages may lean on React's docs only where this file lists it.

const samplesRoot = path.join(contentRoot, "../examples/solid");

const blockTag = /<\/?(React|Solid)>/gu;

/** The page as one framework's reader gets it: the other framework's blocks are cut out. */
function viewOf(file: DocsFile, framework: "react" | "solid"): string {
  const other = framework === "react" ? "Solid" : "React";
  return file.source.replace(new RegExp(`<${other}>[\\s\\S]*?</${other}>`, "gu"), "");
}

const solidPages = docsFiles().filter((file) => file.framework !== "react");
const solidOnly = solidPages.filter((file) => file.framework === "solid");

interface Sample {
  readonly file: string;
  /** Where the code is: an included file and its region, or a fence's language. */
  readonly from: string;
  readonly code: string;
}

const include = /<include[^>]*>([^<#]+)(?:#([\w-]+))?<\/include>/gu;
const fence = /^```([\w-]+)[^\n]*\n([\s\S]*?)^```$/gmu;

function region(source: string, name: string | undefined): string | undefined {
  if (name === undefined) return source;
  const start = source.indexOf(`#region ${name}\n`);
  const end = source.indexOf(`#endregion ${name}`);
  return start === -1 || end === -1 ? undefined : source.slice(start, end);
}

/** Every code sample on Solid's side of a page: the files it includes, and its fenced blocks. */
function samplesOf(file: DocsFile): Sample[] {
  const view = viewOf(file, "solid");
  const included = [...view.matchAll(include)].map(([, target = "", name]): Sample => {
    const absolute = path.resolve(contentRoot, path.dirname(file.file), target.trim());
    const from = `${path.relative(path.join(contentRoot, ".."), absolute)}${name ? `#${name}` : ""}`;
    const code = existsSync(absolute) ? region(readFileSync(absolute, "utf8"), name) : undefined;
    if (code === undefined) throw new Error(`${file.file} includes ${from}, which doesn't exist.`);
    return { file: file.file, from, code };
  });
  const fenced = [...view.matchAll(fence)].map(([, language = "", code = ""]): Sample => ({
    file: file.file,
    from: language,
    code,
  }));
  return [...included, ...fenced];
}

const script: ReadonlySet<string> = new Set(["ts", "tsx", "js", "jsx", "typescript", "javascript"]);
const isFenced = (sample: Sample) => !sample.from.includes("/");

/** What a shared page says to Solid's reader alone: the text of its `<Solid>` blocks. */
function solidBlocksOf(file: DocsFile): string {
  return [...file.source.matchAll(/<Solid>([\s\S]*?)<\/Solid>/gu)]
    .map(([, text]) => text)
    .join("\n");
}

describe("code samples in Solid's docs", () => {
  test("a Solid page has no TypeScript written in the page: its samples are included files", () => {
    // A fenced block is text that no compiler reads, so an API that changes would leave it wrong.
    const inline = solidOnly
      .flatMap(samplesOf)
      .filter((sample) => isFenced(sample) && script.has(sample.from))
      .map((sample) => `${sample.file}: a \`${sample.from}\` block`);
    expect(inline).toEqual([]);
  });

  test("nor has a `<Solid>` block of a shared page", () => {
    // A shared page may write TypeScript that both frameworks read, as React's pages do. What it
    // shows Solid's reader alone is Solid code, so it's an included file too.
    const inline = solidPages
      .filter((file) => file.framework === undefined)
      .flatMap((file) =>
        [...solidBlocksOf(file).matchAll(fence)]
          .filter(([, language = ""]) => script.has(language))
          .map(([, language]) => `${file.file}: a \`${language}\` block in <Solid>`),
      );
    expect(inline).toEqual([]);
  });

  test("a Solid page's samples come from the folder that is compiled against the package", () => {
    const elsewhere = solidOnly
      .flatMap(samplesOf)
      .filter((sample) => !isFenced(sample) && !sample.from.startsWith("examples/solid/"))
      .map((sample) => `${sample.file}: ${sample.from}`);
    expect(elsewhere).toEqual([]);
    expect(solidOnly.flatMap(samplesOf).some((sample) => !isFenced(sample))).toBe(true);
  });

  test("code that imports Solid or the Solid package is never written in a page", () => {
    const solidImport =
      /from "(?:solid-js|@solidjs\/[^"]+|@ui-sdk\/solid|@moltenship\/calendar-solid)"/u;
    const inline = solidPages
      .flatMap(samplesOf)
      .filter((sample) => isFenced(sample) && solidImport.test(sample.code))
      .map((sample) => `${sample.file}: a \`${sample.from}\` block`);
    expect(inline).toEqual([]);
  });

  test("no sample a Solid reader sees imports React or a React-only package", () => {
    // `@/components/calendar/…` is where `shadcn add` puts the Solid registry's files, which the
    // samples' tsconfig.json maps to registry/solid; any other `@/` path is the docs site's.
    const reactImport =
      /from "(?:react|react-dom(?:\/[^"]+)?|next(?:\/[^"]+)?|@moltenship\/calendar|@moltenship\/calendar-(?:react|primitives|dnd|dnd-kit|testing)|@ui-sdk\/react|@registry\/[^"]+|@\/(?!components\/calendar\/)[^"]+)"/u;
    const react = solidPages
      .flatMap(samplesOf)
      .filter((sample) => reactImport.test(sample.code))
      .map((sample) => `${sample.file}: ${sample.from}`);
    expect(react).toEqual([]);
  });

  test("every sample file is shown on a page, so none goes stale unseen", () => {
    const shown = new Set(
      solidPages
        .flatMap(samplesOf)
        .filter((sample) => !isFenced(sample))
        .map((sample) => sample.from.replace(/#.*$/u, "")),
    );
    const files = readdirSync(samplesRoot)
      .filter((file) => /\.tsx?$/u.test(file))
      .map((file) => `examples/solid/${file}`);
    expect(files.length).toBeGreaterThan(0);
    expect(files.filter((file) => !shown.has(file))).toEqual([]);
  });

  test("the samples have their own compiler settings, with Solid's JSX", () => {
    const settings: unknown = JSON.parse(
      readFileSync(path.join(samplesRoot, "tsconfig.json"), "utf8"),
    );
    expect(settings).toMatchObject({
      compilerOptions: { jsx: "preserve", jsxImportSource: "@solidjs/web" },
    });
    // The docs app compiles React's JSX, so it must leave these files to their own settings.
    const app: unknown = JSON.parse(
      readFileSync(path.join(contentRoot, "../../tsconfig.json"), "utf8"),
    );
    expect(app).toMatchObject({ exclude: expect.arrayContaining(["content/examples/solid"]) });
  });
});

describe("the blocks one framework's reader sees", () => {
  test.each(docsFiles().map((file) => [file.file, file] as const))(
    "%s opens and closes each block, and nests none",
    (_name, file) => {
      let open: string | undefined;
      for (const [tag, name] of file.source.matchAll(blockTag)) {
        if (tag.startsWith("</")) {
          expect(open, `${tag} closes nothing`).toBe(name);
          open = undefined;
        } else {
          expect(open, `${tag} opens inside <${open}>`).toBeUndefined();
          open = name;
        }
      }
      expect(open, `<${open}> is never closed`).toBeUndefined();
    },
  );

  test("a block's tag in the first column stands alone on its line", () => {
    // The formatter reads a tag in the first column, with text after it, as a block of its own
    // and puts a blank line before it. That ends the paragraph in the middle of a sentence. So a
    // block inside a sentence starts after the sentence's words, on their line, and a block that
    // is a whole paragraph has its tags on lines of their own.
    const lines = docsFiles().flatMap((file) =>
      file.source
        .split("\n")
        .map((line, index) => ({ line, where: `${file.file}:${index + 1}` }))
        .filter(({ line }) => /^<(?:React|Solid)>\s*\S/u.test(line))
        .map(({ where }) => where),
    );
    expect(lines).toEqual([]);
  });

  test("a page one framework has uses no blocks: all of it is that framework's", () => {
    const withBlocks = docsFiles()
      .filter((file) => file.framework !== undefined && blockTag.test(file.source))
      .map((file) => file.file);
    expect(withBlocks).toEqual([]);
  });
});

describe("where Solid's docs lean on React's", () => {
  /**
   * Links from Solid's docs into React's, by page. Each is a subject Solid has and its docs don't
   * cover yet. Writing the Solid page removes the links, and its line here.
   */
  const linksToReact: Readonly<Record<string, number>> = {
    "api/components.solid.mdx": 12,
    "api/index.mdx": 4,
  };

  test("only the listed pages link to React's docs", () => {
    const found: Record<string, number> = {};
    for (const file of solidPages) {
      // Markdown links, and the `href` of a card or another component.
      const count = [...viewOf(file, "solid").matchAll(/(?:\]\(|href=")\/docs\/react(?=[/#)"])/gu)]
        .length;
      if (count > 0) found[file.file] = count;
    }
    expect(found).toEqual(linksToReact);
  });

  test("one page says what Solid lacks, and links the issue that tracks it", () => {
    const frameworks = docsFiles().find((file) => file.file === "frameworks.mdx");
    expect(frameworks).toBeDefined();
    expect(viewOf(frameworks as DocsFile, "solid")).toContain(
      "https://github.com/Moltenship/time/issues/279",
    );
  });

  test("Solid's own pages don't send the reader to a page Solid's docs lack", () => {
    // A link without a framework leads into Solid's docs, so its page must be one of them. The
    // link check proves it on the built pages; this names the mistake before a build.
    const solid = new Set(solidPages.map((file) => file.path));
    const missing = solidPages.flatMap((file) =>
      [...viewOf(file, "solid").matchAll(/\]\(\/docs(?:\/([^)#\s]*))?(?:#[^)\s]*)?\)/gu)]
        .map(([, page = ""]) => page.replace(/\/$/u, ""))
        .filter((page) => !/^(?:react|solid)(?:[/.]|$)/u.test(page) && !solid.has(page))
        .map((page) => `${file.file}: /docs/${page}`),
    );
    expect(missing).toEqual([]);
  });
});
