/**
 * Writes the docs as Markdown into `packages/calendar/docs`, where `@moltenship/calendar` ships
 * them: an `llms.txt` index and one file per page, linked with relative paths. The pages come from
 * the same MDX and the same renderer as the site's `/llms.txt` and `.md` routes (`lib/llms.ts`),
 * so the packaged docs are the site's docs at the version that was built.
 *
 * `@moltenship/calendar`'s `build` runs it. `node --run docs:package -- <folder>` writes elsewhere.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { llmsIndex, orderedPages, pageMarkdown } from "@/lib/llms";
import { fileLink, markdownPath, siteUrl } from "@/lib/llms-format";

const facade = resolve(import.meta.dirname, "../../../packages/calendar");
const destination = resolve(process.argv[2] ?? join(facade, "docs"));
const { name, version } = JSON.parse(await readFile(join(facade, "package.json"), "utf8")) as {
  readonly name: string;
  readonly version: string;
};

const notes = [
  `These are the docs for ${name} ${version}, as Markdown. Each link below is a file beside this one. They're generated from the same source as ${siteUrl}/docs, where the live examples run.`,
  "Read this index first, then only the pages your task needs. To let an AI agent operate a calendar, start at [Agents](./agents.md). The exact API is in the package's `.d.mts` types.",
];

await rm(destination, { force: true, recursive: true });
await mkdir(destination, { recursive: true });

const pages = orderedPages();
await Promise.all(
  pages.map(async (page) => {
    const file = join(destination, markdownPath(page.url));
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await pageMarkdown(page, fileLink(page.url)));
  }),
);
await writeFile(join(destination, "llms.txt"), llmsIndex(fileLink("/docs"), notes));

console.log(`Wrote ${pages.length} pages and llms.txt to ${destination}.`);
