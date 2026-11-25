import { scanURLs } from "next-validate-link";

import { type LinkedPage, brokenLinks } from "@/lib/link-check";
import { pageMarkdown } from "@/lib/llms";
import { allPages, docLinks } from "@/lib/source";

// The site's addresses outside the docs: the App Router's own pages, and the Markdown ones, which
// are route handlers and a rewrite (`app/llms.txt`, `app/llms-full.txt`, `docs-redirects.mjs`).
const scanned = await scanURLs({ cwd: process.cwd(), preset: "next" });
const pages = allPages();
const siteUrls = new Set([
  ...scanned.urls.keys(),
  "/llms.txt",
  "/llms-full.txt",
  ...pages.map((page) => `${page.url}.md`),
]);

const linked = pages.map((page): LinkedPage => ({
  url: page.url,
  file: page.absolutePath ?? page.path,
  links: docLinks(page),
  hashes: page.data.toc.map((item) => item.url.slice(1)),
}));

// Each page's Markdown for agents is written from the page's source text, by another path than
// the page itself (`lib/remark-framework.ts`, `lib/llms.ts`). So its links are checked too, and
// that it holds one framework's text: no `<React>` or `<Solid>` block may be left in it.
const blockTag = /<\/?(?:React|Solid)>/u;
const leftovers: string[] = [];
const markdown = await Promise.all(
  linked.map(async (entry, index): Promise<LinkedPage> => {
    const links: string[] = [];
    const page = pages[index];
    if (page === undefined) return { ...entry, links };
    const text = await pageMarkdown(page, (url, hash) => {
      links.push(`${url}${hash}`);
      return `${url}${hash}`;
    });
    const tag = blockTag.exec(text)?.[0];
    if (tag !== undefined) leftovers.push(`${entry.file} (${entry.url}.md): ${tag} is left in it`);
    return { ...entry, links };
  }),
);

const broken = brokenLinks(linked, siteUrls);
const brokenInMarkdown = brokenLinks(markdown, siteUrls);

for (const { file, link, page, reason } of broken) {
  console.error(`${file} (${page}): ${link}: ${reason}`);
}
for (const { file, link, page, reason } of brokenInMarkdown) {
  console.error(`${file} (${page}.md): ${link}: ${reason}`);
}
for (const leftover of leftovers) console.error(leftover);

const failures = broken.length + brokenInMarkdown.length + leftovers.length;
if (failures > 0) {
  console.error(
    `${broken.length} broken links on the pages, ${brokenInMarkdown.length} in their Markdown, ` +
      `and ${leftovers.length} pages whose Markdown kept a framework's block.`,
  );
  process.exit(1);
}

const count = linked.reduce((total, page) => total + page.links.length, 0);
console.log(
  `Validated ${count} links on ${linked.length} pages of the React and Solid docs, and each page's Markdown.`,
);
