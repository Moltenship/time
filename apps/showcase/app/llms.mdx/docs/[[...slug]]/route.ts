import { pageMarkdown } from "@/lib/llms";
import { source } from "@/lib/source";
import { notFound } from "next/navigation";

export const revalidate = false;

interface MarkdownPageContext {
  readonly params: Promise<{ slug?: string[] }>;
}

/**
 * A docs page as Markdown. `next.config.mjs` rewrites `/docs/<page>.md` to this route, so the
 * address is the page's own with `.md` added.
 */
export async function GET(_request: Request, { params }: MarkdownPageContext): Promise<Response> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) notFound();

  return new Response(await pageMarkdown(page), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

export function generateStaticParams() {
  return source.generateParams();
}
