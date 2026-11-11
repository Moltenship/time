import { siteDescription, siteName, siteUrl } from "@/lib/site";
import { qualifiedTitle, source } from "@/lib/source";

export const dynamic = "force-static";

// An index of the docs for language models: https://llmstxt.org
export function GET() {
  const pages = source.getPages().map((page) => {
    const link = `- [${qualifiedTitle(page)}](${siteUrl}${page.url})`;
    return page.data.description === undefined ? link : `${link}: ${page.data.description}`;
  });

  return new Response(
    [`# ${siteName}`, "", `> ${siteDescription}`, "", "## Docs", "", ...pages, ""].join("\n"),
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
