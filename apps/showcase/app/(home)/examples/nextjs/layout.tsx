import { githubUrl } from "@/lib/layout";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Next.js App Router example",
  description:
    "A calendar whose view and date live in the URL, with Server Actions saving its changes.",
};

const sourceUrl = `${githubUrl}/tree/main/apps/showcase/app/(home)/examples/nextjs`;

// The layout stays mounted across the page's navigations; only the calendar below re-renders.
export default function ExampleLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">Next.js App Router example</h1>
        <p className="mt-3 text-fd-muted-foreground">
          The URL holds the view and the date. A Server Component fetches that range's meetings, and
          Server Actions save what you create, move and resize. Your changes stay in this server's
          memory, for you only, and can reset at any time.
        </p>
        <p className="mt-3 flex gap-4 text-sm font-medium">
          <Link className="hover:text-brand" href="/docs/guides/nextjs-app-router">
            Read the guide
          </Link>
          <a className="hover:text-brand" href={sourceUrl}>
            Source on GitHub
          </a>
        </p>
      </header>
      <div className="h-[40rem] overflow-hidden rounded-xl border bg-fd-background shadow-sm">
        {children}
      </div>
    </div>
  );
}
