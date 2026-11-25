import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import stylex from "@stylexjs/unplugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { build, createServer, defineConfig, type Plugin, type ViteDevServer } from "vite-plus";

const fromHere = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/** The Solid demo, a separate app with its own config: only it compiles Solid (architecture.md). */
const solidRoot = fromHere("../demo-solid");
const solidConfigFile = resolve(solidRoot, "vite.config.ts");
const solidBase = "/solid/";

/**
 * Puts the Solid demo at `/solid/` of this one, so one deployment has both frameworks. A build
 * builds it into `dist/solid` once this one's bundle is written, whatever starts the build: `vp
 * build` here, as the deployment runs it, or `vp run demo#build`. The dev server hands `/solid/`
 * to a Solid dev server of its own, in middleware mode, sharing this one's port for its HMR. A
 * server without a port of its own (in middleware mode itself) skips it: run `vp dev` in
 * apps/demo-solid for the Solid page then.
 */
function solidDemo(): Plugin {
  let outDir = "";
  let solidServer: ViteDevServer | undefined;
  return {
    name: "demo:solid",
    // Vitest serves too, but has no use for the Solid page.
    apply: (_, { mode }) => mode !== "test",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle(error) {
      if (this.environment.config.command !== "build" || error !== undefined) return;
      await build({
        build: { emptyOutDir: true, outDir: resolve(outDir, "solid") },
        configFile: solidConfigFile,
        mode: this.environment.config.mode,
        root: solidRoot,
      });
    },
    async configureServer(server) {
      const { httpServer } = server;
      if (httpServer === null) return;
      solidServer = await createServer({
        configFile: solidConfigFile,
        root: solidRoot,
        server: { hmr: { server: httpServer }, middlewareMode: true },
      });
      httpServer.once("close", () => void solidServer?.close());
      // Before this server's own middlewares, whose SPA fallback would answer `/solid/` itself.
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?", 1)[0];
        if (path === "/solid" || path?.startsWith(solidBase) === true) {
          solidServer?.middlewares(request, response, next);
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [
    // Before React, and only over the files of the `/stylex/` page that import StyleX.
    stylex.vite({
      aliases: { "@registry/*": [fromHere("../../registry/*")] },
      // Into the `/stylex/` page's stylesheet, not the Tailwind page's.
      cssInjectionTarget: (fileName: string) => /(?:^|\/)stylex-[^/]+\.css$/u.test(fileName),
      dev: command === "serve",
      // Astryx's tokens use `light-dark()`, which older targets would lower, breaking its themes.
      lightningcssOptions: {
        targets: { chrome: 123 << 16, firefox: 120 << 16, safari: (17 << 16) | (5 << 8) },
      },
      runtimeInjection: false,
      unstable_moduleResolution: { rootDir: fromHere("../.."), type: "commonJS" },
    }),
    react(),
    tailwindcss(),
    solidDemo(),
  ],
  build: {
    cssTarget: ["chrome123", "firefox120", "safari17.5"],
    rollupOptions: {
      // Two pages, so neither loads the other's global CSS: Tailwind's, and Astryx's.
      input: { main: fromHere("index.html"), stylex: fromHere("stylex/index.html") },
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    include: ["tests/**/*.test.{ts,tsx}"],
  },
}));
