// @ts-check

/**
 * Where the docs' old addresses lead. `next.config.mjs` turns this into redirects, `lib/source.ts`
 * reads it for the sidebar's pointers to pages that moved, and `tests/docs-routing.test.ts` checks
 * that each address ends on a page that exists.
 *
 * It is plain JavaScript because Node loads the Next.js config as it is. Import it as
 * `#docs-redirects`, the name `package.json` gives it.
 *
 * Until November 2026 the docs had one set of pages at `/docs/<page>`. Now each framework has its
 * own, at `/docs/react/<page>` and `/docs/solid/<page>` (`lib/frameworks.ts`).
 */

/** The cookie that remembers the framework a reader last read; `lib/frameworks.ts` names it too. */
export const frameworkCookie = "docs-framework";

/**
 * Pages that moved inside the docs, old path to new path, both without a framework. A value with
 * a framework in front names the one set that has the page.
 * @type {Readonly<Record<string, string>>}
 */
export const movedPages = {
  "api/ics": "ics/reference",
  "guides/ics": "ics/feed",
  "api/temporal": "temporal/reference",
  "concepts/recurrence": "recurrence/model",
  "guides/recurring-events": "recurrence/calendar",
  "api/recurrence": "recurrence/reference",
  "api/react": "react:api/components",
  "api/solid": "solid:api/components",
};

/**
 * Pages both frameworks have, which the packages' READMEs and npm pages link to without naming a
 * framework: `/docs/ics` opens in the framework the reader last read, and in React otherwise.
 * @type {readonly string[]}
 */
export const sharedEntries = [
  "api",
  "ics",
  "ics/import",
  "ics/reference",
  "temporal",
  "temporal/month-grid",
  "temporal/daylight-saving-time",
  "temporal/reference",
  "recurrence",
  "recurrence/model",
  "recurrence/reference",
];

/**
 * Where an address from before the split leads: `{ framework, path }`, with `framework` undefined
 * when either set has the page.
 * @param {string} path The old path under `/docs`, such as `api/ics`, or `""` for `/docs`.
 * @returns {{ framework: "react" | "solid" | undefined, path: string }}
 */
export function movedTarget(path) {
  const target = movedPages[path] ?? path;
  const [framework, rest] = target.includes(":") ? target.split(":") : [undefined, target];
  return {
    framework: framework === "react" || framework === "solid" ? framework : undefined,
    path: rest ?? "",
  };
}

const frameworkSegment = ":framework(react|solid)";
const rememberedSolid = [
  { type: /** @type {const} */ ("cookie"), key: frameworkCookie, value: "solid" },
];

/** @param {string} path */
const under = (path) => (path === "" ? "" : `/${path}`);

/**
 * The redirects, in the order Next.js tries them.
 *
 * - `/docs` and the shared entries are not pages that moved: they are addresses that pick a
 *   framework, so they redirect temporarily, to the remembered framework or to React.
 * - Every other address without a framework is an old one. Old pages were React's, except the
 *   Solid API page, so they redirect permanently to React's docs. A permanent redirect is cached
 *   by browsers, so it can't depend on the cookie.
 * - A page that moved inside the docs also redirects from its old path under each framework, which
 *   is where the sidebar's pointers lead.
 */
export function docsRedirects() {
  /** @type {import("next/dist/lib/load-custom-routes").Redirect[]} */
  const redirects = [];

  for (const entry of ["", ...sharedEntries]) {
    const source = `/docs${under(entry)}`;
    redirects.push(
      { source, has: rememberedSolid, destination: `/docs/solid${under(entry)}`, permanent: false },
      { source, destination: `/docs/react${under(entry)}`, permanent: false },
    );
  }

  for (const from of Object.keys(movedPages)) {
    const { framework, path } = movedTarget(from);
    for (const suffix of ["", ".md"]) {
      redirects.push({
        source: `/docs/${from}${suffix}`,
        destination: `/docs/${framework ?? "react"}/${path}${suffix}`,
        permanent: true,
      });
      redirects.push({
        source: `/docs/${frameworkSegment}/${from}${suffix}`,
        destination: `/docs/${framework ?? ":framework"}/${path}${suffix}`,
        permanent: true,
      });
    }
  }

  redirects.push(
    { source: "/docs.md", destination: "/docs/react.md", permanent: true },
    // Everything else under /docs that names no framework, `.md` addresses included.
    {
      source: "/docs/:path((?!(?:react|solid)(?:[/.]|$)).+)",
      destination: "/docs/react/:path",
      permanent: true,
    },
  );

  return redirects;
}

/** Each page's Markdown, at the page's own address with `.md` added (`app/llms.mdx`). */
export function docsRewrites() {
  return [
    { source: `/docs/${frameworkSegment}.md`, destination: "/llms.mdx/docs/:framework" },
    {
      source: `/docs/${frameworkSegment}/:path*.md`,
      destination: "/llms.mdx/docs/:framework/:path*",
    },
  ];
}
