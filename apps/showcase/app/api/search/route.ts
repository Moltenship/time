import { frameworkNames } from "@/lib/frameworks";
import { allPages, frameworkOf, pageSections } from "@/lib/source";
import { createSearchAPI } from "fumadocs-core/search/server";

export const revalidate = false;

/**
 * One index for both frameworks' docs. Each page is tagged with its framework, and the search
 * dialog asks for the tag of the docs the reader is in (`components/search.tsx`).
 */
export const { staticGET: GET } = createSearchAPI("advanced", {
  language: "english",
  indexes: () =>
    allPages().map((page) => {
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
    }),
});
