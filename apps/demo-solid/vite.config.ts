import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite-plus";

import { solidRegistrySource } from "../../tools/registry/src/solid-source";

export default defineConfig({
  // The page lives at `/solid/` of the React demo's deployment, whose build builds this app into
  // its own `dist/solid` and whose dev server serves it there (apps/demo/vite.config.ts). Alone,
  // `vp dev` here serves it at the same path.
  base: "/solid/",
  // The native compiler, so no Babel. The plugin also adds the `solid` export condition, which
  // makes @ui-sdk/solid resolve to its JSX source and compile with this app's Solid. The agenda is
  // the Solid registry's source, styled with Tailwind as an app that installs it is.
  plugins: [solid(), solidRegistrySource(), tailwindcss()],
  resolve: {
    // The React demo's framework-free modules, which this page shares (`@demo/*`), name the
    // calendar's facade; here it's the Solid one, which re-exports the same engine.
    alias: [
      {
        find: /^@moltenship\/calendar$/u,
        replacement: fileURLToPath(
          new URL("../../packages/calendar-solid/src/index.ts", import.meta.url),
        ),
      },
    ],
    tsconfigPaths: true,
  },
  optimizeDeps: {
    // The plugin keeps @ui-sdk/solid out of the dev prebundle, so the core entries it imports load
    // as they are, while the app's own `@ui-sdk/core` import would be prebundled: two copies of the
    // kernel, whose stores then don't know each other's parts. One copy, unbundled.
    exclude: ["@ui-sdk/core"],
  },
});
