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
import Link from "fumadocs-core/link";
import { Popover, PopoverContent, PopoverTrigger } from "fumadocs-ui/components/ui/popover";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { Check, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

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
 *
 * `hash` is the heading the reader is at (`#keyboard`). The same page in the other framework's docs
 * keeps it, so a switch lands on the same section. A page that only stands in for the one the
 * reader was on has other headings, so it opens at its top. Where the two sets name a section
 * differently, the browser finds no such heading and opens the page at its top too.
 */
export function frameworkOptions(
  pathname: string,
  current: Framework,
  pages: FrameworkSelectProps["pages"],
  hash = "",
): LayoutTab[] {
  const here = parseDocsUrl(pathname)?.path;
  return frameworks.map((framework) => {
    const own = new Set(pages[framework]);
    const selected = framework === current;
    const twin = selected ? pathname : twinUrl(pathname, framework, (url) => own.has(url));
    const samePage = here !== undefined && parseDocsUrl(twin)?.path === here;
    return {
      title: frameworkNames[framework],
      icon: logos[framework],
      // The selected option leads where the reader is, hash included, so choosing it again keeps
      // the address.
      url: samePage ? `${twin}${hash}` : twin,
      props: { "aria-current": selected ? "page" : undefined },
    };
  });
}

/**
 * Switches the docs between React and Solid, at the top of the sidebar and of the phone's drawer:
 * a button that opens a list of links. The links are plain ones, so they work with a keyboard,
 * open in a new tab, and are prefetched like any other.
 *
 * It looks like Fumadocs' sidebar dropdown and is built on the same popover. That dropdown gives
 * its popover no name and takes none, and a popover is a dialog to a screen reader, so this one
 * is written here, where it can be named. It also leaves the phone's drawer to close on a
 * switch, as it does after any other link: the reader lands on the page they were reading.
 */
export function FrameworkSelect({ framework, pages }: FrameworkSelectProps) {
  const pathname = usePathname();
  const current = parseDocsUrl(pathname)?.framework ?? framework;
  const [open, setOpen] = useState(false);
  // The address's hash, read as the list opens: the links exist only while it is open, and a
  // click on a heading or in the table of contents changes the hash without rendering this again.
  const [hash, setHash] = useState("");
  const options = useMemo(
    () => frameworkOptions(pathname, current, pages, hash),
    [pathname, current, pages, hash],
  );

  // Remember the framework being read, for the addresses that name none (`docs-redirects.mjs`).
  useEffect(() => {
    rememberFramework(current);
  }, [current]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setHash(window.location.hash);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        aria-label={`Framework: ${frameworkNames[current]}`}
        className="flex items-center gap-2 rounded-lg border bg-fd-secondary/50 p-2 text-start text-fd-secondary-foreground transition-colors hover:bg-fd-accent data-[state=open]:bg-fd-accent data-[state=open]:text-fd-accent-foreground"
      >
        <div className="size-9 shrink-0 md:size-5">{logos[current]}</div>
        <p className="text-sm font-medium">{frameworkNames[current]}</p>
        <ChevronsUpDown
          aria-hidden="true"
          className="ms-auto size-4 shrink-0 text-fd-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent
        aria-label="Framework"
        className="fd-scroll-container flex w-(--radix-popover-trigger-width) flex-col gap-1 p-1"
      >
        {options.map((option) => (
          <Link
            key={option.url}
            href={option.url}
            onClick={() => {
              setOpen(false);
            }}
            {...option.props}
            className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-fd-accent hover:text-fd-accent-foreground"
          >
            <div className="size-9 shrink-0 md:size-5">{option.icon}</div>
            <p className="text-sm leading-none font-medium">{option.title}</p>
            <Check
              aria-hidden="true"
              className={`ms-auto size-3.5 shrink-0 text-fd-primary ${
                option.props?.["aria-current"] === "page" ? "" : "invisible"
              }`}
            />
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
