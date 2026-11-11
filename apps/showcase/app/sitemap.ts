import { siteUrl } from "@/lib/site";
import { source } from "@/lib/source";
import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: siteUrl, changeFrequency: "weekly", priority: 1 },
    ...source.getPages().map((page) => ({
      url: `${siteUrl}${page.url}`,
      changeFrequency: "weekly" as const,
      // The introduction, then top-level pages, then pages inside a section.
      priority: page.slugs.length === 0 ? 0.9 : page.slugs.length === 1 ? 0.8 : 0.6,
    })),
    { url: `${siteUrl}/examples/nextjs`, changeFrequency: "monthly", priority: 0.5 },
  ];
}
