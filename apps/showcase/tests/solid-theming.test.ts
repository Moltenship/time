import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { calendarEventColors } from "@registry/shared/calendar-theme/event-colors";

import { contentRoot } from "./docs-files";

// Solid's Theming page, checked against the Solid registry's source: the tokens it lists, which of
// them a file reads, the event palette, the look files and the lines its diffs change. A view that
// is the first to read a token, or brings a look file, fails here until the page says so. Which
// views a row names is for the author to check.

const registryRoot = path.join(contentRoot, "../../../../registry");
const page = readFileSync(path.join(contentRoot, "theming.solid.mdx"), "utf8");
const theme = readFileSync(
  path.join(registryRoot, "shared/calendar-theme/calendar-theme.css"),
  "utf8",
);

interface Item {
  readonly name: string;
  readonly files: readonly { readonly path: string; readonly target: string }[];
}

/** The Solid registry's items, as their `registry-item.json` files declare them. */
const items: Item[] = readdirSync(path.join(registryRoot, "solid"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(registryRoot, "solid", entry.name, "registry-item.json"))
  .flatMap((file) => {
    try {
      return [JSON.parse(readFileSync(file, "utf8")) as Partial<Item> & { name: string }];
    } catch {
      return [];
    }
  })
  .map((item) => ({ name: item.name, files: item.files ?? [] }));

/** Every file a Solid app gets, by where it lands under `components/calendar/`. */
const installed = new Map(
  items.flatMap((item) =>
    item.files.map((file) => [
      file.target.replace(/^@components\/calendar\//u, ""),
      readFileSync(path.join(registryRoot, "..", file.path), "utf8"),
    ]),
  ),
);

/** The rows of the table under a heading, as their cells. */
function tableUnder(heading: string): string[][] {
  const section = page.slice(page.indexOf(`\n## ${heading}\n`));
  const lines = section.split("\n");
  const start = lines.findIndex((line) => line.startsWith("|"));
  const rows: string[][] = [];
  for (const line of lines.slice(start + 2)) {
    if (!line.startsWith("|")) break;
    rows.push(
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
  }
  return rows;
}

const unquoted = (cell: string | undefined) => (cell ?? "").replaceAll("`", "");

describe("the tokens Solid's Theming page lists", () => {
  const rows = tableUnder("Tokens");
  const listed = rows.map(([variable]) => unquoted(variable));

  test("are the theme's: every calendar token, and no other", () => {
    const mapped = [...theme.matchAll(/--color-(calendar-[\w-]+):/gu)].map(
      ([, name]) => `--${name}`,
    );
    const root = theme.slice(theme.indexOf(":root {"), theme.indexOf(".dark {"));
    const declared = [...root.matchAll(/^\s*(--calendar-[\w-]+):/gmu)].map(([, name = ""]) => name);
    expect(mapped.length).toBeGreaterThan(0);
    expect(declared.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...new Set([...mapped, ...declared])].sort());
  });

  test("name a file exactly when one of the Solid registry's files reads the token", () => {
    const read = (token: string) => {
      const name = token.slice(2);
      const use = new RegExp(`(?:[a-z]+-|\\(--)${name}(?![\\w-])`, "u");
      return [...installed.values()].some((source) =>
        source.split("\n").some((line) => !/^\s*(?:\/?\*|\/\/)/u.test(line) && use.test(line)),
      );
    };
    const wrong = rows
      .filter(([variable, , , readBy]) => read(unquoted(variable)) === (readBy === "No file yet"))
      .map(([variable, , , readBy]) => `${variable}: "${readBy}"`);
    expect(wrong).toEqual([]);
  });
});

describe("the rest of what the page says about the registry", () => {
  test("the two items exist in the Solid registry", () => {
    const names = items.map((item) => item.name);
    expect(names).toContain("calendar-theme");
    expect(names).toContain("base-tokens");
    expect(installed.has("event-colors.ts")).toBe(true);
  });

  test("the palette it names is the theme's", () => {
    const sentence = /a palette of nine event colors: ([^.]+)\./u.exec(page)?.[1] ?? "";
    const named = [...sentence.matchAll(/`(\w+)`/gu)].map(([, color]) => color);
    expect(named).toEqual([...calendarEventColors]);
    for (const color of calendarEventColors) expect(theme).toContain(`[data-color="${color}"]`);
  });

  test("the look files it lists are the ones the Solid items install", () => {
    const listed = tableUnder("A control's look").map(([file]) => unquoted(file));
    const styles = [...installed.keys()].filter((file) => file.endsWith(".styles.ts"));
    expect(styles.length).toBeGreaterThan(0);
    expect([...listed].sort()).toEqual([...styles].sort());
  });

  test("each line a diff takes out is a line of that file", () => {
    const diffs = [
      ...page.matchAll(/```diff title="components\/calendar\/([^"]+)"\n([\s\S]*?)```/gu),
    ];
    expect(diffs.length).toBeGreaterThan(0);
    for (const [, file = "", body = ""] of diffs) {
      const source = installed.get(file);
      expect(source, file).toBeDefined();
      const removed = body.split("\n").filter((line) => line.startsWith("-"));
      expect(removed.length, file).toBeGreaterThan(0);
      for (const line of removed) expect(source?.split("\n"), file).toContain(line.slice(1));
    }
  });
});
