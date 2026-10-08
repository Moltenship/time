import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";

import { codeThemes } from "./lib/code-themes";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    lastModified: true,
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    providerImportSource: "@/components/mdx",
    rehypeCodeOptions: {
      themes: codeThemes,
    },
  },
});
