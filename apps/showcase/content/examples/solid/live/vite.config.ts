import solid from "@solidjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite-plus";

// The live examples of Solid's docs: the samples in the folder above, built into one static page
// that the docs site serves from `public/examples/solid/` and shows in an iframe
// (`components/solid-example.tsx`). `docs/internal/solid-examples.md` says how to add one.
export default defineConfig({
  base: "/examples/solid/",
  plugins: [solid(), tailwindcss()],
  resolve: {
    // The samples import the registry's files where `shadcn add` puts them; `../tsconfig.json`
    // maps those to `registry/solid` and `registry/shared`.
    tsconfigPaths: true,
    // The registry's shared files import the facade as `@moltenship/calendar`, which the Solid
    // registry's build rewrites to the Solid package (ADR 0279, point 3). This does the same.
    alias: [{ find: /^@moltenship\/calendar$/u, replacement: "@moltenship/calendar-solid" }],
    // What the registry's files import resolves from this app, so one copy of each loads. In the
    // release gate's copy of the site, `registry/solid` has no packages of its own.
    dedupe: [
      "@moltenship/calendar-solid",
      "@solidjs/web",
      "@ui-sdk/core",
      "@ui-sdk/solid",
      "class-variance-authority",
      "cn",
      "solid-js",
    ],
  },
  build: {
    outDir: "../../../../public/examples/solid",
    emptyOutDir: true,
    // Chromium and Firefox ship Temporal, and the entry awaits the polyfill where it's missing.
    target: "esnext",
  },
});
