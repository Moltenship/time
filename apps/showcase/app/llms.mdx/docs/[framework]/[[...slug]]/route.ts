import { isFramework } from "@/lib/frameworks";
import { pageMarkdown } from "@/lib/llms";
import { sourceOf, sources } from "@/lib/source";
import { notFound } from "next/navigation";

export const revalidate = false;

interface MarkdownPageContext {
  readonly params: Promise<{ framework: string; slug?: string[] }>;
}

/**
 * A docs page as Markdown. `next.config.mjs` rewrites `/docs/<framework>/<page>.md` to this route,
 * so the address is the page's own with `.md` added.
 */
export async function GET(_request: Request, { params }: MarkdownPageContext): Promise<Response> {
  const { framework, slug } = await params;
  const page = isFramework(framework) ? sourceOf(framework).getPage(slug) : undefined;
  if (page === undefined) notFound();

  return new Response(await pageMarkdown(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return [
    ...sources.react.generateParams().map((params) => ({ ...params, framework: "react" })),
    ...sources.solid.generateParams().map((params) => ({ ...params, framework: "solid" })),
  ];
}
