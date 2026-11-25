import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import {
  checkDocsTag,
  nextTagLeftovers,
  nextTagLines,
  prepareDocs,
  trackedDocs,
  withoutNextTag,
} from "../src/docs-tag";
import { runOrThrow, workspaceRoot } from "../src/workspace";

const readme = [
  "# Calendar",
  "",
  "```bash",
  "pnpm add @moltenship/calendar@next @moltenship/calendar-dnd-kit@next @ui-sdk/core react",
  "```",
  "",
  "Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.",
  "",
  "- React 19.",
  "- `@moltenship/calendar@next` ships its docs.",
  "",
].join("\n");

const stableReadme = [
  "# Calendar",
  "",
  "```bash",
  "pnpm add @moltenship/calendar @moltenship/calendar-dnd-kit @ui-sdk/core react",
  "```",
  "",
  "- React 19.",
  "- `@moltenship/calendar` ships its docs.",
  "",
].join("\n");

const page = [
  "```bash",
  "pnpm add @moltenship/calendar",
  "```",
  "",
  "<PreRelease>",
  "",
  "Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`.",
  "",
  "</PreRelease>",
  "",
  "The skill.<PreRelease> `@moltenship/calendar@next` installs 2.0.</PreRelease> It matches.",
  "",
].join("\n");

/** A repository with these tracked files, and one untracked that nothing should read. */
async function repository(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "release-docs-tag-"));
  await runOrThrow("git", ["init", "--quiet"], { cwd: root });
  for (const [file, text] of Object.entries(files)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  await runOrThrow("git", ["add", "--all"], { cwd: root });
  await writeFile(join(root, "notes.md"), "pnpm add @moltenship/calendar@next\n");
  return root;
}

describe("the release commit of a stable version", () => {
  test("takes the tag off each package and drops the sentence about it", () => {
    expect(withoutNextTag(readme)).toBe(stableReadme);
    // Both forms of the sentence, and nothing else: another package's tag stays.
    expect(
      withoutNextTag(
        "Time 2.0 is a pre-release on npm's `next` tag, so both commands install `@next`.\n\nnpx shadcn@next add\n",
      ),
    ).toBe("npx shadcn@next add\n");
    expect(withoutNextTag(stableReadme)).toBe(stableReadme);
  });

  test("rewrites the tracked Markdown nothing compiles, and leaves the docs pages", async () => {
    const root = await repository({
      "README.md": readme,
      "packages/calendar/README.md": readme,
      "packages/calendar/skills/time/SKILL.md": readme,
      "docs/notes.md": "No install command here.\n",
      "apps/showcase/content/docs/installation.mdx": page,
      "packages/calendar/src/index.ts": "// pnpm add @moltenship/calendar@next\n",
    });
    try {
      expect(await prepareDocs("2.0.0", root)).toEqual([
        "README.md",
        "packages/calendar/README.md",
        "packages/calendar/skills/time/SKILL.md",
      ]);
      expect(await readFile(join(root, "README.md"), "utf8")).toBe(stableReadme);
      expect(
        await readFile(join(root, "apps/showcase/content/docs/installation.mdx"), "utf8"),
      ).toBe(page);
      // An untracked file is nobody's to rewrite.
      expect(await readFile(join(root, "notes.md"), "utf8")).toContain("@next");
      await expect(checkDocsTag("2.0.0", root)).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("changes nothing for a pre-release", async () => {
    const root = await repository({ "README.md": readme });
    try {
      expect(await prepareDocs("2.0.0-beta.2", root)).toEqual([]);
      expect(await readFile(join(root, "README.md"), "utf8")).toBe(readme);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});

describe("the release gate's check of install commands", () => {
  test("passes a pre-release whose docs install @next", async () => {
    const root = await repository({ "README.md": readme, "docs/page.mdx": page });
    try {
      await expect(checkDocsTag("2.0.0-beta.2", root)).resolves.toBeUndefined();
      await expect(checkDocsTag("2.0.0-rc.1", root)).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("fails a stable version with a leftover, and names the file and line", async () => {
    const root = await repository({
      "README.md": stableReadme,
      "packages/ics/README.md": readme,
      "apps/showcase/content/docs/testing.mdx": `${page}\npnpm add -D @moltenship/calendar-testing@next\n`,
    });
    try {
      await expect(checkDocsTag("2.0.0", root)).rejects.toThrow(
        /^2\.0\.0 is a stable version.*still install @next.*: apps\/showcase\/content\/docs\/testing\.mdx:13, packages\/ics\/README\.md:4, packages\/ics\/README\.md:7, packages\/ics\/README\.md:10\./u,
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("passes a stable version that is clean", async () => {
    const root = await repository({ "README.md": stableReadme, "docs/page.mdx": page });
    try {
      await expect(checkDocsTag("2.0.0", root)).resolves.toBeUndefined();
      await expect(checkDocsTag("2.1.3", root)).resolves.toBeUndefined();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  test("reads a docs page outside its pre-release blocks, which a stable site drops", () => {
    expect(nextTagLines("page.mdx", page)).toEqual([]);
    // The same text in a file nothing compiles keeps its blocks, so it counts.
    expect(nextTagLines("page.md", page)).toEqual(["page.md:7", "page.md:11"]);
    expect(nextTagLines("README.md", readme)).toEqual([
      "README.md:4",
      "README.md:7",
      "README.md:10",
    ]);
    // A sentence left behind when only its command lost the tag.
    expect(
      nextTagLines("README.md", "Time 2.0 is a pre-release on npm's `next` tag, so it is `@next`."),
    ).toEqual(["README.md:1"]);
  });
});

describe("this repository", () => {
  test("tracks its READMEs, skill files and docs pages as Markdown the check reads", async () => {
    const docs = await trackedDocs();

    expect(docs).toContain("README.md");
    expect(docs).toContain("packages/calendar/README.md");
    expect(docs).toContain("packages/calendar/skills/moltenship-time/SKILL.md");
    expect(docs).toContain(".claude/skills/release/SKILL.md");
    expect(docs).toContain("apps/showcase/content/docs/installation.mdx");
    expect(docs.every((file) => /\.mdx?$/u.test(file))).toBe(true);
  });

  // The gate checks this on the release commit. Here it fails in the PR that adds a line the
  // release commit wouldn't clean, long before a stable release finds it.
  test("would install no @next once the release commit of a stable version rewrote it", async () => {
    expect(await nextTagLeftovers(workspaceRoot, { rewritten: true })).toEqual([]);
  });
});
