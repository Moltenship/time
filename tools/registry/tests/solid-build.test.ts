import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";

import { buildRegistry } from "../src/build";
import { checkBuiltRegistry } from "../src/check";
import type { RegistryManifest } from "../src/compatibility";
import { defaultRegistryBaseUrl, solidRegistry } from "../src/config";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
const baseUrl = "https://registry.example/r";

interface BuiltItem {
  readonly name: string;
  readonly dependencies?: string[];
  readonly registryDependencies?: string[];
  readonly files?: { readonly content: string; readonly path: string; readonly target: string }[];
  readonly cssVars?: { readonly theme?: Record<string, string> };
  readonly css?: Record<string, Record<string, Record<string, string>>>;
}

let outDir: string;
let reactDir: string;
let manifest: RegistryManifest;

const readItem = async (name: string, directory = outDir) =>
  JSON.parse(await readFile(join(directory, `${name}.json`), "utf8")) as BuiltItem;

beforeAll(async () => {
  [outDir, reactDir] = await Promise.all([
    mkdtemp(join(tmpdir(), "time-registry-solid-")),
    mkdtemp(join(tmpdir(), "time-registry-react-")),
  ]);
  manifest = await buildRegistry({ workspaceRoot, outDir, baseUrl, framework: solidRegistry });
  await buildRegistry({ workspaceRoot, outDir: reactDir, baseUrl });
});

afterAll(async () => {
  await Promise.all([outDir, reactDir].map((path) => rm(path, { force: true, recursive: true })));
});

describe("Solid registry build", () => {
  test("builds every item under /r/solid and passes its checks", async () => {
    expect(manifest.baseUrl).toBe(`${baseUrl}/solid`);
    expect(manifest.items.map(({ name }) => name).toSorted()).toEqual([
      "base-tokens",
      "calendar",
      "calendar-theme",
      "calendar-ui",
      "list-view",
    ]);
    expect(await checkBuiltRegistry({ outDir, manifest, framework: solidRegistry })).toEqual([]);
    const registry = JSON.parse(await readFile(join(outDir, "registry.json"), "utf8")) as {
      readonly name: string;
    };
    expect(registry.name).toBe("moltenship-time-solid");
  });

  test("its items depend on the Solid facade and point at Solid items", async () => {
    const list = await readItem("list-view");

    expect(list.dependencies).toContain("@tanstack/virtual-core");
    expect(list.dependencies?.some((name) => name.startsWith("@moltenship/calendar-solid@"))).toBe(
      true,
    );
    expect(list.dependencies?.some((name) => /^(?:react|@tanstack\/react-)/u.test(name))).toBe(
      false,
    );
    expect(list.registryDependencies).toEqual([
      `${baseUrl}/solid/calendar.json`,
      `${baseUrl}/solid/calendar-theme.json`,
    ]);
  });

  test("shared files import the Solid facade and install where React's do", async () => {
    const [solid, react] = await Promise.all([
      readItem("list-view"),
      readItem("list-view", reactDir),
    ]);
    const shared = solid.files!.filter(({ path }) => path.startsWith("registry/shared/"));

    expect(shared.map(({ target }) => target)).toEqual(
      react
        .files!.filter(({ path }) => path.startsWith("registry/shared/"))
        .map(({ target }) => target),
    );
    for (const file of solid.files!) {
      expect(file.content, file.path).not.toMatch(/from "@moltenship\/calendar"/u);
      expect(file.content, file.path).not.toMatch(/from "react/u);
      expect(file.content, file.path).not.toContain("@registry/");
    }
    const labels = shared.find(({ path }) => path.endsWith("agenda-labels.ts"))!;
    expect(labels.content).toContain('from "@moltenship/calendar-solid"');
    // Everything else in a shared file stays as React's copy has it.
    const reactLabels = react.files!.find(({ path }) => path.endsWith("agenda-labels.ts"))!;
    expect(labels.content.replace("@moltenship/calendar-solid", "@moltenship/calendar")).toBe(
      reactLabels.content,
    );
  });

  test("the theme and the base tokens are React's, from the same files", async () => {
    const [theme, reactTheme, base, reactBase] = await Promise.all([
      readItem("calendar-theme"),
      readItem("calendar-theme", reactDir),
      readItem("base-tokens"),
      readItem("base-tokens", reactDir),
    ]);

    expect(theme.css).toEqual(reactTheme.css);
    expect(theme.cssVars).toEqual(reactTheme.cssVars);
    expect(base.css).toEqual(reactBase.css);
    expect(base.cssVars).toEqual(reactBase.cssVars);
    const tokens = base.css!["@layer base"] as Record<string, Record<string, string>>;
    expect(tokens[":root"]?.["--background"]).toBe("oklch(1 0 0)");
    expect(tokens[".dark"]?.["--background"]).toBe("oklch(0.145 0 0)");
    expect(base.files).toBeUndefined();
  });

  test("the docs install Solid items from /r/solid, and only real ones", async () => {
    const docs = join(workspaceRoot, "apps/showcase/content/docs");
    const names = manifest.items.map(({ name }) => name);
    const linked = new Set<string>();
    for (const page of (await readdir(docs, { recursive: true })).filter((file) =>
      file.endsWith(".mdx"),
    )) {
      const source = await readFile(join(docs, page), "utf8");
      for (const [, name] of source.matchAll(
        new RegExp(`${RegExp.escape(defaultRegistryBaseUrl)}/solid/([\\w-]+)\\.json`, "gu"),
      )) {
        linked.add(name!);
      }
    }
    expect([...linked].filter((name) => !names.includes(name))).toEqual([]);
    expect(linked).toContain("list-view");
  });
});
