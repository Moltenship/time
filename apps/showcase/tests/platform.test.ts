import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { Calendar as LandingCalendar } from "../app/(home)/example";

const contentRoot = fileURLToPath(new URL("../content/docs", import.meta.url));
const landingExamplePath = fileURLToPath(new URL("../app/(home)/example.ts", import.meta.url));

interface NavigationCoverage {
  /** Every page file under the directory, as a path without its extension. */
  readonly authored: readonly string[];
  /** Every page a `meta.json` under the directory lists, as the same kind of path. */
  readonly listed: readonly string[];
}

/**
 * A sidebar entry that names no page of its own: `---Get started---` starts a group, and
 * `[Recurrence](/docs/api/recurrence)` points to a page listed in another section.
 */
const isSeparator = (entry: string) => /^---.*---$/.test(entry);
const isPointer = (entry: string) => /^\[[^\]]*\]\(.+\)$/.test(entry);

/** `...ics` lists the folder's pages in the parent's group, with no folder of their own. */
const folderOf = (entry: string) => entry.replace(/^\.\.\./, "");

/**
 * A folder's `meta.json` lists its own pages and folders. A parent's can also list a page of a
 * folder by its path, such as `agents/coding-agents`, to place it outside that folder's group.
 *
 * A page is one path whatever its files are named: `quick-start.react.mdx` and
 * `quick-start.solid.mdx` are the page `quick-start` in each framework's docs (`lib/source.ts`).
 */
async function collectNavigationCoverage(
  directory: string,
  prefix = "",
): Promise<NavigationCoverage> {
  const entries = await readdir(directory, { withFileTypes: true });
  const meta = JSON.parse(await readFile(join(directory, "meta.json"), "utf8")) as {
    pages?: unknown;
  };
  expect(Array.isArray(meta.pages)).toBe(true);
  const folders = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  const navigation = (meta.pages as string[])
    .filter((entry) => !isSeparator(entry) && !isPointer(entry))
    .map(folderOf);

  // Every folder is in its parent's sidebar.
  expect(navigation.filter((entry) => folders.includes(entry)).sort()).toEqual(folders.sort());

  const nested = await Promise.all(
    folders.map((folder) =>
      collectNavigationCoverage(join(directory, folder), `${prefix}${folder}/`),
    ),
  );
  return {
    authored: [
      ...new Set(
        entries
          .filter((entry) => entry.isFile() && /\.(?:md|mdx)$/.test(entry.name))
          .map((entry) => prefix + entry.name.replace(/(?:\.(?:react|solid))?\.(?:md|mdx)$/, "")),
      ),
      ...nested.flatMap((coverage) => coverage.authored),
    ],
    listed: [
      ...navigation.filter((entry) => !folders.includes(entry)).map((entry) => prefix + entry),
      ...nested.flatMap((coverage) => coverage.listed),
    ],
  };
}

describe("documentation platform contracts", () => {
  test("every authored page is in the sidebar once, and the sidebar lists no other page", async () => {
    const { authored, listed } = await collectNavigationCoverage(contentRoot);
    expect([...listed].sort()).toEqual([...authored].sort());
    expect(authored.length).toBeGreaterThanOrEqual(9);
  });

  test("the landing page example builds a calendar from the public facade", () => {
    expect(LandingCalendar.Root).toBeTypeOf("function");
  });

  test("the landing page example consumes no private Moltenship workspace", async () => {
    const source = await readFile(landingExamplePath, "utf8");
    const workspaceSpecifiers = [...source.matchAll(/from\s+["'](@moltenship\/[^"']+)["']/g)].map(
      (match) => match[1],
    );

    expect(workspaceSpecifiers).toEqual(["@moltenship/calendar"]);
    expect(source).not.toMatch(/(?:packages|apps)\/.+\/src/);
  });
});
