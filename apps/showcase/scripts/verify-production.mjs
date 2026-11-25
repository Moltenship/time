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

// The site names the npm tag of the version it is built with (`lib/install-tag.ts`): `@next` for a
// pre-release, and no tag for a stable version, whose build must not say `@next` anywhere.
const { version } = JSON.parse(
  await readFile(fileURLToPath(import.meta.resolve("@moltenship/calendar/package.json")), "utf8"),
);
const preRelease = version.split("+")[0].includes("-");
const taggedPackage = /@moltenship\/[a-z][a-z-]*@next\b/u;
const preReleaseBlock = /<\/?PreRelease>/u;

function assertInstallTag(text, where) {
  assert.doesNotMatch(text, preReleaseBlock, `${where} kept a pre-release block's tags.`);
  if (preRelease) return;
  // As written, and as read: a highlighted command has each of its words in an element of its own.
  for (const read of [text, text.replace(/<[^>]*>/gu, "")]) {
    assert.doesNotMatch(
      read,
      taggedPackage,
      `${where} installs @next, but the site is built for ${version}, a stable version.`,
    );
  }
}

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

  const landing = await (await fetch(origin)).text();
  assert.match(landing, /The Temporal calendar for React, Solid and AI agents/);
  assertInstallTag(landing, "The landing page");
  assert.equal(
    landing.includes("@moltenship/calendar@next"),
    preRelease,
    `The landing page's install command ${preRelease ? "lacks" : "names"} @next for ${version}.`,
  );

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
  const solidExamples = new Set();
  for (const page of pages) {
    const response = await fetch(`${origin}${page.url}`, { redirect: "manual" });
    assert.equal(response.status, 200, `${page.url} did not render.`);
    const html = await response.text();
    assertInstallTag(html, page.url);
    for (const [, example] of html.matchAll(/<iframe[^>]* src="(\/examples\/solid\/[^"]+)"/g)) {
      solidExamples.add(example.replaceAll("&amp;", "&"));
    }
    const canonical = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
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
    const text = await markdown.text();
    assert.doesNotMatch(text, blockTag, `${page.url}.md kept a framework's block.`);
    assertInstallTag(text, `${page.url}.md`);
    if (page.slug === "installation") {
      assert.equal(
        taggedPackage.test(text),
        preRelease,
        `${page.url}.md ${preRelease ? "installs no" : "installs"} @next for ${version}.`,
      );
    }
  }

  // The live examples of Solid's docs: the page each frame loads, the script it runs, and the
  // example the frame names in it. They are a build of their own (`node --run examples`), so a site
  // built without it would frame a 404.
  assert(solidExamples.size > 0, "No page of Solid's docs frames a live example.");
  for (const example of solidExamples) {
    const frame = await fetch(`${origin}${example}`);
    assert.equal(frame.status, 200, `${example} is not served.`);
    assert.match(frame.headers.get("content-type") ?? "", /^text\/html/);
    const script = /<script type="module"[^>]* src="([^"]+)"/.exec(await frame.text())?.[1];
    assert(script, `${example} runs no script.`);
    const code = await fetch(new URL(script, `${origin}${example}`));
    assert.equal(code.status, 200, `${example} asks for ${script}, which is not served.`);
    assert.match(code.headers.get("content-type") ?? "", /javascript/);
    const name = new URL(example, origin).searchParams.get("example");
    assert(
      (await code.text()).includes(`./${name}.example.tsx`),
      `${example} names an example the build doesn't have.`,
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
  assertInstallTag(llms, "/llms.txt");
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
  // Each framework's registry, at /r and /r/solid, serves every item it lists and its calendar-full.
  for (const path of ["/r", "/r/solid"]) {
    const registry = await fetch(`${origin}${path}/registry.json`);
    assert.equal(registry.status, 200, `${path}/registry.json is not served.`);
    const { items } = await registry.json();
    for (const { name } of items) {
      const item = await fetch(`${origin}${path}/${name}.json`);
      assert.equal(item.status, 200, `${path}/${name}.json is not served.`);
      assert.equal((await item.json()).name, name);
    }
    assert(
      items.some(({ name }) => name === "calendar-full"),
      `The registry at ${path} has no calendar-full item.`,
    );
  }

  console.log(
    `Verified the landing page, every page of the React and Solid docs with its Markdown, canonical address and search, the install commands' npm tag for ${version}, the redirects, the sitemap, the App Router example, the live Solid examples, the React and Solid shadcn registries and not-found handling.`,
  );
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
