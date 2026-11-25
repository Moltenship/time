import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { staticClient } from "fumadocs-core/search/client/orama-static";

const contentRoot = fileURLToPath(new URL("../content/docs", import.meta.url));

const host = "127.0.0.1";
const port = Number(process.env.SHOWCASE_PORT ?? 4318);
const origin = `http://${host}:${port}`;
const nextBinary = fileURLToPath(import.meta.resolve("next/dist/bin/next"));
const server = spawn(
  process.execPath,
  [nextBinary, "start", "--hostname", host, "--port", String(port)],
  {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
server.stdout.on("data", (chunk) => {
  output += chunk;
});
server.stderr.on("data", (chunk) => {
  output += chunk;
});

const frameworks = ["react", "solid"];
const blockTag = /<\/?(?:React|Solid)>/u;

// Derive routes and titles from the content so copy edits do not break this check. A file's name
// says which framework's docs have the page (`lib/source.ts`): `page.solid.mdx` is Solid's alone,
// and a file without a framework is a page of both.
async function readDocumentationPages() {
  const files = await readdir(contentRoot, { recursive: true });
  const pages = await Promise.all(
    files
      .filter((file) => file.endsWith(".mdx"))
      .map(async (file) => {
        const source = await readFile(join(contentRoot, file), "utf8");
        const title = /^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m.exec(source)?.[1];
        assert(title, `${file} has no frontmatter title.`);
        const only = /\.(react|solid)\.mdx$/.exec(file)?.[1];
        const slug = file
          .split(sep)
          .join("/")
          .replace(/(?:\.(?:react|solid))?\.mdx$/, "")
          .replace(/(?:^|\/)index$/, "");
        // A shared page with no block for either framework reads the same in both sets.
        const same = only === undefined && !blockTag.test(source);
        return frameworks
          .filter((framework) => only === undefined || only === framework)
          .map((framework) => ({
            title,
            framework,
            slug,
            url: docsUrl(framework, slug),
            canonical: docsUrl(same ? "react" : framework, slug),
          }));
      }),
  );
  return pages.flat();
}

function docsUrl(framework, slug) {
  return slug === "" ? `/docs/${framework}` : `/docs/${framework}/${slug}`;
}

// A redirect as the server sends it: its status, and where it leads.
async function redirectOf(path, cookie) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    headers: cookie === undefined ? {} : { cookie },
  });
  const location = response.headers.get("location");
  return {
    status: response.status,
    location: location === null ? null : new URL(location, origin).pathname,
  };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js exited before readiness.\n${output}`);
    }

    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // The socket is expected to refuse connections until Next.js is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for Next.js.\n${output}`);
}

try {
  await waitForServer();

  const landing = await fetch(origin);
  assert.match(await landing.text(), /The Temporal calendar for React, Solid and AI agents/);

  const ogImage = await fetch(`${origin}/opengraph-image`);
  assert.equal(ogImage.status, 200);
  assert.equal(ogImage.headers.get("content-type"), "image/png");

  // An address without a framework redirects into React's docs, where no such page exists either.
  const missingPage = await fetch(`${origin}/docs/not-a-real-page`);
  assert.equal(missingPage.status, 404);
  const missingInFramework = await fetch(`${origin}/docs/solid/not-a-real-page`);
  assert.equal(missingInFramework.status, 404);

  const pages = await readDocumentationPages();
  const searches = Object.fromEntries(
    frameworks.map((framework) => [
      framework,
      staticClient({ from: `${origin}/api/search`, tag: framework }),
    ]),
  );
  for (const page of pages) {
    const response = await fetch(`${origin}${page.url}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${page.url} did not render.`);
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(await response.text())?.[1];
    assert.equal(
      canonical === undefined ? undefined : new URL(canonical).pathname,
      page.canonical,
      `${page.url} names another canonical address.`,
    );

    // Each framework's search finds its own pages, and none of the other's.
    const results = await searches[page.framework].search(page.title);
    assert(
      results.some((result) => result.url === page.url),
      `Static search for "${page.title}" in ${page.framework}'s docs did not return ${page.url}.`,
    );
    assert(
      results.every((result) => result.url.startsWith(`/docs/${page.framework}`)),
      `Static search in ${page.framework}'s docs returned another framework's page.`,
    );

    const markdown = await fetch(`${origin}${page.url}.md`, { redirect: "manual" });
    assert.equal(markdown.status, 200, `${page.url}.md did not render.`);
    assert.match(markdown.headers.get("content-type") ?? "", /^text\/markdown/);
    // The Markdown is one framework's text: no block for either is left in it.
    assert.doesNotMatch(
      await markdown.text(),
      blockTag,
      `${page.url}.md kept a framework's block.`,
    );
  }

  // A page one framework's docs lack is a missing page there, not a redirect to the other's.
  for (const framework of frameworks) {
    const own = new Set(pages.filter((page) => page.framework === framework).map((p) => p.slug));
    const lacking = pages.find((page) => page.framework !== framework && !own.has(page.slug));
    if (lacking === undefined) continue;
    const response = await fetch(`${origin}${docsUrl(framework, lacking.slug)}`);
    assert.equal(response.status, 404, `${docsUrl(framework, lacking.slug)} should not exist.`);
  }

  // Addresses that name no framework (`docs-redirects.mjs`): `/docs` and the pages both sets have
  // open in the framework the reader last read, and every older address leads to React's page.
  const solidReader = "docs-framework=solid";
  assert.deepEqual(await redirectOf("/docs"), { status: 307, location: "/docs/react" });
  assert.deepEqual(await redirectOf("/docs", solidReader), {
    status: 307,
    location: "/docs/solid",
  });
  assert.deepEqual(await redirectOf("/docs/ics", solidReader), {
    status: 307,
    location: "/docs/solid/ics",
  });
  assert.deepEqual(await redirectOf("/docs/quick-start", solidReader), {
    status: 308,
    location: "/docs/react/quick-start",
  });
  assert.deepEqual(await redirectOf("/docs/quick-start.md"), {
    status: 308,
    location: "/docs/react/quick-start.md",
  });
  assert.deepEqual(await redirectOf("/docs/api/ics"), {
    status: 308,
    location: "/docs/react/ics/reference",
  });
  assert.deepEqual(await redirectOf("/docs/api/solid"), {
    status: 308,
    location: "/docs/solid/api/components",
  });
  assert.deepEqual(await redirectOf("/docs/solid/api/temporal"), {
    status: 308,
    location: "/docs/solid/temporal/reference",
  });

  // The sitemap lists each page once, at its canonical address.
  const sitemap = await (await fetch(`${origin}/sitemap.xml`)).text();
  const listed = new Set(
    [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => new URL(url).pathname),
  );
  for (const page of pages) {
    assert.equal(
      listed.has(page.url),
      page.url === page.canonical,
      `The sitemap ${page.url === page.canonical ? "lacks" : "lists"} ${page.url}.`,
    );
  }

  // The index for agents lists both sets, each page by its Markdown.
  const llms = await (await fetch(`${origin}/llms.txt`)).text();
  for (const framework of frameworks) {
    const page = pages.find((entry) => entry.framework === framework && entry.slug !== "");
    assert(page, `${framework}'s docs have no page.`);
    assert(llms.includes(`${page.url}.md`), `/llms.txt does not list ${page.url}.md.`);
  }

  // The App Router example renders on request: the URL's range, in the cookie's time zone.
  const example = await fetch(`${origin}/examples/nextjs?view=day&date=2026-10-14`, {
    headers: { cookie: "time-zone=Asia/Tokyo" },
  });
  assert.equal(example.status, 200, "/examples/nextjs did not render.");
  const exampleHtml = await example.text();
  assert.match(exampleHtml, /October 14, 2026/);
  assert.match(exampleHtml, /Asia\/Tokyo/);

  // The shadcn registry the build wrote to public/r, as `npx shadcn add <url>` fetches it.
  const registry = await fetch(`${origin}/r/registry.json`);
  assert.equal(registry.status, 200, "/r/registry.json is not served.");
  const { items } = await registry.json();
  for (const { name } of items) {
    const item = await fetch(`${origin}/r/${name}.json`);
    assert.equal(item.status, 200, `/r/${name}.json is not served.`);
    assert.equal((await item.json()).name, name);
  }
  assert(
    items.some(({ name }) => name === "calendar-full"),
    "The registry has no calendar-full item.",
  );

  console.log(
    "Verified the landing page, every page of the React and Solid docs with its Markdown, canonical address and search, the redirects, the sitemap, the App Router example, the shadcn registry and not-found handling.",
  );
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
