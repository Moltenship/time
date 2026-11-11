import { siteDescription, siteName, siteUrl } from "@/lib/site";
import { source } from "@/lib/source";

export const dynamic = "force-static";

// An index of the docs for language models: https://llmstxt.org
export function GET() {
  const pages = source
    .getPages()
    .map((page) => `- [${page.data.title}](${siteUrl}${page.url}): ${page.data.description ?? ""}`);

  return new Response(
    [`# ${siteName}`, "", `> ${siteDescription}`, "", "## Docs", "", ...pages, ""].join("\n"),
    {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    },
  );
}
