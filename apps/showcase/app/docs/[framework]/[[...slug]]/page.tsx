import { getMDXComponents } from "@/components/mdx";
import { docsUrl, frameworkNames, isFramework } from "@/lib/frameworks";
import { githubUrl, jsonLd, openGraphBase, siteName, siteUrl, websiteId } from "@/lib/site";
import {
  type DocsPage,
  canonicalUrl,
  frameworkOf,
  neighbours,
  pageSections,
  qualifiedTitle,
  sourceFile,
  sourceOf,
  sources,
} from "@/lib/source";
import {
  DocsBody,
  DocsDescription,
  DocsPage as Page,
  DocsTitle,
  EditOnGitHub,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

interface DocumentationPageProps {
  readonly params: Promise<{ framework: string; slug?: string[] }>;
}

async function pageOf({ params }: DocumentationPageProps): Promise<DocsPage> {
  const { framework, slug } = await params;
  const page = isFramework(framework) ? sourceOf(framework).getPage(slug) : undefined;
  if (page === undefined) notFound();
  return page;
}

export default async function DocumentationPage(props: DocumentationPageProps) {
  const page = await pageOf(props);
  const framework = frameworkOf(page);
  const source = sourceOf(framework);

  const MDX = page.data.body;
  const url = `${siteUrl}${page.url}`;
  // Search engines want a link on every crumb, so a section without an index page is left out.
  const crumbs = [
    { name: siteName, url: siteUrl },
    { name: `${frameworkNames[framework]} docs`, url: `${siteUrl}${docsUrl(framework)}` },
    ...pageSections(page).flatMap((name, depth) => {
      const index = source.getPage(page.slugs.slice(0, depth + 1));
      return index === undefined ? [] : [{ name, url: `${siteUrl}${index.url}` }];
    }),
  ];
  if (crumbs.at(-1)?.url !== url) crumbs.push({ name: page.data.title, url });
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        headline: qualifiedTitle(page),
        description: page.data.description,
        url,
        inLanguage: "en",
        isPartOf: { "@id": websiteId },
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
    <Page footer={{ items: neighbours(page) }} full={page.data.full} toc={page.data.toc}>
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
        <EditOnGitHub href={`${githubUrl}/blob/main/apps/showcase/${sourceFile(page)}`} />
      </div>
    </Page>
  );
}

export function generateStaticParams() {
  return [
    ...sources.react.generateParams().map((params) => ({ ...params, framework: "react" })),
    ...sources.solid.generateParams().map((params) => ({ ...params, framework: "solid" })),
  ];
}

export async function generateMetadata(props: DocumentationPageProps): Promise<Metadata> {
  const page = await pageOf(props);
  // A page of Solid's docs says so in its title: half of them are named as React's are.
  const title =
    frameworkOf(page) === "solid" ? `${qualifiedTitle(page)} · Solid` : qualifiedTitle(page);

  return {
    title,
    description: page.data.description,
    alternates: { canonical: canonicalUrl(page) },
    openGraph: {
      ...openGraphBase,
      type: "article",
      url: canonicalUrl(page),
      title,
      description: page.data.description,
    },
  };
}
