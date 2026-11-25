import { docs } from "@/.source/server";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import { type InferPageType, loader } from "fumadocs-core/source";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

/** The names of the sidebar sections a page sits in, outermost first. */
export function pageSections(page: InferPageType<typeof source>): string[] {
  return getBreadcrumbItems(page.url, source.getPageTree()).flatMap((item) =>
    typeof item.name === "string" ? [item.name] : [],
  );
}

/**
 * A page's title with its sections, since two pages are both named "Overview". A section named as
 * the page is, which a folder's index page can be, isn't repeated.
 */
export function qualifiedTitle(page: InferPageType<typeof source>): string {
  const title = page.data.title;
  const sections = pageSections(page).filter((section) => section !== title);
  return [title, ...sections.reverse()].join(" · ");
}
