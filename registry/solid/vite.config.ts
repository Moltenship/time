import { availableParallelism } from "node:os";

import solid from "@solidjs/vite-plugin";
import { defaultExclude, defineConfig } from "vite-plus";

import { solidRegistrySource } from "registry/solid-source";

// The Solid registry's tests, a project of the root's `vp test`. solid-js and @solidjs/web export
// their server build to Node, so they're inlined and resolve the browser build, as
// `packages/calendar-solid/vite.config.ts` does.
export default defineConfig({
  plugins: [solid(), solidRegistrySource()],
  resolve: {
    conditions: ["browser", "development"],
    tsconfigPaths: true,
  },
  test: {
    name: "registry-solid",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: defaultExclude,
    server: { deps: { inline: [/solid-js/, /@solidjs\/web/, /@ui-sdk\//] } },
    setupFiles: ["../../tests/setup/paint-timing.ts", "./tests/setup.ts"],
    // A project from a file of its own inherits none of the root's settings; these match it.
    maxWorkers: Math.ceil(availableParallelism() / 2),
    testTimeout: 15_000,
  },
});
