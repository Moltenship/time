import { availableParallelism } from "node:os";

import solid from "@solidjs/vite-plugin";
import { defaultExclude, defineConfig } from "vite-plus";

// The docs' Solid samples, mounted: a project of the root's `vp test`. The samples are type-checked
// where they are shown; this compiles them with Solid's plugin, as a reader's app does, and renders
// them. solid-js and @solidjs/web export their server build to Node, so they're inlined and resolve
// the browser build, as `packages/calendar-solid/vite.config.ts` does.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ["browser", "development"],
  },
  test: {
    name: "solid-samples",
    include: ["*.test.tsx"],
    exclude: defaultExclude,
    environment: "jsdom",
    server: { deps: { inline: [/solid-js/, /@solidjs\/web/, /@ui-sdk\//] } },
    setupFiles: ["../../../../../../tests/setup/paint-timing.ts"],
    // A project from a file of its own inherits none of the root's settings; these match it.
    maxWorkers: Math.ceil(availableParallelism() / 2),
    testTimeout: 15_000,
  },
});
