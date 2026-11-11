import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vite-plus/test";

import { Calendar as LandingCalendar } from "../app/(home)/example";

const contentRoot = fileURLToPath(new URL("../content/docs", import.meta.url));
const landingExamplePath = fileURLToPath(new URL("../app/(home)/example.ts", import.meta.url));

async function collectNavigationCoverage(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const meta = JSON.parse(await readFile(join(directory, "meta.json"), "utf8")) as {
    pages?: unknown;
  };
  expect(Array.isArray(meta.pages)).toBe(true);
  const navigation = meta.pages as string[];
  const authored = entries
    .filter((entry) => entry.isDirectory() || (entry.isFile() && /\.(?:md|mdx)$/.test(entry.name)))
    .map((entry) => (entry.isDirectory() ? entry.name : entry.name.replace(/\.(?:md|mdx)$/, "")))
    .sort();

  expect([...navigation].sort()).toEqual(authored);

  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => collectNavigationCoverage(join(directory, entry.name))),
  );
  return [...authored.filter((name) => name !== "index"), ...nested.flat()];
}

describe("documentation platform contracts", () => {
  test("every authored page is represented in generated navigation metadata", async () => {
    const pages = await collectNavigationCoverage(contentRoot);
    expect(pages.length).toBeGreaterThanOrEqual(9);
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
