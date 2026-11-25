import { applyMdxPreset, defineConfig, defineDocs } from "fumadocs-mdx/config";
import { metaSchema, pageSchema } from "fumadocs-core/source/schema";

import { codeThemes } from "./lib/code-themes";
import { type Framework, otherFramework } from "./lib/frameworks";
import { remarkFramework } from "./lib/remark-framework";

/**
 * One folder of pages, compiled once for each framework. A page without a framework in its file
 * name is in both sets; `page.react.mdx` and `page.solid.mdx` are one set's page each, at the
 * same address in their own docs. `lib/remark-framework.ts` says how a shared page differs
 * between the two, and `lib/source.ts` builds each set's pages and sidebar.
 */
function docsFor(framework: Framework) {
  return defineDocs({
    dir: "content/docs",
    docs: {
      files: ["**/*.mdx", `!**/*.${otherFramework(framework)}.mdx`],
      schema: pageSchema,
      // A collection's own options replace the global ones, so the preset is applied here.
      mdxOptions: applyMdxPreset({
        rehypeCodeOptions: { themes: codeThemes },
        // First, so nothing after it sees the other framework's content.
        remarkPlugins: (plugins) => [remarkFramework(framework), ...plugins],
        valueToExport: ["frameworkSpecific", "docLinks"],
      }),
      postprocess: {
        // A component, not a string: `lib/llms-components.tsx` gives each MDX component its
        // Markdown form, so `/llms.txt`, the `.md` pages and the packaged docs have no JSX left.
        includeProcessedMarkdown: { headingIds: false, output: "function" },
      },
    },
    meta: { schema: metaSchema },
  });
}

export const react = docsFor("react");
export const solid = docsFor("solid");

export default defineConfig();
