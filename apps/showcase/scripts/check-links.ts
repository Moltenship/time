import { source } from "@/lib/source";
import type { FileObject } from "next-validate-link";
import { printErrors, scanURLs, validateFiles } from "next-validate-link";

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
const files = await Promise.all(
  pages.map(
    async (page): Promise<FileObject> => ({
      content: await page.data.getText("raw"),
      data: page.data,
      path: page.absolutePath ?? page.path,
      url: page.url,
    }),
  ),
);
const results = await validateFiles(files, {
  checkRelativePaths: "as-url",
  scanned,
});

printErrors(results, true);
console.log(`Validated ${files.length} authored documentation pages.`);
