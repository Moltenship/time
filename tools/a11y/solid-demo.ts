import { fileURLToPath } from "node:url";

import { createServer, type Plugin, type ViteDevServer } from "vite-plus";

const solidRoot = fileURLToPath(new URL("../../apps/demo-solid", import.meta.url));
const solidBase = "/solid/";

/**
 * The Solid demo at `/solid/` of the test server, as the demo's dev server has it
 * (apps/demo/vite.config.ts): a Vite server of its own, with its own config, which compiles Solid,
 * in middleware mode. The demo's tests load it in a frame, beside the React demo's pages.
 */
export function solidDemo(): Plugin {
  let solidServer: ViteDevServer | undefined;
  return {
    name: "a11y:solid-demo",
    async configureServer(server) {
      solidServer = await createServer({
        // Its own dependency cache, apart from the demo's dev server's.
        cacheDir: fileURLToPath(new URL("node_modules/.vite-solid-demo", import.meta.url)),
        configFile: `${solidRoot}/vite.config.ts`,
        logLevel: "warn",
        root: solidRoot,
        server: { hmr: false, middlewareMode: true, ws: false },
      });
      server.httpServer?.once("close", () => void solidServer?.close());
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?", 1)[0];
        if (path === "/solid" || path?.startsWith(solidBase) === true) {
          solidServer?.middlewares(request, response, next);
        } else {
          next();
        }
      });
    },
    async buildEnd() {
      await solidServer?.close();
    },
  };
}
