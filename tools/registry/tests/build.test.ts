import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { buildRegistry } from "../src/build";
import { checkBuiltRegistry, fullItemName } from "../src/check";
import {
  describeIncompatibility,
  findIncompatibleItems,
  type RegistryManifest,
  type RegistryManifestItem,
} from "../src/compatibility";
import { defaultRegistryBaseUrl } from "../src/config";
import { consumerImportForTarget, rewriteRegistryImports } from "../src/rewrite-imports";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const baseUrl = "https://registry.example/r";

interface BuiltFile {
  readonly content: string;
  readonly path?: string;
  readonly target: string;
  readonly type?: string;
}

interface BuiltItem {
  readonly name: string;
  readonly dependencies?: string[];
  readonly registryDependencies?: string[];
  readonly files?: BuiltFile[];
  readonly cssVars?: Record<string, Record<string, string>>;
  readonly css?: Record<string, Record<string, unknown>>;
  readonly meta?: { readonly compatibility?: Record<string, string> };
}

let outDir: string;
let manifest: RegistryManifest;

async function readItem(name: string, directory = outDir): Promise<BuiltItem> {
  return JSON.parse(await readFile(join(directory, `${name}.json`), "utf8")) as BuiltItem;
}

async function workspaceVersion(name: string): Promise<string> {
  const directory = name.replace("@moltenship/", "");
  const manifestPath = join(workspaceRoot, "packages", directory, "package.json");
  return (JSON.parse(await readFile(manifestPath, "utf8")) as { version: string }).version;
}

beforeAll(async () => {
  outDir = await mkdtemp(join(tmpdir(), "time-registry-test-"));
  manifest = await buildRegistry({ workspaceRoot, outDir, baseUrl });
});

afterAll(async () => {
  await rm(outDir, { force: true, recursive: true });
});

describe("registry build", () => {
  test("builds every item with shadcn build and passes its checks", async () => {
    expect(await checkBuiltRegistry({ outDir, manifest })).toEqual([]);
    expect((await readdir(outDir)).sort()).toEqual(
      [
        ...manifest.items.map(({ name }) => `${name}.json`),
        "compatibility.json",
        "registry.json",
      ].sort(),
    );
  });

  test("calendar-full owns no files and installs every other item", async () => {
    const full = await readItem(fullItemName);
    const others = manifest.items.filter(({ name }) => name !== fullItemName);

    expect(full.files ?? []).toEqual([]);
    expect([...(full.registryDependencies ?? [])].sort()).toEqual(
      others.map(({ name }) => `${baseUrl}/${name}.json`).sort(),
    );
    const targets = others.flatMap((item) => item.targets);
    expect(new Set(targets).size).toBe(targets.length);
  });

  test("imports point at the consumer's aliases, not the repository's", async () => {
    const monthView = await readItem("month-view");
    const source = monthView.files!.map(({ content }) => content).join("\n");

    expect(source).not.toContain("@registry/");
    expect(source).toContain('from "@/components/calendar/event-chip"');
    expect(source).toContain('from "@/components/ui/popover"');
    expect(source).toContain('from "./month-week"');
    expect(monthView.files!.map(({ target }) => target)).toContain(
      "@components/calendar/month-view/month-view.tsx",
    );
  });

  test("dependencies carry the ranges the workspace builds and tests with", async () => {
    const version = await workspaceVersion("@moltenship/calendar");
    const monthView = await readItem("month-view");

    // Our runtime carries a range; third-party packages stay bare, as in stock shadcn items, so
    // `shadcn add` keeps the version an app already has.
    expect(monthView.dependencies).toEqual([
      `@moltenship/calendar@^${version}`,
      "cn",
      "lucide-react",
    ]);
    expect(monthView.registryDependencies).toEqual([
      "popover",
      `${baseUrl}/calendar.json`,
      `${baseUrl}/calendar-theme.json`,
    ]);
    expect(monthView.meta?.compatibility).toEqual({ "@moltenship/calendar": `^${version}` });
    expect(manifest.runtime).toEqual({ "@moltenship/calendar": version });
  });

  test("the theme merges calendar tokens and rules into the app's stylesheet", async () => {
    const theme = await readItem("calendar-theme");
    const source = await readFile(
      join(workspaceRoot, "registry/calendar-theme/calendar-theme.css"),
      "utf8",
    );
    const base = theme.css?.["@layer base"] as Record<string, Record<string, string>>;

    expect(theme.files?.map(({ target }) => target)).toEqual([
      "@components/calendar/event-colors.ts",
    ]);
    expect(theme.cssVars).toEqual({ theme: expect.any(Object) });
    expect(theme.cssVars?.theme?.["color-calendar-grid"]).toBe("var(--calendar-grid)");
    // Tokens stay in the base layer, as in calendar-theme.css, so the app's own rules win.
    expect(Object.keys(base).slice(0, 2)).toEqual([":root", ".dark"]);
    expect(base[":root"]?.["--calendar-hour-height"]).toBe("3rem");
    expect(base[".dark"]?.["--calendar-today"]).toMatch(/^oklch\(/u);
    // A shadcn app has its own semantic tokens; the theme leaves them alone.
    expect(base[":root"]).not.toHaveProperty("--background");
    expect(base['[data-color="blue"]']).toEqual({
      "--calendar-event-hue": "258",
      "--calendar-event-chroma": "0.17",
    });
    expect(Object.keys(theme.css ?? {})).toEqual([
      "@layer base",
      "@media (prefers-reduced-motion: reduce)",
    ]);
    // Every calendar property in the source reaches the item.
    const shipped = JSON.stringify(theme.css);
    for (const [, property] of source.matchAll(/^\s*(--calendar-[\w-]+):/gmu)) {
      expect(shipped, property).toContain(`"${property}"`);
    }
  });

  test("two builds write the same bytes", async () => {
    const again = await mkdtemp(join(tmpdir(), "time-registry-test-"));
    try {
      await buildRegistry({ workspaceRoot, outDir: again, baseUrl });
      for (const file of await readdir(outDir)) {
        expect(await readFile(join(again, file), "utf8")).toBe(
          await readFile(join(outDir, file), "utf8"),
        );
      }
    } finally {
      await rm(again, { force: true, recursive: true });
    }
  });

  test("a rebuild replaces only what an earlier build wrote", async () => {
    const folder = await mkdtemp(join(tmpdir(), "time-registry-test-"));
    try {
      await writeFile(join(folder, "package.json"), "{}\n");
      await writeFile(join(folder, "removed-item.json"), "{}\n");
      await writeFile(
        join(folder, "registry.json"),
        JSON.stringify({ items: [{ name: "removed-item" }] }),
      );
      await buildRegistry({ workspaceRoot, outDir: folder, baseUrl });

      const files = await readdir(folder);
      expect(files).toContain("package.json");
      expect(files).not.toContain("removed-item.json");
      expect(files).toContain(`${fullItemName}.json`);
    } finally {
      await rm(folder, { force: true, recursive: true });
    }
  });

  test("the docs install from the URL the registry is built for, and only real items", async () => {
    const docs = join(workspaceRoot, "apps/showcase/content/docs");
    const installation = await readFile(join(docs, "installation.mdx"), "utf8");
    const names = manifest.items.map(({ name }) => name);

    expect(installation).toContain(
      `npx shadcn@latest add ${defaultRegistryBaseUrl}/${fullItemName}.json`,
    );
    for (const name of names) expect(installation).toContain(`| \`${name}\``);

    const pages = (await readdir(docs, { recursive: true })).filter((file) =>
      file.endsWith(".mdx"),
    );
    const linked = new Set<string>();
    for (const page of pages) {
      const source = await readFile(join(docs, page), "utf8");
      for (const [, name] of source.matchAll(
        new RegExp(`${RegExp.escape(defaultRegistryBaseUrl)}/([\\w-]+)\\.json`, "gu"),
      )) {
        linked.add(name!);
      }
    }
    expect([...linked].filter((name) => !names.includes(name))).toEqual([]);
    expect(linked.size).toBeGreaterThan(5);
  });
});

describe("built registry checks", () => {
  /** Checks the build with one item's JSON changed, and the manifest changed to match. */
  async function tamper(
    name: string,
    change: (item: BuiltItem) => BuiltItem,
    changeManifest: (manifest: RegistryManifest) => RegistryManifest = (same) => same,
  ): Promise<string[]> {
    const copy = await mkdtemp(join(tmpdir(), "time-registry-test-"));
    try {
      await cp(outDir, copy, { recursive: true });
      await writeFile(join(copy, `${name}.json`), JSON.stringify(change(await readItem(name))));
      return await checkBuiltRegistry({ outDir: copy, manifest: changeManifest(manifest) });
    } finally {
      await rm(copy, { force: true, recursive: true });
    }
  }

  function changeItem(
    name: string,
    change: (item: RegistryManifestItem) => RegistryManifestItem,
  ): (manifest: RegistryManifest) => RegistryManifest {
    return (current) => ({
      ...current,
      items: current.items.map((item) => (item.name === name ? change(item) : item)),
    });
  }

  function withSource(item: BuiltItem, extra: string): BuiltItem {
    const [first, ...rest] = item.files!;
    return { ...item, files: [{ ...first!, content: `${extra}\n${first!.content}` }, ...rest] };
  }

  test("an import of a file no item in the install ships", async () => {
    const issues = await tamper("month-view", (item) =>
      withSource(item, 'import { x } from "@/components/calendar/year-view/year-view";'),
    );
    expect(issues).toEqual([
      expect.stringContaining("imports @/components/calendar/year-view/year-view, which no item"),
    ]);
  });

  test("a stock component or package the install doesn't list", async () => {
    const issues = await tamper("month-view", (item) =>
      withSource(item, 'import { Sheet } from "@/components/ui/sheet";\nimport z from "zod";'),
    );
    expect(issues).toEqual([
      expect.stringContaining("no item in its install lists the sheet component"),
      expect.stringContaining("no item in its install depends on zod"),
    ]);
  });

  test("a drag-and-drop library", async () => {
    const issues = await tamper("month-view", (item) =>
      withSource(item, 'import { useDraggable } from "@dnd-kit/react";'),
    );
    expect(issues).toContainEqual(expect.stringContaining("drag and drop stays optional"));
  });

  test("a repository alias left in the source", async () => {
    const issues = await tamper("month-view", (item) =>
      withSource(item, 'import { x } from "@registry/calendar/event-chip";'),
    );
    expect(issues).toContainEqual(expect.stringContaining("an alias consumers don't have"));
  });

  test("a file written by two items", async () => {
    const issues = await tamper("year-view", (item) => ({
      ...item,
      files: [
        ...item.files!,
        {
          content: "export {};\n",
          path: "registry/year-view/extra.tsx",
          target: "@components/calendar/month-view/month-view.tsx",
          type: "registry:component",
        },
      ],
    }));
    expect(issues).toContainEqual(
      expect.stringContaining("month-view/month-view.tsx is also written by"),
    );
  });

  test("a composition that misses an item", async () => {
    const withoutYear = (urls: readonly string[]) =>
      urls.filter((url) => !url.endsWith("/year-view.json"));
    const issues = await tamper(
      fullItemName,
      (item) => ({ ...item, registryDependencies: withoutYear(item.registryDependencies!) }),
      changeItem(fullItemName, (item) => ({
        ...item,
        items: item.items.filter((name) => name !== "year-view"),
      })),
    );
    expect(issues).toEqual([`${fullItemName} doesn't install year-view`]);
  });

  test("a composition that owns a file", async () => {
    const file = {
      content: "export {};\n",
      path: "registry/calendar-full/extra.ts",
      target: "@components/calendar/extra.ts",
      type: "registry:lib",
    };
    const issues = await tamper(
      fullItemName,
      (item) => ({ ...item, files: [file] }),
      changeItem(fullItemName, (item) => ({ ...item, targets: [file.target] })),
    );
    expect(issues).toEqual([`${fullItemName} owns files instead of composing items`]);
  });

  test("a pinned third-party package or a runtime without a range", async () => {
    const issues = await tamper(
      "month-view",
      (item) => ({ ...item, dependencies: ["@moltenship/calendar", "cn@^0.4.0", "lucide-react"] }),
      changeItem("month-view", (item) => ({
        ...item,
        dependencies: ["@moltenship/calendar", "cn@^0.4.0", "lucide-react"],
      })),
    );
    expect(issues).toEqual([
      "month-view: @moltenship/calendar has no version range",
      "month-view: cn@^0.4.0 pins a third-party package; list it bare",
    ]);
  });
});

describe("runtime compatibility", () => {
  test("reports items whose runtime range the installed version misses", () => {
    const range = manifest.items.find(({ name }) => name === fullItemName)!.compatibility[
      "@moltenship/calendar"
    ]!;
    const older = {
      ...manifest,
      items: manifest.items.map((item) => ({
        ...item,
        compatibility: { "@moltenship/calendar": "^1.0.0" },
      })),
    };

    expect(findIncompatibleItems(manifest, manifest.runtime)).toEqual([]);
    expect(
      findIncompatibleItems(older, { "@moltenship/calendar": "0.9.0" }, [fullItemName]).map(
        describeIncompatibility,
      ),
    ).toEqual([`${fullItemName} needs @moltenship/calendar@^1.0.0, but 0.9.0 is installed`]);
    expect(findIncompatibleItems(older, {}, [fullItemName]).map(describeIncompatibility)).toEqual([
      `${fullItemName} needs @moltenship/calendar@^1.0.0, which isn't installed`,
    ]);
    expect(findIncompatibleItems(older, { "@moltenship/calendar": "1.4.2" })).toEqual([]);
    expect(range).toMatch(/^\^/u);
  });

  test("prereleases of the same version satisfy a prerelease range", () => {
    const rc = {
      ...manifest,
      items: [{ ...manifest.items[0]!, compatibility: { "@moltenship/calendar": "^1.0.0-rc.1" } }],
    };

    expect(findIncompatibleItems(rc, { "@moltenship/calendar": "1.0.0-rc.2" })).toEqual([]);
    expect(findIncompatibleItems(rc, { "@moltenship/calendar": "1.0.0" })).toEqual([]);
    expect(findIncompatibleItems(rc, { "@moltenship/calendar": "1.0.0-beta.1" })).toHaveLength(1);
  });
});

describe("import rewriting", () => {
  test("maps alias targets to the imports shadcn rewrites to the consumer's aliases", () => {
    expect(consumerImportForTarget("@components/calendar/event-chip.tsx")).toBe(
      "@/components/calendar/event-chip",
    );
    expect(consumerImportForTarget("@ui/button.tsx")).toBe("@/components/ui/button");
    expect(consumerImportForTarget("@hooks/use-thing.ts")).toBe("@/hooks/use-thing");
    expect(() => consumerImportForTarget("~/src/styles.css")).toThrow("isn't under an alias");
  });

  test("rewrites static, multi-line, type-only, and dynamic imports", () => {
    const source = [
      'import { a } from "@registry/calendar/a";',
      "import {\n  b,\n  type C,\n} from '@registry/calendar/b';",
      'import type { D } from "@registry/calendar/d";',
      'const e = await import("@registry/calendar/e");',
      'export { f } from "@registry/calendar/f";',
      'import "@registry/calendar/g";',
      'const text = "@registry/calendar/h in a string stays";',
    ].join("\n");

    expect(
      rewriteRegistryImports(source, (specifier) =>
        specifier.replace("@registry/", "@/components/"),
      ),
    ).toBe(
      [
        'import { a } from "@/components/calendar/a";',
        "import {\n  b,\n  type C,\n} from '@/components/calendar/b';",
        'import type { D } from "@/components/calendar/d";',
        'const e = await import("@/components/calendar/e");',
        'export { f } from "@/components/calendar/f";',
        'import "@/components/calendar/g";',
        'const text = "@registry/calendar/h in a string stays";',
      ].join("\n"),
    );
  });
});
