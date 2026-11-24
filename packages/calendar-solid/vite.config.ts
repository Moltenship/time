import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    dts: { generator: "oxc" },
    entry: ["src/index.ts"],
  },
  // solid-js and @solidjs/web export their server build to Node. Vitest hands node_modules to
  // Node as is, so jsdom tests would render with the server runtime: inline them and resolve the
  // browser build in development mode instead.
  resolve: {
    conditions: ["browser", "development"],
  },
  test: {
    server: {
      deps: { inline: [/solid-js/, /@solidjs\/web/, /@ui-sdk\//] },
    },
  },
});
