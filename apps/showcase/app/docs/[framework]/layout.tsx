import { FrameworkSelect } from "@/components/framework-select";
import { frameworks, isFramework } from "@/lib/frameworks";
import { baseOptions } from "@/lib/layout";
import { sourceOf, sources } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

interface DocumentationLayoutProps {
  readonly children: ReactNode;
  readonly params: Promise<{ framework: string }>;
}

const pages = {
  react: sources.react.getPages().map((page) => page.url),
  solid: sources.solid.getPages().map((page) => page.url),
};

export default async function DocumentationLayout({ children, params }: DocumentationLayoutProps) {
  const { framework } = await params;
  if (!isFramework(framework)) notFound();

  return (
    <DocsLayout
      tree={sourceOf(framework).getPageTree()}
      {...baseOptions()}
      sidebar={{ banner: <FrameworkSelect framework={framework} pages={pages} /> }}
    >
      {children}
    </DocsLayout>
  );
}

export function generateStaticParams() {
  return frameworks.map((framework) => ({ framework }));
}
