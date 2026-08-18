import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { staticClient } from "fumadocs-core/search/client/orama-static";

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

  const overview = await fetch(`${origin}/docs`);
  assert.equal(overview.status, 200);
  assert.match(await overview.text(), /Headless calendar contracts/);

  const apiPage = await fetch(`${origin}/docs/api/react`);
  assert.equal(apiPage.status, 200);
  assert.match(await apiPage.text(), /React composition/);

  const missingPage = await fetch(`${origin}/docs/not-a-real-page`);
  assert.equal(missingPage.status, 404);

  const search = staticClient({ from: `${origin}/api/search` });
  const reactResults = await search.search("React composition");
  assert(
    reactResults.some((result) => result.url === "/docs/api/react"),
    "Static search did not return the React API page.",
  );
  const eventResults = await search.search("Events and snapshots");
  assert(
    eventResults.some((result) => result.url === "/docs/api/events"),
    "Static search did not return the events API page.",
  );

  console.log("Verified direct routes, not-found handling, and production static search queries.");
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
