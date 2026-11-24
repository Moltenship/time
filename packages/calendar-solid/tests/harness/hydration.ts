import { fileURLToPath } from "node:url";

import { generateHydrationScript } from "@solidjs/web";
import { JSDOM } from "jsdom";
import { createServer, createServerModuleRunner, type ViteDevServer } from "vite-plus";

// What Solid and ui-sdk read from the page while hydrating and handling events.
const browserGlobals = [
  "window",
  "document",
  "navigator",
  "Node",
  "Text",
  "Comment",
  "Element",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "SVGElement",
  "DocumentFragment",
  "ShadowRoot",
  "Event",
  "CustomEvent",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "PointerEvent",
  "MutationObserver",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

export interface HydrationPage {
  readonly container: HTMLElement;
  readonly window: Window;
  /** Imports a module with Solid's browser build, as the page would. */
  load<T>(path: string): Promise<T>;
  close(): Promise<void>;
}

/**
 * Puts server HTML in a page and loads the client's modules into it, in a test that renders on the
 * server. The test file runs in Node, so `@solidjs/web` is the server build there; the page's
 * modules go through their own Vite runner, which resolves the browser build. Both builds stay in
 * one process, and the page's globals are set only after the server render.
 */
export async function createHydrationPage(html: string): Promise<HydrationPage> {
  const dom = new JSDOM(
    `<!doctype html><html><head>${generateHydrationScript()}</head><body><div id="root">${html}</div></body></html>`,
    { runScripts: "dangerously", pretendToBeVisual: true },
  );
  const view = dom.window as unknown as Record<string, unknown>;
  const globals = globalThis as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const key of [...browserGlobals, "_$HY"]) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    const value = view[key];
    Object.defineProperty(globals, key, {
      configurable: true,
      writable: true,
      value:
        typeof value === "function" && /^[a-z]/.test(key)
          ? (value as (...args: unknown[]) => unknown).bind(dom.window)
          : value,
    });
  }

  let server: ViteDevServer | undefined;
  try {
    server = await createServer({
      configFile: false,
      root: fileURLToPath(new URL("../..", import.meta.url)),
      logLevel: "error",
      appType: "custom",
      server: { middlewareMode: true, hmr: false, ws: false },
      environments: {
        ssr: {
          resolve: {
            conditions: ["browser", "development"],
            externalConditions: ["browser", "development"],
            noExternal: true,
          },
        },
      },
    });
  } catch (error) {
    restore();
    throw error;
  }
  const runner = createServerModuleRunner(server.environments.ssr, { hmr: false });

  function restore() {
    for (const [key, descriptor] of previous) {
      if (descriptor === undefined) Reflect.deleteProperty(globals, key);
      else Object.defineProperty(globals, key, descriptor);
    }
  }

  return {
    container: dom.window.document.getElementById("root")!,
    window: dom.window as unknown as Window,
    load: (path) => runner.import(path),
    async close() {
      await runner.close();
      await server.close();
      restore();
      dom.window.close();
    },
  };
}
