import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { prepareDestination } from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, test } from "vite-plus/test";

import {
  docsRedirects,
  docsRewrites,
  frameworkCookie as redirectCookie,
  movedPages,
  movedTarget,
  sharedEntries,
} from "#docs-redirects";
import {
  type Framework,
  docsUrl,
  frameworkCookie,
  frameworks,
  parseDocsUrl,
} from "@/lib/frameworks";

import { pagesOf, sidebarLinks } from "./docs-files";

// The docs' addresses: `/docs/react/…` and `/docs/solid/…` are the pages, and every address from
// before the docs had a framework in them still leads to a page. The redirects are matched with
// Next.js's own matcher, so a pattern here means what it means on the site.

/** Every page of the docs on the day before the split, when `/docs/<page>` was the address. */
const pagesBeforeFrameworks = [
  "",
  "accessibility",
  "agents",
  "agents/changes",
  "agents/coding-agents",
  "agents/connect",
  "agents/deleting",
  "agents/reference",
  "agents/server",
  "agents/webmcp",
  "annotations",
  "api",
  "api/changes",
  "api/dnd-kit",
  "api/events",
  "api/ics",
  "api/primitives",
  "api/react",
  "api/recurrence",
  "api/solid",
  "api/store",
  "api/temporal",
  "availability",
  "comparison",
  "concepts/anatomy",
  "concepts/events",
  "concepts/how-it-works",
  "concepts/recurrence",
  "concepts/state",
  "concepts/time",
  "customization",
  "frameworks",
  "guides/dnd-kit",
  "guides/google-calendar",
  "guides/google-calendar-sync",
  "guides/ics",
  "guides/motion",
  "guides/nextjs",
  "guides/nextjs-app-router",
  "guides/performance",
  "guides/recurring-events",
  "guides/tanstack-query",
  "installation",
  "interactions",
  "migrating-to-2",
  "quick-start",
  "stylex",
  "testing",
  "theme-builder",
  "theming",
  "undo-redo",
  "views",
  "views/agenda",
  "views/custom-views",
  "views/month",
  "views/resource-columns",
  "views/resource-timeline",
  "views/scrolling",
  "views/week-and-day",
  "views/year",
] as const;

const pages: Record<Framework, Set<string>> = { react: pagesOf("react"), solid: pagesOf("solid") };

interface Redirected {
  readonly url: string;
  readonly permanent: boolean;
}

type Cookies = Readonly<Record<string, string>>;

/** Where the redirects send an address, as Next.js tries them: the first that matches. */
function redirect(pathname: string, cookies: Cookies = {}): Redirected | undefined {
  for (const { source, destination, permanent, has } of docsRedirects()) {
    const params = getPathMatch(source, { strict: true, removeUnnamedParams: true })(pathname);
    if (params === false) continue;
    const allowed = (has ?? []).every((condition) => {
      if (condition.type !== "cookie") throw new Error(`Unexpected condition on ${source}.`);
      return cookies[condition.key] === condition.value;
    });
    if (!allowed) continue;
    const { newUrl } = prepareDestination({
      appendParamsToQuery: false,
      destination,
      params,
      query: {},
    });
    return { url: newUrl, permanent: permanent === true };
  }
  return undefined;
}

function rewrite(pathname: string): string | undefined {
  for (const { source, destination } of docsRewrites()) {
    const params = getPathMatch(source, { strict: true, removeUnnamedParams: true })(pathname);
    if (params === false) continue;
    return prepareDestination({ appendParamsToQuery: false, destination, params, query: {} })
      .newUrl;
  }
  return undefined;
}

/** Whether an address is a page of the docs, or a page's Markdown. */
function isPage(url: string): boolean {
  const address = parseDocsUrl(url.replace(/\.md$/u, ""));
  return address !== undefined && pages[address.framework].has(address.path);
}

const old = (page: string) => (page === "" ? "/docs" : `/docs/${page}`);
const solidReader: Cookies = { [frameworkCookie]: "solid" };

describe("addresses from before the docs had a framework", () => {
  test.each(pagesBeforeFrameworks)("/docs/%s leads to a page in one redirect", (page) => {
    for (const address of [old(page), `${old(page)}.md`]) {
      const target = redirect(address);
      expect(target, address).toBeDefined();
      expect(isPage(target?.url ?? ""), `${address} leads to ${target?.url}`).toBe(true);
      // No chain: the page it leads to redirects nowhere.
      expect(redirect(target?.url ?? ""), address).toBeUndefined();
      expect(target?.url.endsWith(".md"), address).toBe(address.endsWith(".md"));
    }
  });

  test("they lead to React's docs, where each of them was, and Solid's page to Solid's", () => {
    for (const page of pagesBeforeFrameworks) {
      const framework = parseDocsUrl(redirect(old(page))?.url ?? "")?.framework;
      expect(framework, old(page)).toBe(page === "api/solid" ? "solid" : "react");
    }
  });

  test("a page keeps its path unless it moved to another section", () => {
    expect(redirect("/docs/views/month")?.url).toBe("/docs/react/views/month");
    expect(redirect("/docs/views/month.md")?.url).toBe("/docs/react/views/month.md");
    expect(redirect("/docs.md")?.url).toBe("/docs/react.md");
    expect(redirect("/docs/api/ics")?.url).toBe("/docs/react/ics/reference");
    expect(redirect("/docs/api/ics.md")?.url).toBe("/docs/react/ics/reference.md");
    expect(redirect("/docs/api/react")?.url).toBe("/docs/react/api/components");
    expect(redirect("/docs/api/solid")?.url).toBe("/docs/solid/api/components");
  });

  test("an old page's redirect is permanent, and can't depend on the remembered framework", () => {
    const picksFramework = new Set(["", ...sharedEntries]);
    for (const page of pagesBeforeFrameworks) {
      if (picksFramework.has(page)) continue;
      expect(redirect(old(page))?.permanent, old(page)).toBe(true);
      expect(redirect(old(page), solidReader), old(page)).toEqual(redirect(old(page)));
    }
  });
});

describe("addresses that name no framework", () => {
  test("/docs opens React's docs, or Solid's for a reader who last read them", () => {
    expect(redirect("/docs")).toEqual({ url: "/docs/react", permanent: false });
    expect(redirect("/docs", solidReader)).toEqual({ url: "/docs/solid", permanent: false });
    expect(redirect("/docs", { [frameworkCookie]: "react" })?.url).toBe("/docs/react");
    expect(redirect("/docs", { [frameworkCookie]: "vue" })?.url).toBe("/docs/react");
  });

  test.each(sharedEntries)("/docs/%s is a page of both sets, and opens in either", (entry) => {
    for (const framework of frameworks) {
      expect(pages[framework].has(entry), `${framework} has ${entry}`).toBe(true);
    }
    expect(redirect(`/docs/${entry}`)).toEqual({ url: `/docs/react/${entry}`, permanent: false });
    expect(redirect(`/docs/${entry}`, solidReader)).toEqual({
      url: `/docs/solid/${entry}`,
      permanent: false,
    });
  });

  test("the redirects and the browser name the same cookie", () => {
    expect(redirectCookie).toBe(frameworkCookie);
  });
});

describe("pages that moved to another section", () => {
  test.each(Object.keys(movedPages))("%s moved to a page that exists", (from) => {
    const { framework, path } = movedTarget(from);
    expect(pages[framework ?? "react"].has(path), `${framework ?? "react"} has ${path}`).toBe(true);
    // The old page itself is gone, so its address is free to redirect.
    for (const set of frameworks) expect(pages[set].has(from), `${set} has ${from}`).toBe(false);
  });

  test("the old path redirects under a framework too, where the sidebar's pointers lead", () => {
    expect(redirect("/docs/react/api/ics")).toEqual({
      url: "/docs/react/ics/reference",
      permanent: true,
    });
    expect(redirect("/docs/solid/api/temporal")?.url).toBe("/docs/solid/temporal/reference");
    expect(redirect("/docs/solid/api/temporal.md")?.url).toBe("/docs/solid/temporal/reference.md");
    // A page one framework has opens in that framework, whichever docs the link was in.
    expect(redirect("/docs/solid/api/react")?.url).toBe("/docs/react/api/components");
    expect(redirect("/docs/react/api/solid")?.url).toBe("/docs/solid/api/components");
  });

  test("every pointer in the sidebar names a page that moved, and leads to it", () => {
    const pointers = sidebarLinks().filter(({ url }) => url.startsWith("/docs"));
    expect(pointers.length).toBeGreaterThan(0);

    for (const { file, url } of pointers) {
      const from = url.slice("/docs/".length);
      expect(Object.keys(movedPages), `${file}: ${url}`).toContain(from);

      const { framework: only, path } = movedTarget(from);
      for (const framework of frameworks) {
        // `lib/source.ts` leaves the pointer out of a sidebar whose docs lack the page.
        if ((only ?? framework) !== framework || !pages[framework].has(path)) continue;
        const target = redirect(docsUrl(framework, from));
        expect(target?.url, `${file}: ${url}`).toBe(docsUrl(framework, path));
        expect(redirect(target?.url ?? ""), `${file}: ${url}`).toBeUndefined();
      }
    }
  });
});

describe("the pages themselves", () => {
  test("no page's address redirects, nor does its Markdown's", () => {
    for (const framework of frameworks) {
      expect(pages[framework].size).toBeGreaterThan(0);
      for (const page of pages[framework]) {
        const url = docsUrl(framework, page);
        expect(redirect(url), url).toBeUndefined();
        expect(redirect(`${url}.md`), `${url}.md`).toBeUndefined();
      }
    }
  });

  test("an address under a framework that is no page stays a missing page", () => {
    expect(redirect("/docs/solid/views/month")).toBeUndefined();
    expect(redirect("/docs/react/not-a-page")).toBeUndefined();
  });

  test("a page's Markdown is at its address with .md added", () => {
    expect(rewrite("/docs/react.md")).toBe("/llms.mdx/docs/react");
    expect(rewrite("/docs/solid.md")).toBe("/llms.mdx/docs/solid");
    expect(rewrite("/docs/react/views/month.md")).toBe("/llms.mdx/docs/react/views/month");
    expect(rewrite("/docs/solid/api/components.md")).toBe("/llms.mdx/docs/solid/api/components");
    expect(rewrite("/docs/react/views/month")).toBeUndefined();
    expect(rewrite("/docs/vue.md")).toBeUndefined();
  });
});
