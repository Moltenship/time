import { defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";

import { codeThemes } from "./lib/code-themes";

export const docs = defineDocs({
  dir: "content/docs",
  docs: {
    schema: pageSchema,
    postprocess: {
      // A component, not a string: `lib/llms-components.tsx` gives each MDX component its Markdown
      // form, so `/llms.txt`, the `.md` pages and the packaged docs have no JSX left in them.
      includeProcessedMarkdown: { headingIds: false, output: "function" },
    },
  },
  meta: {
    schema: metaSchema,
  },
});

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: codeThemes,
    },
  },
});
