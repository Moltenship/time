import { frameworkNames } from "@/lib/frameworks";
import { allPages, frameworkOf, pageSections } from "@/lib/source";
import type { AdvancedIndex } from "fumadocs-core/search/server";

/**
 * The search index's records: one for each page of both frameworks' docs, tagged with its
 * framework. The search dialog asks for the tag of the docs the reader is in
 * (`components/search.tsx`), so a search in Solid's docs finds Solid's pages alone.
 */
export function searchRecords(): AdvancedIndex[] {
  return allPages().map((page) => {
    const framework = frameworkOf(page);
    return {
      id: page.url,
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      structuredData: page.data.structuredData,
      breadcrumbs: [frameworkNames[framework], ...pageSections(page)],
      tag: framework,
    };
  });
}
