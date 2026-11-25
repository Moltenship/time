import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { distTag } from "./manifest";
import { runOrThrow, workspaceRoot } from "./workspace";

/**
 * The `next` tag in what people read: while a version is a pre-release, the READMEs, the skill
 * files and the docs install `@moltenship/…@next`, the tag `distTag` publishes pre-releases under.
 * A stable version goes to `latest`, so those commands must lose the tag in the release commit, or
 * they would keep installing the last pre-release.
 *
 * The docs site's pages need no edit: they write their commands without a tag and the site adds it
 * for the version it is built with (`apps/showcase/lib/install-tag.ts`). Markdown that nothing
 * compiles is rewritten here, in the release commit (`takeOutNextTag`), and `checkDocsTag` fails a
 * stable release while any tracked Markdown still names the tag.
 */

/** A Time package with the pre-release tag, as an install command names it. */
const taggedPackage = /(@moltenship\/[a-z][a-z-]*)@next\b/gu;

/**
 * The sentence the READMEs and skill files put under such a command, with the blank line after
 * it: "Time 2.0 is a pre-release on npm's `next` tag, so the command installs `@next`."
 */
const preReleaseNote =
  /^Time \d+\.\d+ is a pre-release on npm's `next` tag, so [^\n]*`@next`\.[ \t]*\n(?:[ \t]*\n)?/gmu;

/** That sentence where it stands, as it is left when only its command lost the tag. */
const noteLeftover = /^\s*Time \d+\.\d+ is a pre-release on npm's `next` tag, so /u;

/** A block of a docs page the site drops for a stable version (`lib/remark-framework.ts`). */
const preReleaseBlock = /<PreRelease>[\s\S]*?<\/PreRelease>/gu;

/** `text` as a stable release ships it: the packages without the tag, and no sentence about it. */
export function withoutNextTag(text: string): string {
  return text.replace(preReleaseNote, "").replace(taggedPackage, "$1");
}

/**
 * The lines of a file that still install the pre-release tag, as `file:line`. A docs page (`.mdx`)
 * may name it inside `<PreRelease>` blocks, which the site drops for a stable version.
 */
export function nextTagLines(file: string, text: string): string[] {
  // Blanked, not removed, so the lines keep their numbers.
  const read = file.endsWith(".mdx")
    ? text.replace(preReleaseBlock, (block) => block.replace(/[^\n]/gu, " "))
    : text;
  return read.split("\n").flatMap((line, index) => {
    taggedPackage.lastIndex = 0;
    return taggedPackage.test(line) || noteLeftover.test(line) ? [`${file}:${index + 1}`] : [];
  });
}

/** Every tracked Markdown file, from the root: the docs, READMEs, notes and skill files. */
export async function trackedDocs(root = workspaceRoot): Promise<string[]> {
  const { stdout } = await runOrThrow("git", ["ls-files", "-z", "--", "*.md", "*.mdx"], {
    cwd: root,
  });
  return stdout.split("\0").filter(Boolean);
}

/**
 * The release commit's edit for a stable version: takes the tag out of every tracked Markdown
 * file nothing compiles, and returns the files it wrote, from the root. Docs pages are left alone.
 */
export async function takeOutNextTag(root = workspaceRoot): Promise<string[]> {
  const written: string[] = [];
  for (const file of await trackedDocs(root)) {
    if (file.endsWith(".mdx")) continue;
    const text = await readFile(join(root, file), "utf8");
    const rewritten = withoutNextTag(text);
    if (rewritten === text) continue;
    await writeFile(join(root, file), rewritten);
    written.push(file);
  }
  return written;
}

/** What the release commit of `version` changes besides the manifests: nothing for a pre-release. */
export async function prepareDocs(version: string, root = workspaceRoot): Promise<string[]> {
  return distTag(version) === "next" ? [] : takeOutNextTag(root);
}

/**
 * The lines that still install the tag, in the tracked Markdown as it is, or with `rewritten`, as
 * the release commit would leave it.
 */
export async function nextTagLeftovers(
  root = workspaceRoot,
  { rewritten = false } = {},
): Promise<string[]> {
  const lines: string[] = [];
  for (const file of await trackedDocs(root)) {
    const text = await readFile(join(root, file), "utf8");
    lines.push(
      ...nextTagLines(file, rewritten && !file.endsWith(".mdx") ? withoutNextTag(text) : text),
    );
  }
  return lines;
}

/** Why a stable release can't ship these lines, and what to do about them. */
export function docsTagProblem(version: string, lines: readonly string[]): string {
  return `${version} is a stable version, which npm serves as latest, but these lines still install @next, the pre-release tag: ${lines.join(", ")}. Take the tag out of them, or put a docs page's sentence in <PreRelease>.`;
}

/**
 * The release gate's check, for the version being released: a stable version fails while any
 * tracked doc, README or skill file still installs `@moltenship/…@next`, and names the lines. A
 * pre-release passes with them, since `next` is where it goes.
 */
export async function checkDocsTag(version: string, root = workspaceRoot): Promise<void> {
  if (distTag(version) === "next") {
    console.log(`${version} is a pre-release, which install commands name as @next.`);
    return;
  }
  const lines = await nextTagLeftovers(root);
  if (lines.length > 0) throw new Error(docsTagProblem(version, lines));
  console.log(`No tracked Markdown installs @next, as ${version} needs.`);
}
