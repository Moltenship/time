"use client";

import { ReactLogo, SolidLogo } from "@/components/framework-logos";
import {
  type Framework,
  frameworkNames,
  frameworks,
  parseDocsUrl,
  twinUrl,
} from "@/lib/frameworks";
import { rememberFramework } from "@/lib/remembered-framework";
import { usePathname } from "fumadocs-core/framework";
import { SidebarTabsDropdown } from "fumadocs-ui/components/sidebar/tabs/dropdown";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { type ReactNode, useEffect, useMemo } from "react";

const logos: Record<Framework, ReactNode> = {
  react: <ReactLogo className="size-full" />,
  solid: <SolidLogo className="size-full" />,
};

export interface FrameworkSelectProps {
  /** The framework whose docs the layout shows. */
  readonly framework: Framework;
  /** Every page's address in each framework's docs, to find the page to switch to. */
  readonly pages: Readonly<Record<Framework, readonly string[]>>;
}

/**
 * The options of the select: one for each framework, each leading to the page the reader is on in
 * that framework's docs, or to the nearest page above it when that framework has no such page.
 */
export function frameworkOptions(
  pathname: string,
  current: Framework,
  pages: FrameworkSelectProps["pages"],
): LayoutTab[] {
  return frameworks.map((framework) => {
    const own = new Set(pages[framework]);
    const selected = framework === current;
    return {
      title: frameworkNames[framework],
      icon: logos[framework],
      // The selected option leads where the reader is, so choosing it again changes nothing.
      url: selected ? pathname : twinUrl(pathname, framework, (url) => own.has(url)),
      props: { "aria-current": selected ? "true" : undefined },
    };
  });
}

/**
 * Switches the docs between React and Solid, at the top of the sidebar and of the phone's drawer.
 * It is Fumadocs' own sidebar dropdown: a button that opens a list of links. The links are plain
 * ones, so they work with a keyboard, open in a new tab, and are prefetched like any other.
 */
export function FrameworkSelect({ framework, pages }: FrameworkSelectProps) {
  const pathname = usePathname();
  const current = parseDocsUrl(pathname)?.framework ?? framework;
  const options = useMemo(
    () => frameworkOptions(pathname, current, pages),
    [pathname, current, pages],
  );

  // Remember the framework being read, for the addresses that name none (`docs-redirects.mjs`).
  useEffect(() => {
    rememberFramework(current);
  }, [current]);

  return (
    <SidebarTabsDropdown aria-label={`Framework: ${frameworkNames[current]}`} options={options} />
  );
}
