import type { FileObject } from "next-validate-link";
import { printErrors, scanURLs, validateFiles } from "next-validate-link";

import { source } from "@/lib/source";

const pages = source.getPages();
const scanned = await scanURLs({
  cwd: process.cwd(),
  preset: "next",
  populate: {
    "docs/[[...slug]]": pages.map((page) => ({
      hashes: page.data.toc.map((item) => item.url.slice(1)),
      value: { slug: page.slugs },
    })),
  },
});
// The Markdown addresses are route handlers and a rewrite (`app/llms.txt`, `app/llms-full.txt`,
// `next.config.mjs`), which the scan of pages doesn't list.
for (const url of [
  "/llms.txt",
  "/llms-full.txt",
  "/docs.md",
  ...pages.filter((page) => page.url !== "/docs").map((page) => `${page.url}.md`),
]) {
  scanned.urls.set(url, {});
}
const files = await Promise.all(
  pages.map(async (page): Promise<FileObject> => ({
    content: await page.data.getText("raw"),
    data: page.data,
    path: page.absolutePath ?? page.path,
    url: page.url,
  })),
);
const results = await validateFiles(files, {
  checkRelativePaths: "as-url",
  scanned,
});

printErrors(results, true);
console.log(`Validated ${files.length} authored documentation pages.`);
