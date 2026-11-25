/**
 * The docs' link check, as a pure function: `scripts/check-links.ts` feeds it the built pages.
 *
 * It reads each page's links after the build, not from the source file, because that is where a
 * link gets its framework: `/docs/installation` in the source is `/docs/solid/installation` on
 * Solid's page (`lib/remark-framework.ts`). So a page that Solid's docs lack fails here when a
 * Solid page links to it, though the same link is fine on React's page.
 */

export interface LinkedPage {
  /** The page's address: `/docs/solid/quick-start`. */
  readonly url: string;
  /** The source file, for the report. */
  readonly file: string;
  /** Every link on the page. */
  readonly links: readonly string[];
  /** The ids of the page's headings. */
  readonly hashes: readonly string[];
}

export interface BrokenLink {
  readonly page: string;
  readonly file: string;
  readonly link: string;
  readonly reason: string;
}

const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu;

/**
 * The links that lead nowhere. `siteUrls` are the site's addresses outside the docs, such as
 * `/llms.txt`.
 */
export function brokenLinks(
  pages: readonly LinkedPage[],
  siteUrls: ReadonlySet<string>,
): BrokenLink[] {
  const byUrl = new Map(pages.map((page) => [page.url, page]));
  const broken: BrokenLink[] = [];

  for (const page of pages) {
    for (const link of page.links) {
      const reason = whyBroken(link, page, byUrl, siteUrls);
      if (reason !== undefined) broken.push({ page: page.url, file: page.file, link, reason });
    }
  }
  return broken;
}

function whyBroken(
  link: string,
  from: LinkedPage,
  pages: ReadonlyMap<string, LinkedPage>,
  siteUrls: ReadonlySet<string>,
): string | undefined {
  if (external.test(link)) return undefined;

  const [address = "", hash] = link.split("#", 2);
  const path = address.split("?", 1)[0] ?? "";
  if (path === "") {
    return hash === undefined || hash === "" || from.hashes.includes(hash)
      ? undefined
      : "no heading with that id on this page";
  }
  if (!path.startsWith("/")) return "a relative link: write the page's address from /docs";

  const target = pages.get(path.replace(/(?<=.)\/$/u, ""));
  if (target === undefined) {
    if (siteUrls.has(path)) return undefined;
    return path.startsWith("/docs") ? "no such page in these docs" : "no such address on the site";
  }
  return hash === undefined || hash === "" || target.hashes.includes(hash)
    ? undefined
    : `no heading with that id on ${target.url}`;
}
