import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
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

// Derive routes and titles from the content so copy edits do not break this check.
async function readDocumentationPages() {
  const files = await readdir(contentRoot, { recursive: true });
  return Promise.all(
    files
      .filter((file) => file.endsWith(".mdx"))
      .map(async (file) => {
        const source = await readFile(join(contentRoot, file), "utf8");
        const title = /^---\n[\s\S]*?^title:\s*["']?(.+?)["']?\s*$/m.exec(source)?.[1];
        assert(title, `${file} has no frontmatter title.`);
        const slug = file.replace(/\.mdx$/, "").replace(/(?:^|\/)index$/, "");
        return { title, url: slug === "" ? "/docs" : `/docs/${slug}` };
      }),
  );
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
  assert.match(await landing.text(), /The React calendar built on Temporal/);

  const ogImage = await fetch(`${origin}/opengraph-image`);
  assert.equal(ogImage.status, 200);
  assert.equal(ogImage.headers.get("content-type"), "image/png");

  const missingPage = await fetch(`${origin}/docs/not-a-real-page`);
  assert.equal(missingPage.status, 404);

  const search = staticClient({ from: `${origin}/api/search` });
  for (const page of await readDocumentationPages()) {
    const response = await fetch(`${origin}${page.url}`);
    assert.equal(response.status, 200, `${page.url} did not render.`);

    const results = await search.search(page.title);
    assert(
      results.some((result) => result.url === page.url),
      `Static search for "${page.title}" did not return ${page.url}.`,
    );
  }

  // The App Router example renders on request: the URL's range, in the cookie's time zone.
  const example = await fetch(`${origin}/examples/nextjs?view=day&date=2026-10-14`, {
    headers: { cookie: "time-zone=Asia/Tokyo" },
  });
  assert.equal(example.status, 200, "/examples/nextjs did not render.");
  const exampleHtml = await example.text();
  assert.match(exampleHtml, /October 14, 2026/);
  assert.match(exampleHtml, /Asia\/Tokyo/);

  console.log(
    "Verified the landing page, every docs route, the App Router example, not-found handling, and static search.",
  );
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
