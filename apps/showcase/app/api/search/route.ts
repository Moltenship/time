import { searchRecords } from "@/lib/search-index";
import { createSearchAPI } from "fumadocs-core/search/server";

export const revalidate = false;

/** One index for both frameworks' docs, each page tagged with its framework. */
export const { staticGET: GET } = createSearchAPI("advanced", {
  language: "english",
  indexes: searchRecords,
});
