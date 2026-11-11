import { getMDXComponents } from "@/components/mdx";
import { githubUrl, jsonLd, openGraphBase, siteName, siteUrl } from "@/lib/site";
import { source } from "@/lib/source";
import { getBreadcrumbItems } from "fumadocs-core/breadcrumb";
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  EditOnGitHub,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface DocumentationPageProps {
  readonly params: Promise<{ slug?: string[] }>;
}

export default async function DocumentationPage({ params }: DocumentationPageProps) {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) notFound();

  const MDX = page.data.body;
  const url = `${siteUrl}${page.url}`;
  // Search engines want a link on every crumb, so a section without an index page is left out.
  const crumbs = [
    { name: "Docs", url: `${siteUrl}/docs` },
    ...sections(page.url).flatMap((section) =>
      section.url === undefined ? [] : [{ name: section.name, url: `${siteUrl}${section.url}` }],
    ),
  ];
  if (crumbs.at(-1)?.url !== url) crumbs.push({ name: page.data.title, url });
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: page.data.title,
        description: page.data.description,
        url,
        inLanguage: "en",
        isPartOf: { "@type": "WebSite", name: siteName, url: siteUrl },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: crumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: crumb.url,
        })),
      },
    ],
  };

  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <script dangerouslySetInnerHTML={jsonLd(structuredData)} type="application/ld+json" />
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
      <div className="flex border-t pt-6">
        <EditOnGitHub href={`${githubUrl}/blob/main/apps/showcase/content/docs/${page.path}`} />
      </div>
    </DocsPage>
  );
}

/** The sidebar sections a page sits in, outermost first. */
function sections(url: string): { name: string; url: string | undefined }[] {
  return getBreadcrumbItems(url, source.getPageTree()).flatMap((item) =>
    typeof item.name === "string" ? [{ name: item.name, url: item.url }] : [],
  );
}

export function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata({ params }: DocumentationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = source.getPage(slug);
  if (page === undefined) notFound();

  // "Overview" and "Recurrence" name several pages, so a title carries its section too.
  const title = [
    page.data.title,
    ...sections(page.url)
      .map((section) => section.name)
      .reverse(),
  ].join(" · ");

  return {
    title,
    description: page.data.description,
    alternates: { canonical: page.url },
    openGraph: {
      ...openGraphBase,
      type: "article",
      url: page.url,
      title,
      description: page.data.description,
    },
  };
}
